// src/utils/wagmiConfigLike.ts
// wagmi v2 config + Monad testnet chain
// English-only comments.

import { createConfig, http, fallback } from "wagmi";
import { walletConnect, injected, coinbaseWallet } from "wagmi/connectors";
import { defineChain } from "viem";

// ---- ENV ----
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 10143);
const RPC_URL = String(import.meta.env.VITE_RPC_URL ?? "https://testnet.monad-rpc.org");
const WC_PROJECT_ID = import.meta.env.VITE_WC_PROJECT_ID as string | undefined;
const CB_APP_NAME = String(import.meta.env.VITE_APP_NAME ?? "Wooligotchi");

// ---- Chain (Monad testnet) ----
export const MONAD = defineChain({
  id: CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "TMON", symbol: "tMON", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
});

// ---- Connectors ----
// We build the list dynamically so the app works even if some envs are missing.
const connectors = [
  // MetaMask / Phantom (EVM) / Brave / Backpack EVM — все как injected EVM
  injected({
    shimDisconnect: true,
    // Let wagmi try several known injected targets; harmless if absent
    target: [
      "metaMask",
      "coinbaseWallet",
      "phantom",
      "brave",
      "backpack",
      "rabby",
      "okxWallet",
      "trust",
      "zerion",
    ],
  }),

  // Coinbase Wallet (desktop extension & mobile deep link)
  coinbaseWallet({
    appName: CB_APP_NAME,
    preference: "smartWalletOnly", // <— можно "all" если хочешь оба варианти
    version: "4", // recent
  }),

  // WalletConnect (модалка) — включаем только если задан projectId
  ...(WC_PROJECT_ID
    ? [
        walletConnect({
          projectId: WC_PROJECT_ID,
          metadata: {
            name: CB_APP_NAME,
            description: "Wooligotchi mini-app",
            url: "https://example.invalid", // не критично
            icons: ["https://fav.farm/🪺"],
          },
          showQrModal: true,
        }),
      ]
    : []),
];

// ---- Transport(s) ----
const transports = {
  [MONAD.id]: fallback([http(RPC_URL)]),
};

// ---- Config ----
export const config = createConfig({
  chains: [MONAD],
  connectors,
  transports,
  ssr: true, // safe for Vite SSR or static export
});
