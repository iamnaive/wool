// src/App.tsx
// Mount Tamagotchi even when locked so DeathOverlay shows after offline death.
// Comments: English only.

import React, { useEffect, useState } from "react";
import { WagmiProvider, useAccount, useConnect, useDisconnect, useChainId } from "wagmi";

import { config, MONAD } from "./utils/wagmiConfigLike";
import { AudioProvider } from "./audio/AudioProvider";
import MuteButton from "./audio/MuteButton";

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

const CHAIN_ID = MONAD.id;

/** ===== Hooks ===== */
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
    const k = `${CHAIN_ID}:${address.toLowerCase()}`;
    const raw = localStorage.getItem("wg_lives_v1");
    try {
      const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      setLives(map[k] ?? 0);
    } catch {
      setLives(0);
    }
  }, [address]);
  return lives;
}

/** ===== UI bits ===== */
function ConnectStrip() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();

  return isConnected ? (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div className="pill">
        {address?.slice(0, 6)}…{address?.slice(-4)} • chain {chainId}
      </div>
      <button className="btn" onClick={() => disconnect()}>
        Disconnect
      </button>
      <MuteButton />
    </div>
  ) : (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
      <MuteButton />
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

  // Events from Tamagotchi
  useEffect(() => {
    const onRequestNft = () => setVaultOpen(true);

    const onConfirmed = () => {
      // optimistic +1 life locally (real backend may sync later)
      try {
        const addr = activeAddr;
        if (!addr) return;
        const k = `${CHAIN_ID}:${addr.toLowerCase()}`;
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
    <div className="page">
      {/* Top bar matches .topbar styles */}
      <div className="topbar">
        <div className="brand" style={{ gap: 10 }}>
          <div className="logo" />
          <div className="title" style={{ fontWeight: 700 }}>Woolly Eggs</div>
        </div>
        <ConnectStrip />
      </div>

      {/* Stage area styled by .stage from styles.css */}
      <div className="stage" style={{ display: "grid", placeItems: "center", padding: 16 }}>
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

      {/* Optional footer not required by your CSS, можно оставить пустым */}
      {/* <div className="footer muted">Monad testnet mini-app • Woolly Eggs</div> */}

      {pickerOpen && (
        <div onClick={() => setPickerOpen(false)} className="modal">
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: 520, maxWidth: "92vw" }}
          >
            <div className="title" style={{ fontSize: 20, marginBottom: 10, color: "white" }}>
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
            <div className="title" style={{ fontSize: 20, marginBottom: 10, color: "white" }}>
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
      {/* Centralized audio: uses /audio/*.mp3 from public/audio after user gesture */}
      <AudioProvider>
        <AppInner />
      </AudioProvider>
    </WagmiProvider>
  );
}
