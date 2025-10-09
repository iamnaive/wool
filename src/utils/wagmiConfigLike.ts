// src/utils/wagmiConfigLike.ts
// Wagmi v2 config with explicit injected connectors for MetaMask, Phantom, Backpack, Keplr.

import { createConfig, http, fallback } from "wagmi";
import { injected, coinbaseWallet, walletConnect } from "wagmi/connectors";
import { defineChain } from "viem";

// --- ENV ---
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 10143);
const RPC_URL = String(import.meta.env.VITE_RPC_URL ?? "https://testnet.monad-rpc.org");
const APP_NAME = String(import.meta.env.VITE_APP_NAME ?? "Wooligotchi");
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
  testnet: true,
});

// Helpers to safely read optional globals
const get = (path: string): any => {
  try {
    // e.g. "phantom.ethereum"
    return path.split(".").reduce((acc: any, k) => (acc ? acc[k] : undefined), globalThis as any);
  } catch {
    return undefined;
  }
};

// --- Connectors ---
// We define one injected connector per brand. If provider is missing, wagmi marks it not-ready.
const connectors = [
  // MetaMask
  injected({
    shimDisconnect: true,
    target: "metaMask",
  }),

  // Phantom (EVM must be enabled in extension)
  injected({
    shimDisconnect: true,
    // @ts-expect-error: wagmi accepts getProvider at runtime
    getProvider: () => get("phantom.ethereum") ?? null,
  }),

  // Backpack (EVM provider lives on window.backpack.ethereum)
  injected({
    shimDisconnect: true,
    // @ts-expect-error
    getProvider: () => get("backpack.ethereum") ?? null,
  }),

  // Keplr (some builds expose EVM provider on window.keplr.ethereum or window.keplrEvm)
  injected({
    shimDisconnect: true,
    // @ts-expect-error
    getProvider: () => get("keplr.ethereum") ?? get("keplrEvm") ?? null,
  }),

  // Coinbase Wallet
  coinbaseWallet({
    appName: APP_NAME,
    preference: "all",
  }),

  // WalletConnect
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
