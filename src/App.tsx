// src/App.tsx
// English-only comments.

import React, { useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useChainId } from "wagmi";

import { MONAD } from "./utils/wagmiConfigLike";
import { AudioProvider } from "./audio/AudioProvider";
import MuteButton from "./audio/MuteButton";

import Tamagotchi from "./components/Tamagotchi";
import VaultPanel from "./components/VaultPanel";

/** ===== utils ===== */
const ls = {
  get: (k: string) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const CHAIN_ID = MONAD.id;

function useIsLocked(chainId: number | null, address: string | null) {
  const [locked, setLocked] = useState(true);
  useEffect(() => { const v = ls.get("wg_locked"); setLocked(v === null ? true : Boolean(v)); }, [chainId, address]);
  return { locked, setLocked };
}
function useOptimisticLives(address?: string) {
  const [lives, setLives] = useState<number>(0);
  useEffect(() => {
    const addr = address?.toLowerCase();
    if (!addr) return setLives(0);
    const k = `${CHAIN_ID}:${addr}`;
    try {
      const raw = localStorage.getItem("wg_lives_v1");
      const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      setLives(map[k] ?? 0);
    } catch { setLives(0); }
  }, [address]);
  return lives;
}

/** ===== top bar ===== */
function TopBar({ onOpenVault }: { onOpenVault: () => void }) {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const lives = useOptimisticLives(address);

  return (
    <div className="topbar" style={{ paddingRight: 8 }}>
      {/* Brand */}
      <div className="brand" style={{ gap: 10, minWidth: 240, whiteSpace: "nowrap", overflow: "hidden" }}>
        <div className="logo" style={{ display: "grid", placeItems: "center", marginRight: 2 }}>
          <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>🥚</span>
        </div>
        <div className="title" style={{ fontWeight: 800, fontSize: "clamp(18px,2.2vw,26px)" }}>
          Wooligotchi
        </div>
      </div>

      {/* Right side */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
        {isConnected ? (
          <>
            <div className="pill" title="Lives">❤️ Lives: <b>{lives}</b></div>
            <div className="pill" title="Network">{MONAD.name} • chain {chainId}</div>
            <div className="pill" title="Address">{address?.slice(0, 6)}…{address?.slice(-4)}</div>
            <button className="btn" onClick={onOpenVault} title="Send 1 NFT → +1 life">➕ Get life</button>
            <button className="btn" onClick={() => disconnect()}>Disconnect</button>
            <MuteButton />
          </>
        ) : (
          <>
            {connectors.map((c) => (
              <button
                key={c.uid}
                disabled={!c.ready || isPending}
                className="btn"
                onClick={() => connect({ connector: c })}
                title={c.name}
              >
                {c.name}
              </button>
            ))}
            <MuteButton />
          </>
        )}
      </div>
    </div>
  );
}

/** ===== body ===== */
function AppInner() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { locked, setLocked } = useIsLocked(chainId, address ?? null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [forceGame, setForceGame] = useState(false);

  const livesCount = useOptimisticLives(address);
  const activeAddr = address ?? null;

  // wire game events -> vault
  useEffect(() => {
    const onRequestNft = () => setVaultOpen(true);
    const onConfirmed = () => {
      try {
        const addr = activeAddr?.toLowerCase();
        if (!addr) return;
        const k = `${CHAIN_ID}:${addr}`;
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
      <TopBar onOpenVault={() => setVaultOpen(true)} />

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

      {/* (опция) выбор NFT из кошелька */}
      {pickerOpen && (
        <div onClick={() => setPickerOpen(false)} className="modal">
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 520, maxWidth: "92vw" }}>
            <div className="title" style={{ fontSize: 20, marginBottom: 10, color: "white" }}>Pick NFT from Wallet</div>
            <VaultPanel onClose={() => setPickerOpen(false)} />
          </div>
        </div>
      )}

      {/* явная кнопка “Send 1 NFT → +1 life” открывает этот модал */}
      {vaultOpen && (
        <div onClick={() => setVaultOpen(false)} className="modal">
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 520, maxWidth: "92vw" }}>
            <div className="title" style={{ fontSize: 20, marginBottom: 10, color: "white" }}>
              Send 1 NFT → +1 life
            </div>
            <VaultPanel onClose={() => setVaultOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  // Providers live in main.tsx — here only audio wrapper.
  return (
    <AudioProvider>
      <AppInner />
    </AudioProvider>
  );
}
