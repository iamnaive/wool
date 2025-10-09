// src/App.tsx
// English-only comments.

import React, { useEffect, useState, useMemo } from "react";
import { useAccount, useConnect, useDisconnect, useChainId } from "wagmi";

import { MONAD } from "./utils/wagmiConfigLike";
import { AudioProvider } from "./audio/AudioProvider";
import MuteButton from "./audio/MuteButton";

import Tamagotchi from "./components/Tamagotchi";
import VaultPanel from "./components/VaultPanel";

/* ---------- small helpers ---------- */
const ls = {
  get: (k: string) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; }
  },
  set: (k: string, v: any) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  },
};

const CHAIN_ID = MONAD.id;
const PENDING_LIFE_KEY = "wg_pending_life";

/* Lives (namespaced per chain+address, with optimistic bump) */
function useOptimisticLives(address?: string | null) {
  const [lives, setLives] = useState<number>(0);
  useEffect(() => {
    const addr = address?.toLowerCase();
    if (!addr) return setLives(0);
    const k = `${CHAIN_ID}:${addr}`;
    try {
      const raw = localStorage.getItem("wg_lives_v1");
      const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      const optimisticFor = ls.get(PENDING_LIFE_KEY) as string | null;
      const base = map[k] ?? 0;
      setLives(optimisticFor && optimisticFor.toLowerCase() === addr ? Math.max(base, 1) : base);
    } catch { setLives(0); }
  }, [address]);
  return lives;
}

/* ---------- header ---------- */
function TopBar({ onOpenVault, onOpenConnect }: { onOpenVault: () => void; onOpenConnect: () => void }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const lives = useOptimisticLives(address);

  return (
    <header className="topbar" style={{ paddingRight: 8 }}>
      {/* brand */}
      <div className="brand" style={{ gap: 10, minWidth: 240, whiteSpace: "nowrap", overflow: "hidden" }}>
        <div className="logo" style={{ display: "grid", placeItems: "center", marginRight: 2 }}>
          <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>🥚</span>
        </div>
        <div className="title" style={{ fontWeight: 800, fontSize: "clamp(18px,2.2vw,26px)" }}>
          Wooligotchi
        </div>
      </div>

      {/* right side */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
        {isConnected ? (
          <>
            <div className="pill" title="Lives">❤️ Lives: <b>{lives}</b></div>
            <div className="pill" title="Network">{MONAD.name} • chain {chainId}</div>
            <div className="pill" title="Address">{address?.slice(0, 6)}…{address?.slice(-4)}</div>
            <button className="btn" onClick={onOpenVault} title="Send 1 NFT → +1 life">Get life</button>
            <button className="btn btn-ghost" onClick={() => disconnect()}>Disconnect</button>
            <MuteButton />
          </>
        ) : (
          <>
            {/* single Connect entry point (no duplicated buttons on the header) */}
            <button className="btn btn-primary" onClick={onOpenConnect}>Connect</button>
            <MuteButton />
          </>
        )}
      </div>
    </header>
  );
}

/* ---------- app body ---------- */
function AppInner() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const [connectOpen, setConnectOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [forceGame, setForceGame] = useState(false);

  const livesCount = useOptimisticLives(address);
  const activeAddr = address ?? null;

  // Game events <-> UI wiring
  useEffect(() => {
    const onRequestNft = () => setVaultOpen(true);
    const onConfirmed = () => {
      if (activeAddr) {
        ls.set(PENDING_LIFE_KEY, activeAddr);
        const key = `${CHAIN_ID}:${activeAddr.toLowerCase()}`;
        const raw = localStorage.getItem("wg_lives_v1");
        const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
        map[key] = (map[key] ?? 0) + 1;
        localStorage.setItem("wg_lives_v1", JSON.stringify(map));
      }
      setVaultOpen(false);
      setForceGame(true);
    };

    window.addEventListener("wg:request-nft", onRequestNft as any);
    window.addEventListener("wg:nft-confirmed", onConfirmed as any);
    return () => {
      window.removeEventListener("wg:request-nft", onRequestNft as any);
      window.removeEventListener("wg:nft-confirmed", onConfirmed as any);
    };
  }, [activeAddr]);

  const gate: "splash" | "locked" | "game" =
    !isConnected ? "splash" : (forceGame || livesCount > 0) ? "game" : "locked";

  const tamaKey = `wg-${String(chainId ?? CHAIN_ID)}-${String(activeAddr || "none")}`;

  return (
    <div className="wrap">
      <TopBar onOpenVault={() => setVaultOpen(true)} onOpenConnect={() => setConnectOpen(true)} />

      {gate === "splash" && (
        <section className="card splash">
          <div className="splash-inner">
            <div className="splash-title">Wooligotchi</div>
            <div className="muted">Send 1 NFT → get 1 life (to the Vault)</div>
            <button className="btn btn-primary btn-lg" onClick={() => setConnectOpen(true)}>
              Connect Wallet
            </button>
          </div>
        </section>
      )}

      {gate === "locked" && (
        <>
          <div style={{ maxWidth: 980, margin: "0 auto" }}>
            <Tamagotchi
              key={tamaKey}
              walletAddress={activeAddr || undefined}
              currentForm={"egg" as any}
              lives={0}
            />
          </div>

          <section className="card splash" style={{ maxWidth: 640, margin: "24px auto" }}>
            <div className="splash-inner">
              <div className="splash-title" style={{ marginBottom: 8 }}>No lives on this wallet</div>
              <div className="muted" style={{ marginBottom: 16, textAlign: "center" }}>
                Send 1 NFT to the Vault to start. If another wallet has a life, switch to it.
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                {!isConnected ? (
                  <button className="btn btn-primary btn-lg" onClick={() => setConnectOpen(true)}>
                    Connect Wallet
                  </button>
                ) : (
                  <button className="btn btn-primary btn-lg" onClick={() => setVaultOpen(true)}>
                    Send NFT (+1 life)
                  </button>
                )}
              </div>
            </div>
          </section>
        </>
      )}

      {gate === "game" && (
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <Tamagotchi
            key={tamaKey}
            walletAddress={activeAddr || undefined}
            currentForm={"egg" as any}
            lives={livesCount}
          />
        </div>
      )}

      {/* connect modal */}
      {connectOpen && (
        <ConnectModal onClose={() => setConnectOpen(false)} />
      )}

      {/* vault modal */}
      {vaultOpen && (
        <div onClick={() => setVaultOpen(false)} className="modal">
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 520, maxWidth: "92vw" }}>
            <div className="title" style={{ fontSize: 20, marginBottom: 10, color: "white" }}>
              Send 1 NFT → +1 life
            </div>
            <VaultPanel />
          </div>
        </div>
      )}

      <footer className="footer">
        <div className="muted">Monad testnet mini-app • Wooligotchi</div>
      </footer>
    </div>
  );
}

/* ---------- connect modal driven strictly by wagmi connectors ---------- */
function ConnectModal({ onClose }: { onClose: () => void }) {
  return (
    <div onClick={onClose} className="modal">
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 460, maxWidth: "92vw" }}>
        <div className="title" style={{ fontSize: 20, marginBottom: 10, color: "white" }}>Connect a wallet</div>
        <WalletButtons />
      </div>
    </div>
  );
}

function WalletButtons() {
  const { connect, connectors } = useConnect();

  // Filter & label: only actual wagmi connectors, dedupe by name
  const list = useMemo(() => {
    const items = connectors.map((c) => {
      const isInjected = (c.type as string) === "injected";
      const label =
        isInjected && (globalThis as any).ethereum?.isMetaMask ? "MetaMask" :
        isInjected ? "Injected" :
        c.name;
      return { c, label, isInjected };
    });

    const seen = new Set<string>();
    return items.filter((it) => {
      if (seen.has(it.label)) return false;
      seen.add(it.label);
      return ["Injected", "MetaMask", "WalletConnect", "Coinbase Wallet"].includes(it.label);
    });
  }, [connectors]);

  return (
    <div className="wallet-grid">
      {list.map(({ c, label, isInjected }) => {
        const key = (c as any).id ?? (c as any).uid ?? label;
        // Only disable injected when provider is not present; WC/CB stay clickable
        const disabled = isInjected && !c.ready;
        const title = !disabled ? `Connect with ${label}` : "Not installed";

        return (
          <button
            key={key}
            className="btn"
            disabled={disabled}
            title={title}
            onClick={() => connect({ connector: c })}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* Export with audio provider (wagmi/query providers live in main.tsx) */
export default function App() {
  return (
    <AudioProvider>
      <AppInner />
    </AudioProvider>
  );
}
