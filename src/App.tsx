import { AudioProvider } from "./audio/AudioProvider";
import MuteButton from "./audio/MuteButton";
// src/App.tsx
// Mount Tamagotchi even when locked so DeathOverlay shows after offline death.
// Comments: English only.

import React, { useEffect, useState } from "react";
import {
  http,
  createConfig,
  WagmiProvider,
  useAccount,
  useConnect,
  useDisconnect,
  useChainId,
} from "wagmi";
import { injected, walletConnect, coinbaseWallet } from "wagmi/connectors";
import { defineChain } from "viem";
import Tamagotchi from "./components/Tamagotchi";
import VaultPanel from "./components/VaultPanel";

/** ===== Utils ===== */
const ls = {
  get: (k: string) => {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  },
  set: (k: string, v: any) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

/** ===== Chain/Wagmi minimal config (kept as-is to not break gameplay) ===== */
const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 10143);
const RPC_URL = String(
  import.meta.env.VITE_RPC_URL ?? "https://testnet-rpc.monad.xyz"
);
const WC_PROJECT_ID = String(import.meta.env.VITE_WC_PROJECT_ID ?? "");

export const MONAD = defineChain({
  id: CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
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
  transports: { [MONAD.id]: http(RPC_URL) },
  ssr: false,
});

/** ===== Small hooks / helpers preserved ===== */
function useIsLocked(chainId: number | null, address: string | null) {
  const [locked, setLocked] = useState(true);
  useEffect(() => {
    const v = ls.get("wg_locked");
    setLocked(v === null ? true : Boolean(v));
  }, [chainId, address]);
  return { locked, setLocked };
}

function useOptimisticLives(address: string | undefined) {
  const [lives, setLives] = useState<number>(0);
  useEffect(() => {
    if (!address) return;
    const key = `wg_lives_v1:${CHAIN_ID}:${address.toLowerCase()}`;
    const raw = localStorage.getItem("wg_lives_v1");
    try {
      const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      setLives(map[key] ?? 0);
    } catch {
      setLives(0);
    }
  }, [address]);
  return lives;
}

/** ===== UI ===== */
function ConnectBar() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();

  return (
    <div className="connectbar">
      {isConnected ? (
        <div className="row">
          <div className="pill">
            {address?.slice(0, 6)}…{address?.slice(-4)} • chain {chainId}
          </div>
          <button className="btn" onClick={() => disconnect()}>
            Disconnect
          </button>
          {/* Global audio mute toggle */}
          <MuteButton />
        </div>
      ) : (
        <div className="row">
          {connectors.map((c) => (
            <button
              key={c.uid}
              disabled={!c.ready || isPending}
              className="btn"
              onClick={() => connect({ connector: c })}
            >
              {c.name}
            </button>
          ))}
          {/* Audio toggle is still visible; will arm on first tap */}
          <MuteButton />
        </div>
      )}
    </div>
  );
}

function AppInner() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { locked, setLocked } = useIsLocked(chainId, address ?? null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [forceGame, setForceGame] = useState(false);

  // Lives from backend + optimistic +1 after NFT send
  const livesCount = useOptimisticLives(address);

  const activeAddr = address ?? null;

  // === Events from Tamagotchi ===
  useEffect(() => {
    const onRequestNft = () => setVaultOpen(true);

    const onConfirmed = (e: Event) => {
      // optimistic +1 life locally (real backend may sync later)
      try {
        const addr = activeAddr;
        if (!addr) return;
        const k = `wg_lives_v1:${CHAIN_ID}:${addr.toLowerCase()}`;
        const raw = localStorage.getItem("wg_lives_v1");
        const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
        map[k] = (map[k] ?? 0) + 1;
        localStorage.setItem("wg_lives_v1", JSON.stringify(map));
      } catch {}
    };

    window.addEventListener("wg:request-nft", onRequestNft as any);
    window.addEventListener("wg:nft-confirmed", onConfirmed as any);
    return () => {
      window.removeEventListener("wg:request-nft", onRequestNft as any);
      window.removeEventListener("wg:nft-confirmed", onConfirmed as any);
    };
  }, [address]);

  return (
    <div className="layout">
      <header className="header">
        <div className="logo">Woolly Eggs</div>
        <ConnectBar />
      </header>

      <main className="content">
        {/* When locked: still mount the game so DeathOverlay can show after offline death */}
        <div className="stage">
          <Tamagotchi
            chainId={CHAIN_ID}
            address={activeAddr}
            lives={livesCount}
            locked={locked && !forceGame}
            onUnlock={() => setLocked(false)}
            onOpenPicker={() => setPickerOpen(true)}
            onRequestNft={() => setVaultOpen(true)}
          />
        </div>
      </main>

      <footer className="footer">
        <div className="muted">Monad testnet mini-app • Woolly Eggs</div>
      </footer>

      {pickerOpen && (
        <div onClick={() => setPickerOpen(false)} className="modal">
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: 520, maxWidth: "92vw" }}
          >
            <div
              className="title"
              style={{ fontSize: 20, marginBottom: 10, color: "white" }}
            >
              Pick NFT from Wallet
            </div>
            <VaultPanel onClose={() => setPickerOpen(false)} />
          </div>
        </div>
      )}

      {vaultOpen && (
        <div onClick={() => setVaultOpen(false)} className="modal">
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: 520, maxWidth: "92vw" }}
          >
            <div
              className="title"
              style={{ fontSize: 20, marginBottom: 10, color: "white" }}
            >
              Send NFT to Vault
            </div>
            <VaultPanel onClose={() => setVaultOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <WagmiProvider config={config}>
      {/* Centralized audio: will arm and play /audio/bgm_main.mp3 after user gesture */}
      <AudioProvider>
        <AppInner />
      </AudioProvider>
    </WagmiProvider>
  );
}
