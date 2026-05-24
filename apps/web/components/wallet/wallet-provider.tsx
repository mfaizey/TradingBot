"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from "react";
import { useAccount, useConnect, useDisconnect, useReconnect, useSwitchChain, useWatchBlockNumber } from "wagmi";
import type { Connector } from "wagmi";
import { formatUnits } from "viem";

import { discoverEip6963Providers, type Eip6963ProviderDetail, type EIP1193Provider } from "@/lib/wallet/eip6963";
import { pollTransactionReceipt, requestValidatedPersonalSign } from "@/lib/wallet/security";
import { initialWalletMachineState, walletMachineReducer, type WalletError, type WalletLifecycleState } from "@/lib/wallet/state-machine";
import { chainLabels, supportedChains } from "@/lib/wagmi";

type WalletChoice = "metamask" | "walletconnect" | "trust" | "coinbase" | "injected";

type WalletContextValue = {
  lifecycle: WalletLifecycleState;
  activeConnectorName: string | null;
  address: string | null;
  truncatedAddress: string | null;
  chainId: number | null;
  chainName: string | null;
  isWrongChain: boolean;
  nativeBalance: string | null;
  nativeBalanceUsd: string | null;
  nativeSymbol: string | null;
  error: WalletError | null;
  eip6963Providers: Eip6963ProviderDetail[];
  connectWallet: (choice: WalletChoice) => Promise<void>;
  switchToRequiredChain: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  retryLastAction: () => Promise<void>;
  clearError: () => void;
  copyAddress: () => Promise<boolean>;
  isSameDeviceQrAttempt: boolean;
  requestSignature: (message: string, nonce: string) => Promise<string>;
  trackTransaction: (transactionHash: string) => Promise<unknown>;
};

const LAST_WALLET_KEY = "wallet:last-used-type";
const LAST_CHAIN_KEY = "wallet:last-used-chain-id";
const LAST_TRUNCATED_ADDRESS_KEY = "wallet:last-truncated-address";
const REQUIRED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_REQUIRED_CHAIN_ID ?? 1);

const WalletContext = createContext<WalletContextValue | null>(null);

function withTimeout<T>(promise: Promise<T>, timeoutMs = 10_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error("RPC request timed out after 10 seconds."));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeout);
        resolve(value);
      })
      .catch((error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      });
  });
}

function sanitizeText(value: unknown, fallback = "Unknown"): string {
  if (typeof value !== "string") return fallback;
  return value.replace(/[<>]/g, "").slice(0, 200);
}

function sanitizeHexAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? value : null;
}

function truncateAddress(address: string | null): string | null {
  if (!address) return null;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function mapWalletError(error: unknown): WalletError {
  const message = error instanceof Error ? error.message : "Unexpected wallet error.";
  const maybeCode = (error as { code?: number } | undefined)?.code;

  if (maybeCode === 4001) {
    return {
      code: "USER_REJECTED_CONNECTION",
      message: "Request rejected in wallet.",
      dismissible: true
    };
  }
  if (/timeout/i.test(message)) {
    return { code: "RPC_TIMEOUT", message, dismissible: true };
  }
  if (/insufficient funds/i.test(message)) {
    return { code: "INSUFFICIENT_FUNDS", message: "Insufficient gas funds to execute this transaction." };
  }
  return { code: "UNKNOWN", message };
}

function getSymbolFromChain(chainId: number): string {
  const chain = supportedChains.find((candidate) => candidate.id === chainId);
  return chain?.nativeCurrency.symbol ?? "ETH";
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [machineState, dispatchMachine] = useReducer(walletMachineReducer, initialWalletMachineState);
  const [eip6963Providers, setEip6963Providers] = useState<Eip6963ProviderDetail[]>([]);
  const [nativeBalance, setNativeBalance] = useState<string | null>(null);
  const [nativeBalanceUsd, setNativeBalanceUsd] = useState<string | null>(null);
  const [activeConnectorName, setActiveConnectorName] = useState<string | null>(null);
  const [isSameDeviceQrAttempt, setIsSameDeviceQrAttempt] = useState(false);
  const retryRef = useRef<(() => Promise<void>) | null>(null);
  const [reconnectSettled, setReconnectSettled] = useState(false);
  const currentProviderRef = useRef<EIP1193Provider | null>(null);

  const { address, chain, connector } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { reconnectAsync } = useReconnect();

  const setError = useCallback((error: WalletError) => {
    dispatchMachine({ type: "ERROR", error });
  }, []);

  const clearError = useCallback(() => {
    dispatchMachine({ type: "CLEAR_ERROR" });
  }, []);

  const isWrongChain = Boolean(address && chain?.id && chain.id !== REQUIRED_CHAIN_ID);
  const chainName = chain ? chainLabels[chain.id] ?? sanitizeText(chain.name, `Chain ${chain.id}`) : null;
  const normalizedAddress = sanitizeHexAddress(address);
  const truncatedAddress = truncateAddress(normalizedAddress);

  const resolveProvider = useCallback(async (nextConnector?: Connector): Promise<EIP1193Provider | null> => {
    const effectiveConnector = nextConnector ?? connector;
    if (!effectiveConnector) return null;
    const provider = (await effectiveConnector.getProvider()) as EIP1193Provider | null;
    currentProviderRef.current = provider;
    return provider;
  }, [connector]);

  const refreshBalance = useCallback(async () => {
    if (!normalizedAddress) {
      setNativeBalance(null);
      setNativeBalanceUsd(null);
      return;
    }
    const provider = await resolveProvider();
    if (!provider) return;

    try {
      const chainIdHex = (await withTimeout(
        provider.request({
          method: "eth_chainId"
        }) as Promise<string>
      )) as string;
      const chainId = Number.parseInt(chainIdHex, 16);
      const balanceHex = (await withTimeout(
        provider.request({
          method: "eth_getBalance",
          params: [normalizedAddress, "latest"]
        }) as Promise<string>
      )) as string;

      const wei = BigInt(balanceHex);
      const symbol = getSymbolFromChain(chainId);
      const formatted = Number(formatUnits(wei, 18)).toFixed(4);
      setNativeBalance(`${formatted} ${symbol}`);

      const priceResponse = await withTimeout(
        fetch(`https://api.coinbase.com/v2/prices/${symbol}-USD/spot`)
      );
      const priceJson = (await priceResponse.json()) as { data?: { amount?: string } };
      const usdPrice = Number(priceJson.data?.amount ?? "0");
      const usdValue = (Number(formatted) * usdPrice).toFixed(2);
      setNativeBalanceUsd(`$${usdValue}`);
    } catch (error) {
      setError(mapWalletError(error));
    }
  }, [normalizedAddress, resolveProvider, setError]);

  const switchToRequiredChain = useCallback(async () => {
    if (!connector) return;
    dispatchMachine({ type: "CHAIN_SWITCH_REQUEST" });

    try {
      await switchChainAsync({ chainId: REQUIRED_CHAIN_ID });
      dispatchMachine({ type: "CHAIN_SWITCH_SUCCESS" });
      localStorage.setItem(LAST_CHAIN_KEY, String(REQUIRED_CHAIN_ID));
    } catch (error) {
      const provider = await resolveProvider(connector);
      const requiredChain = supportedChains.find((item) => item.id === REQUIRED_CHAIN_ID);
      const e = error as { code?: number; message?: string };
      if (e.code === 4902 && provider && requiredChain) {
        try {
          await withTimeout(
            provider.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: `0x${requiredChain.id.toString(16)}`,
                  chainName: requiredChain.name,
                  rpcUrls: [requiredChain.rpcUrls.default.http[0]],
                  nativeCurrency: requiredChain.nativeCurrency,
                  blockExplorerUrls: requiredChain.blockExplorers?.default
                    ? [requiredChain.blockExplorers.default.url]
                    : []
                }
              ]
            })
          );
          await switchChainAsync({ chainId: REQUIRED_CHAIN_ID });
          dispatchMachine({ type: "CHAIN_SWITCH_SUCCESS" });
          return;
        } catch (nestedError) {
          setError({
            code: "CHAIN_SWITCH_FAILED",
            message: mapWalletError(nestedError).message
          });
          return;
        }
      }
      if (e.code === 4001) {
        setError({
          code: "USER_REJECTED_CHAIN_SWITCH",
          message: "Chain switch rejected. Some features may be limited.",
          dismissible: true
        });
        return;
      }
      setError({
        code: "CHAIN_SWITCH_FAILED",
        message: "Unable to switch to the required network."
      });
    }
  }, [connector, resolveProvider, setError, switchChainAsync]);

  const getConnectorForChoice = useCallback(
    (choice: WalletChoice): Connector | undefined => {
      if (choice === "metamask") {
        return (
          connectors.find((item) => item.id === "metaMaskSDK") ??
          connectors.find((item) => item.id === "metaMask")
        );
      }
      if (choice === "coinbase") return connectors.find((item) => item.id === "coinbaseWalletSDK");
      if (choice === "walletconnect" || choice === "trust") return connectors.find((item) => item.id === "walletConnect");
      return connectors.find((item) => item.id === "injected");
    },
    [connectors]
  );

  const connectWallet = useCallback(async (choice: WalletChoice) => {
    dispatchMachine({ type: "CONNECT_REQUEST" });
    retryRef.current = () => connectWallet(choice);
    setIsSameDeviceQrAttempt(false);

    const selectedConnector = getConnectorForChoice(choice);
    if (!selectedConnector) {
      setError({ code: "UNKNOWN", message: "Selected wallet connector is unavailable." });
      return;
    }

    try {
      if (choice === "walletconnect" && /Mobi|Android/i.test(navigator.userAgent)) {
        setIsSameDeviceQrAttempt(true);
      }

      await connectAsync({ connector: selectedConnector });
      const provider = await resolveProvider(selectedConnector);
      if (provider) {
        const accounts = (await withTimeout(
          provider.request({ method: "eth_accounts" }) as Promise<unknown[]>
        )) as unknown[];
        const first = sanitizeHexAddress(accounts[0]);
        if (!first) {
          setError({
            code: "WALLET_LOCKED",
            message: "Wallet appears locked. Unlock it and retry.",
            dismissible: true
          });
          return;
        }
      }

      setActiveConnectorName(selectedConnector.name);
      localStorage.setItem(LAST_WALLET_KEY, choice);
      if (truncatedAddress) localStorage.setItem(LAST_TRUNCATED_ADDRESS_KEY, truncatedAddress);
      dispatchMachine({ type: "CONNECT_SUCCESS" });
    } catch (error) {
      setError(mapWalletError(error));
    }
  }, [connectAsync, getConnectorForChoice, resolveProvider, setError, truncatedAddress]);

  const disconnectWallet = useCallback(async () => {
    try {
      await disconnectAsync();
      if (currentProviderRef.current?.request) {
        await Promise.resolve(
          currentProviderRef.current.request({
            method: "wallet_disconnect"
          })
        ).catch(() => undefined);
      }
    } finally {
      localStorage.removeItem(LAST_WALLET_KEY);
      localStorage.removeItem(LAST_CHAIN_KEY);
      localStorage.removeItem(LAST_TRUNCATED_ADDRESS_KEY);
      setNativeBalance(null);
      setNativeBalanceUsd(null);
      setActiveConnectorName(null);
      dispatchMachine({ type: "DISCONNECT" });
    }
  }, [disconnectAsync]);

  const retryLastAction = useCallback(async () => {
    if (!retryRef.current) return;
    await retryRef.current();
  }, []);

  const copyAddress = useCallback(async () => {
    if (!normalizedAddress) return false;
    await navigator.clipboard.writeText(normalizedAddress);
    return true;
  }, [normalizedAddress]);

  const requestSignature = useCallback(async (message: string, nonce: string) => {
    if (!normalizedAddress) throw new Error("No connected wallet address.");
    const provider = await resolveProvider();
    if (!provider) throw new Error("No wallet provider found.");
    const signature = await requestValidatedPersonalSign({
      provider,
      message,
      nonce,
      address: normalizedAddress
    });
    return String(signature);
  }, [normalizedAddress, resolveProvider]);

  const trackTransaction = useCallback(async (transactionHash: string) => {
    const provider = await resolveProvider();
    if (!provider) throw new Error("No wallet provider found.");
    return pollTransactionReceipt({
      provider,
      transactionHash
    });
  }, [resolveProvider]);

  useEffect(() => {
    const teardown = discoverEip6963Providers((detail) => {
      setEip6963Providers((current) => [...current, detail]);
    });
    return teardown;
  }, []);

  useEffect(() => {
    setReconnectSettled(false);
    dispatchMachine({ type: "RECONNECT_REQUEST" });
    retryRef.current = async () => {
      setReconnectSettled(false);
      dispatchMachine({ type: "RECONNECT_REQUEST" });
      await reconnectAsync();
      setReconnectSettled(true);
    };

    reconnectAsync()
      .catch((error) => setError(mapWalletError(error)))
      .finally(() => {
        setReconnectSettled(true);
      });
  }, [reconnectAsync, setError]);

  useEffect(() => {
    if (address && connector) {
      setActiveConnectorName(connector.name);
      if (machineState.lifecycle === "RECONNECTING" || machineState.lifecycle === "CONNECTING") {
        dispatchMachine({ type: "CONNECT_SUCCESS" });
      } else if (machineState.lifecycle === "DISCONNECTED") {
        dispatchMachine({ type: "RECONNECT_SUCCESS" });
      }
      return;
    }

    if (!address && reconnectSettled && machineState.lifecycle === "RECONNECTING") {
      dispatchMachine({ type: "DISCONNECT" });
      return;
    }

    if (
      !address &&
      (machineState.lifecycle === "CONNECTED" || machineState.lifecycle === "SWITCHING_CHAIN")
    ) {
      dispatchMachine({ type: "DISCONNECT" });
    }
  }, [address, connector, machineState.lifecycle, reconnectSettled]);

  useEffect(() => {
    if (!normalizedAddress) return;
    localStorage.setItem(LAST_TRUNCATED_ADDRESS_KEY, truncateAddress(normalizedAddress) ?? "");
  }, [normalizedAddress]);

  useEffect(() => {
    if (!address || !connector) return;

    let mounted = true;
    let removeAccounts: (() => void) | undefined;
    let removeChain: (() => void) | undefined;
    let removeDisconnect: (() => void) | undefined;

    void (async () => {
      const provider = await resolveProvider(connector);
      if (!provider || !mounted) return;

      const onAccountsChanged = (accounts: unknown[]) => {
        const nextAddress = sanitizeHexAddress(accounts[0]);
        if (!nextAddress) {
          setError({
            code: "SESSION_EXPIRED",
            message: "No active account found. Reconnect your wallet.",
            dismissible: true
          });
          void disconnectWallet();
          return;
        }
        void refreshBalance();
      };
      const onChainChanged = () => {
        void refreshBalance();
      };
      const onDisconnect = () => {
        setError({
          code: "SESSION_EXPIRED",
          message: "Wallet session ended. Please reconnect.",
          dismissible: true
        });
        void disconnectWallet();
      };

      provider.on?.("accountsChanged", onAccountsChanged);
      provider.on?.("chainChanged", onChainChanged);
      provider.on?.("disconnect", onDisconnect);

      removeAccounts = () => provider.removeListener?.("accountsChanged", onAccountsChanged);
      removeChain = () => provider.removeListener?.("chainChanged", onChainChanged);
      removeDisconnect = () => provider.removeListener?.("disconnect", onDisconnect);
    })();

    return () => {
      mounted = false;
      removeAccounts?.();
      removeChain?.();
      removeDisconnect?.();
    };
  }, [address, connector, disconnectWallet, refreshBalance, resolveProvider, setError]);

  useEffect(() => {
    if (!address) return;
    void refreshBalance();
    const interval = window.setInterval(() => {
      void refreshBalance();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [address, refreshBalance]);

  useWatchBlockNumber({
    enabled: Boolean(address),
    onBlockNumber: () => {
      void refreshBalance();
    }
  });

  useEffect(() => {
    if (!address) return;
    if (isWrongChain) {
      retryRef.current = switchToRequiredChain;
      void switchToRequiredChain();
    }
  }, [address, isWrongChain, switchToRequiredChain]);

  const value = useMemo<WalletContextValue>(
    () => ({
      lifecycle: machineState.lifecycle,
      activeConnectorName,
      address: normalizedAddress,
      truncatedAddress,
      chainId: chain?.id ?? null,
      chainName,
      isWrongChain,
      nativeBalance,
      nativeBalanceUsd,
      nativeSymbol: chain ? getSymbolFromChain(chain.id) : null,
      error: machineState.error,
      eip6963Providers,
      connectWallet,
      switchToRequiredChain,
      disconnectWallet,
      retryLastAction,
      clearError,
      copyAddress,
      isSameDeviceQrAttempt,
      requestSignature,
      trackTransaction
    }),
    [
      machineState.lifecycle,
      machineState.error,
      activeConnectorName,
      normalizedAddress,
      truncatedAddress,
      chain,
      chainName,
      isWrongChain,
      nativeBalance,
      nativeBalanceUsd,
      eip6963Providers,
      connectWallet,
      switchToRequiredChain,
      disconnectWallet,
      retryLastAction,
      clearError,
      copyAddress,
      isSameDeviceQrAttempt,
      requestSignature,
      trackTransaction
    ]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within WalletProvider.");
  }
  return context;
}
