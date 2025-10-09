// src/utils/wagmiConfigLike.ts
// Wagmi/Viem config for Monad Testnet. English-only comments.

import { createConfig, http } from "wagmi";
import { defineChain } from "viem";
import { injected, walletConnect, coinbaseWallet } from "wagmi/connectors";

const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 10143);
const RPC_HTTP = String(
  import.meta.env.VITE_RPC_URL ?? "https://testnet-rpc.monad.xyz"
);
const WC_PROJECT_ID = String(import.meta.env.VITE_WC_PROJECT_ID ?? "");

export const MONAD = defineChain({
  id: CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_HTTP] } },
});

export const config = createConfig({
  chains: [MONAD],
  connectors: [
    injected({ shimDisconnect: true }),
    ...(WC_PROJECT_ID
      ? [walletConnect({ projectId: WC_PROJECT_ID, showQrModal: true })]
      : []),
    coinbaseWallet({ appName: "Woolly Eggs" }),
  ],
  transports: { [MONAD.id]: http(RPC_HTTP) },
  ssr: false,
});

export type AppChain = typeof MONAD;
