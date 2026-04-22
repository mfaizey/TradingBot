"use client";

import { Check, Copy, Loader2, Plug, TriangleAlert, Unplug, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useWallet } from "@/components/wallet/wallet-provider";

const appStoreLinks: Record<string, string> = {
  trust: "https://apps.apple.com/app/trust-crypto-bitcoin-wallet/id1288339409",
  metamask: "https://metamask.io/download/",
  coinbase: "https://www.coinbase.com/wallet/downloads"
};

export function WalletPanel() {
  const {
    lifecycle,
    activeConnectorName,
    truncatedAddress,
    chainName,
    isWrongChain,
    nativeBalance,
    nativeBalanceUsd,
    error,
    eip6963Providers,
    connectWallet,
    switchToRequiredChain,
    disconnectWallet,
    retryLastAction,
    clearError,
    copyAddress,
    isSameDeviceQrAttempt
  } = useWallet();
  const [copied, setCopied] = useState(false);
  const [deepLinkCountdown, setDeepLinkCountdown] = useState(0);

  const isConnecting = lifecycle === "CONNECTING";
  const isReconnecting = lifecycle === "RECONNECTING";
  const isConnected = lifecycle === "CONNECTED" || lifecycle === "SWITCHING_CHAIN";

  useEffect(() => {
    if (deepLinkCountdown <= 0) return;
    const id = window.setInterval(() => {
      setDeepLinkCountdown((current) => (current > 1 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [deepLinkCountdown]);

  const injectedWalletLabels = useMemo(() => {
    return eip6963Providers.map((provider) => provider.info.name);
  }, [eip6963Providers]);

  async function handleCopy() {
    const success = await copyAddress();
    if (!success) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  async function handleMobileDeepLink(walletType: "trust" | "metamask" | "coinbase") {
    const link = appStoreLinks[walletType];
    setDeepLinkCountdown(6);
    window.setTimeout(() => {
      window.location.href = link;
    }, 6000);
  }

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
      <div className="flex items-center gap-3">
        <Wallet className="h-5 w-5 text-accent" />
        <div>
          <p className="text-sm uppercase tracking-[0.22em] text-mist/80">Wallet integration</p>
          <p className="font-display text-xl">Production Web3 Wallet Module</p>
        </div>
      </div>

      <div className="mt-5 space-y-3 text-sm">
        {lifecycle === "DISCONNECTED" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <button className="rounded-xl border border-white/15 px-3 py-2 text-left hover:bg-white/10" onClick={() => void connectWallet("metamask")} type="button">
              MetaMask
            </button>
            <button className="rounded-xl border border-white/15 px-3 py-2 text-left hover:bg-white/10" onClick={() => void connectWallet("coinbase")} type="button">
              Coinbase Wallet
            </button>
            <button className="rounded-xl border border-white/15 px-3 py-2 text-left hover:bg-white/10" onClick={() => void connectWallet("walletconnect")} type="button">
              WalletConnect v2
            </button>
            <button className="rounded-xl border border-white/15 px-3 py-2 text-left hover:bg-white/10" onClick={() => void connectWallet("trust")} type="button">
              Trust Wallet
            </button>
            <button className="rounded-xl border border-white/15 px-3 py-2 text-left hover:bg-white/10 sm:col-span-2" onClick={() => void connectWallet("injected")} type="button">
              Any Injected EIP-1193 Wallet
            </button>
          </div>
        ) : null}

        {isConnecting ? (
          <div className="rounded-2xl border border-white/15 bg-black/15 p-3 text-mist">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Connecting to {activeConnectorName ?? "wallet"}...
          </div>
        ) : null}

        {isReconnecting ? (
          <div className="animate-pulse rounded-2xl border border-white/10 bg-black/15 p-3 text-mist">
            Reconnecting wallet session...
          </div>
        ) : null}

        {isWrongChain ? (
          <div className="rounded-2xl border border-amber-400/35 bg-amber-400/10 p-3 text-amber-100">
            <TriangleAlert className="mr-2 inline h-4 w-4" />
            Wrong network detected. Some features are limited.
            <button className="ml-3 rounded-lg border border-amber-300/40 px-2 py-1 text-xs" onClick={() => void switchToRequiredChain()} type="button">
              Switch Network
            </button>
          </div>
        ) : null}

        {isConnected ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-2xl border border-white/15 bg-black/15 p-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-mist/70">Address</p>
                <p className="mt-1 text-ink">{truncatedAddress ?? "Unknown"}</p>
              </div>
              <button className="rounded-lg border border-white/15 p-2" onClick={() => void handleCopy()} type="button">
                {copied ? <Check className="h-4 w-4 text-emerald-200" /> : <Copy className="h-4 w-4 text-mist" />}
              </button>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-white/15 bg-black/15 p-3">
              <p className="text-mist">{chainName ?? "Unknown network"}</p>
              <p className="text-ink">{nativeBalance ?? "..."}</p>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-white/15 bg-black/15 p-3">
              <p className="text-mist">USD equivalent</p>
              <p className="text-ink">{nativeBalanceUsd ?? "..."}</p>
            </div>
            <button className="w-full rounded-xl bg-white px-3 py-2 text-slate-900 hover:bg-accent" onClick={() => void disconnectWallet()} type="button">
              <Unplug className="mr-2 inline h-4 w-4" />
              Disconnect
            </button>
          </div>
        ) : null}

        {lifecycle === "ERROR" && error ? (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-rose-100">
            <p>{error.message}</p>
            <div className="mt-2 flex gap-2">
              <button className="rounded-lg border border-rose-300/30 px-2 py-1 text-xs" onClick={() => void retryLastAction()} type="button">
                Retry
              </button>
              <button className="rounded-lg border border-white/20 px-2 py-1 text-xs" onClick={clearError} type="button">
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {isSameDeviceQrAttempt ? (
          <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-3 text-amber-50">
            <Plug className="mr-2 inline h-4 w-4" />
            WalletConnect QR was requested on this same device. Use deep link instead.
          </div>
        ) : null}

        {deepLinkCountdown > 0 ? (
          <div className="rounded-2xl border border-white/15 bg-black/15 p-3 text-mist">
            Opening wallet app in {deepLinkCountdown}s...
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 text-xs text-mist">
          <button className="rounded-lg border border-white/15 px-2 py-1" onClick={() => void handleMobileDeepLink("trust")} type="button">
            Trust Wallet deep link
          </button>
          <button className="rounded-lg border border-white/15 px-2 py-1" onClick={() => void handleMobileDeepLink("metamask")} type="button">
            MetaMask deep link
          </button>
          <button className="rounded-lg border border-white/15 px-2 py-1" onClick={() => void handleMobileDeepLink("coinbase")} type="button">
            Coinbase deep link
          </button>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/10 p-3 text-xs text-mist">
          <p className="font-medium text-ink">Discovered injected wallets (EIP-6963)</p>
          <p className="mt-1">{injectedWalletLabels.length > 0 ? injectedWalletLabels.join(", ") : "No announced providers detected yet."}</p>
        </div>
      </div>
    </div>
  );
}
