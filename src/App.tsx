// src/App.tsx

import React, { useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect, useChainId } from "wagmi";

import { MONAD } from "./utils/wagmiConfigLike";
import { AudioProvider } from "./audio/AudioProvider";
import MuteButton from "./audio/MuteButton";

import Tamagotchi from "./components/Tamagotchi";
import VaultPanel from "./components/VaultPanel";

// WOOL (added, non-invasive)
import { WoolProvider } from "./wool/WoolProvider";
import WoolHUD from "./wool/WoolHUD";

/* ---------- small helpers ---------- */
const ls = {
  get: (k: string) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }
    catch { return null; }
  },
  set: (k: string, v: any) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  },
};

const CHAIN_ID = MONAD.id;
const PENDING_LIFE_KEY = "wg_pending_life";
const LIVES_KEY = "wg_lives_v1";

/* Lives (namespaced per chain+address, with optimistic bump) */
function useOptimisticLives(address?: string | null) {
  const [lives, setLives] = useState<number>(0);
  useEffect(() => {
    const addr = address?.toLowerCase();
    if (!addr) return setLives(0);
    const k = `${CHAIN_ID}:${addr}`;
    try {
      const raw = localStorage.getItem(LIVES_KEY);
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
      <div className="brand" style={{ gap: 10, minWidth: 240, whiteSpace: "nowrap", overflow: "hidden" }}>
        <div className="logo" style={{ display: "grid", placeItems: "center", marginRight: 2 }}>
          <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>🥚</span>
        </div>
        <div className="title" style={{ fontWeight: 800, fontSize: "clamp(18px,2.2vw,26px)" }}>
          Wooligotchi
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
        {isConnected ? (
          <>
            <div className="pill">❤️ Lives: <b>{lives}</b></div>
            <div className="pill">{MONAD.name} • chain {chainId}</div>
            <div className="pill">{address?.slice(0, 6)}…{address?.slice(-4)}</div>
            <button className="btn" onClick={onOpenVault} title="Send 1 NFT → +1 life">Get life</button>
            <button className="btn btn-ghost" onClick={() => disconnect()}>Disconnect</button>
            <MuteButton />
          </>
        ) : (
          <>
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

  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [isVaultOpen, setIsVaultOpen] = useState(false);
  const [forceGame, setForceGame] = useState(false);

  const livesCount = useOptimisticLives(address);
  const activeAddr = address ?? null;

  // helper to write lives (kept for completeness)
  const writeLives = (addr: string | null | undefined, value: number) => {
    const a = (addr || "").toLowerCase();
    if (!a) return;
    try {
      const raw = localStorage.getItem(LIVES_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      map[`${CHAIN_ID}:${a}`] = Math.max(0, Math.floor(value));
      localStorage.setItem(LIVES_KEY, JSON.stringify(map));
    } catch {}
  };

  // decrement once on death (called by Tamagotchi via prop)
  const handleLoseLife = () => {
    const a = (activeAddr || "").toLowerCase();
    if (!a) return;
    try {
      const raw = localStorage.getItem(LIVES_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      const key = `${CHAIN_ID}:${a}`;
      const next = Math.max(0, (map[key] ?? 0) - 1);
      map[key] = next;
      localStorage.setItem(LIVES_KEY, JSON.stringify(map));
    } catch {}
    setForceGame(false);
  };

  // safety listener if someone else emits a lose signal
  useEffect(() => {
    const onLose = () => handleLoseLife();
    window.addEventListener("wg:lose-life", onLose as any);
    return () => window.removeEventListener("wg:lose-life", onLose as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAddr]);

  // open/confirm listeners (+ explicit "wg:open-game")
  useEffect(() => {
    const onRequestNft = () => setIsVaultOpen(true);

    const onConfirmed = () => {
      if (activeAddr) {
        ls.set(PENDING_LIFE_KEY, activeAddr);
        const key = `${CHAIN_ID}:${activeAddr.toLowerCase()}`;
        const raw = localStorage.getItem(LIVES_KEY);
        const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
        map[key] = (map[key] ?? 0) + 1;
        localStorage.setItem(LIVES_KEY, JSON.stringify(map));
      }
      setIsVaultOpen(false);
      setForceGame(true);
    };

    const onOpenGame = () => {
      setIsVaultOpen(false);
      setForceGame(true);
    };

    window.addEventListener("wg:request-nft", onRequestNft as any);
    window.addEventListener("wg:nft-confirmed", onConfirmed as any);
    window.addEventListener("wg:open-game", onOpenGame as any);

    return () => {
      window.removeEventListener("wg:request-nft", onRequestNft as any);
      window.removeEventListener("wg:nft-confirmed", onConfirmed as any);
      window.removeEventListener("wg:open-game", onOpenGame as any);
    };
  }, [activeAddr]);

  // --- toast for "life spent" (offline or online)
  const [lifeToast, setLifeToast] = useState<string | null>(null);
  useEffect(() => {
    function onLifeSpent(e: any) {
      const reason = e?.detail?.reason ? String(e.detail.reason) : "unknown";
      const offline = e?.detail?.offline ? "offline" : "online";
      setLifeToast(`Life spent (${offline}): ${reason}`);
      const t = setTimeout(() => setLifeToast(null), 3500);
      return () => clearTimeout(t);
    }
    window.addEventListener("wg:life-spent", onLifeSpent as any);
    return () => window.removeEventListener("wg:life-spent", onLifeSpent as any);
  }, []);

  const gate: "splash" | "locked" | "game" =
    !isConnected ? "splash" : (forceGame || livesCount > 0) ? "game" : "locked";

  const tamaKey = `wg-${String(chainId ?? CHAIN_ID)}-${String(activeAddr || "none")}`;

  return (
    <div className="wrap">
      <TopBar onOpenVault={() => setIsVaultOpen(true)} onOpenConnect={() => setIsConnectOpen(true)} />

      {gate === "splash" && (
        <section className="card splash">
          <div className="splash-inner">
            <div className="splash-title">Wooligotchi</div>
            <div className="muted">Send 1 NFT → get 1 life (to the Vault)</div>
            <button className="btn btn-primary btn-lg" onClick={() => setIsConnectOpen(true)}>Connect Wallet</button>
          </div>
        </section>
      )}

      {gate === "locked" && (
        <section className="card splash" style={{ maxWidth: 640, margin: "24px auto" }}>
          <div className="splash-inner">
            <div className="splash-title" style={{ marginBottom: 8 }}>No lives on this wallet</div>
            <div className="muted" style={{ marginBottom: 16, textAlign: "center" }}>
              Send 1 NFT to the Vault to start. If another wallet has a life, switch to it.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              {!isConnected ? (
                <button className="btn btn-primary btn-lg" onClick={() => setIsConnectOpen(true)}>
                  Connect Wallet
                </button>
              ) : (
                <button className="btn btn-primary btn-lg" onClick={() => setIsVaultOpen(true)}>
                  Send NFT (+1 life)
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {gate === "game" && (
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <Tamagotchi
            key={tamaKey}
            walletAddress={activeAddr || undefined}
            currentForm={"egg" as any}
            lives={livesCount}
            onLoseLife={handleLoseLife}
          />
        </div>
      )}

      {isConnectOpen && (
        <ConnectModal onClose={() => setIsConnectOpen(false)} />
      )}

      {isVaultOpen && (
        <div onClick={() => setIsVaultOpen(false)} className="modal">
          <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 520, maxWidth: "92vw" }}>
            <div className="title" style={{ fontSize: 20, marginBottom: 10, color: "white" }}>Send 1 NFT → +1 life</div>
            <VaultPanel />
          </div>
        </div>
      )}

      {/* transient toast about life spending */}
      {lifeToast && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 24,
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.75)",
            color: "#fff",
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.15)",
            zIndex: 9999,
            pointerEvents: "none",
            fontSize: 13,
          }}
        >
          {lifeToast}
        </div>
      )}

      <footer className="footer"><div className="muted">Monad testnet mini-app • Wooligotchi</div></footer>

      {/* WOOL HUD (non-invasive overlay) */}
      <WoolHUD />
    </div>
  );
}

/* ---------- connect modal (auto-close on success via connectAsync) ---------- */
function ConnectModal({ onClose }: { onClose: () => void }) {
  return (
    <div onClick={onClose} className="modal">
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: 460, maxWidth: "92vw" }}>
        <div className="title" style={{ fontSize: 20, marginBottom: 10, color: "white" }}>Connect a wallet</div>
        <WalletButtons onDone={onClose} />
      </div>
    </div>
  );
}

function WalletButtons({ onDone }: { onDone?: () => void }) {
  const { connectAsync, connectors } = useConnect();

  const list = useMemo(() => {
    const getHasMM = () =>
      !!(window as any).ethereum?.isMetaMask ||
      (Array.isArray((window as any).ethereum?.providers) &&
        (window as any).ethereum.providers.some((p: any) => p?.isMetaMask));

    const items = connectors.map((c) => {
      const opts: any = (c as any).options ?? {};
      let label = c.name;
      let ready = true;

      if (c.type === "injected" && opts?.target === "metaMask") {
        label = "MetaMask"; ready = getHasMM();
      } else if (c.type === "injected" && typeof opts?.getProvider === "function") {
        const p = opts.getProvider();
        const isPhantom  = !!(p && (p as any).isPhantom);
        const isBackpack = !!(p && (p as any).isBackpack);
        const isKeplr    = !!(p && ((p as any).isKeplr || (p as any).isKeplrEvm));
        if (isPhantom)  { label = "Phantom";  ready = true; }
        else if (isBackpack) { label = "Backpack"; ready = true; }
        else if (isKeplr)    { label = "Keplr";    ready = true; }
        else { label = "Injected"; ready = !!p; }
      } else if (/walletconnect/i.test(c.name)) {
        label = "WalletConnect";
      } else if (/coinbase/i.test(c.name)) {
        label = "Coinbase Wallet";
      }

      const prio =
        label === "MetaMask" ? 1 :
        label === "Phantom" ? 2 :
        label === "Backpack" ? 3 :
        label === "Keplr" ? 4 :
        label === "WalletConnect" ? 5 :
        label === "Coinbase Wallet" ? 6 : 99;

      return {
        key: (c as any).id ?? (c as any).uid ?? label,
        label,
        connector: c,
        disabled: c.type === "injected" && !ready,
        prio,
      };
    });

    const allow = new Set(["MetaMask", "Phantom", "Backpack", "Keplr", "WalletConnect", "Coinbase Wallet"]);
    const seen = new Set<string>();
    return items
      .filter((it) => {
        if (!allow.has(it.label)) return false;
        if (seen.has(it.label)) return false;
        seen.add(it.label);
        return true;
      })
      .sort((a, b) => a.prio - b.prio);
  }, [connectors]);

  return (
    <div className="wallet-grid">
      {list.map(({ key, label, connector, disabled }) => (
        <button
          key={key}
          className="btn"
          disabled={disabled}
          title={disabled ? `${label} not installed` : `Connect with ${label}`}
          onClick={async () => {
            try {
              await connectAsync({ connector });
              onDone?.(); // close modal on success
            } catch {
              // keep modal open so user can try a different connector
            }
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ---------- export ---------- */
export default function App() {
  return (
    <AudioProvider>
      {/* WOOL provider wraps the game non-invasively */}
      <WoolProvider>
        <AppInner />
      </WoolProvider>
    </AudioProvider>
  );
}
