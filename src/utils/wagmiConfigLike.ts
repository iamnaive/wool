// src/utils/wagmiConfigLike.ts
// Safe wagmi v2 config for Monad testnet + WalletConnect (reads both env keys)

import { createConfig, http, fallback } from "wagmi";
import { injected, coinbaseWallet, walletConnect } from "wagmi/connectors";
import { defineChain } from "viem";

// --- ENV ---
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 10143);
const RPC_URL = String(import.meta.env.VITE_RPC_URL ?? "https://testnet.monad-rpc.org");
const APP_NAME = String(import.meta.env.VITE_APP_NAME ?? "Wooligotchi");
// Accept both names for project id
const WC_PROJECT_ID =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ??
  (import.meta.env.VITE_WC_PROJECT_ID as string | undefined);

// --- Chain ---
export const MONAD = defineChain({
  id: CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "TMON", symbol: "tMON", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
});

// --- Connectors (safe) ---
const connectors = [
  injected({
    shimDisconnect: true,
  }),
  coinbaseWallet({
    appName: APP_NAME,
    preference: "all",
  }),
  ...(WC_PROJECT_ID
    ? [
        walletConnect({
          projectId: WC_PROJECT_ID,
          metadata: {
            name: APP_NAME,
            description: "Wooligotchi mini-app",
            url: "https://example.invalid",
            icons: ["https://fav.farm/🥚"],
          },
          showQrModal: true,
        }),
      ]
    : []),
];

// --- Transports ---
const transports = {
  [MONAD.id]: fallback([http(RPC_URL)]),
};

// --- Config ---
export const config = createConfig({
  chains: [MONAD],
  connectors,
  transports,
  ssr: true,
  multiInjectedProviderDiscovery: true,
});
