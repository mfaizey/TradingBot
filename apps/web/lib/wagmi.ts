import { createConfig, http } from "wagmi";
import { arbitrum, avalanche, bsc, mainnet, optimism, polygon } from "wagmi/chains";
import { coinbaseWallet, injected, metaMask, walletConnect } from "wagmi/connectors";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const hasWalletConnectProjectId = Boolean(walletConnectProjectId && walletConnectProjectId.trim().length > 0);

export const supportedChains = [mainnet, bsc, polygon, arbitrum, optimism, avalanche] as const;

export const chainLabels: Record<number, string> = {
  [mainnet.id]: "Ethereum",
  [bsc.id]: "BNB Smart Chain",
  [polygon.id]: "Polygon",
  [arbitrum.id]: "Arbitrum",
  [optimism.id]: "Optimism",
  [avalanche.id]: "Avalanche"
};

export function createWagmiConfig() {
  return createConfig({
    ssr: false,
    chains: supportedChains,
    transports: {
      [mainnet.id]: http(process.env.NEXT_PUBLIC_MAINNET_RPC_URL),
      [bsc.id]: http(process.env.NEXT_PUBLIC_BSC_RPC_URL ?? "https://bsc-dataseed.binance.org"),
      [polygon.id]: http(process.env.NEXT_PUBLIC_POLYGON_RPC_URL ?? "https://polygon-rpc.com"),
      [arbitrum.id]: http(process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL ?? "https://arb1.arbitrum.io/rpc"),
      [optimism.id]: http(process.env.NEXT_PUBLIC_OPTIMISM_RPC_URL ?? "https://mainnet.optimism.io"),
      [avalanche.id]: http(process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL ?? "https://api.avax.network/ext/bc/C/rpc")
    },
    connectors: [
      metaMask(),
      coinbaseWallet({
        appName: "Autonomous Trading Portal"
      }),
      ...(hasWalletConnectProjectId
        ? [
            walletConnect({
              projectId: walletConnectProjectId!,
              showQrModal: true,
              metadata: {
                name: "Autonomous Trading Portal",
                description: "Wallet integration for multi-chain trading desk",
                url: "https://localhost:3000",
                icons: []
              }
            })
          ]
        : []),
      injected({
        shimDisconnect: true,
        unstable_shimAsyncInject: true
      })
    ]
  });
}
