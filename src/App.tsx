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
import Tamagotchi from "./Tamagotchi";
import VaultPanel from "./VaultPanel";

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
  del: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {}
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** ===== Audio (simple bus) ===== */
const audio = (() => {
  let muted = ls.get("wg_muted") === true;
  const play = async (id: string) => {
    if (muted) return;
    const el = document.getElementById(id) as HTMLAudioElement | null;
    try {
      await el?.play();
    } catch {}
  };
  return {
    isMuted: () => muted,
    setMuted: (m: boolean) => {
      muted = m;
      ls.set("wg_muted", m);
    },
    playEatSfx: () => play("sfx_eat"),
    playCatastrophe: () => play("sfx_catastrophe"),
    playCatEnd: () => play("sfx_cat_end"),
  };
})();

function MuteButton() {
  const [muted, setMuted] = useState<boolean>(audio.isMuted());
  return (
    <button
      className="btn btn-ghost"
      onClick={() => {
        const next = !muted;
        audio.setMuted(next);
        setMuted(next);
      }}
      title={muted ? "Unmute" : "Mute"}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}

/** ===== ENV ===== */
const MONAD_CHAIN_ID =
  Number((import.meta as any).env?.VITE_CHAIN_ID ?? 10143) || 10143;
const RPC_URL =
  String((import.meta as any).env?.VITE_RPC_URL || "http://127.0.0.1:8545");
const WC_ID = (import.meta as any).env?.VITE_WALLETCONNECT_ID || "";
const CB_APP = (import.meta as any).env?.VITE_COINBASE_APP || "";
const LIVES_REST =
  (import.meta as any).env?.VITE_LIVES_REST || "http://localhost:8787";

// ===== CHAIN =====
const MONAD = defineChain({
  id: MONAD_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
});

// ===== CONNECTORS =====
const connectorsList = [
  injected({ shimDisconnect: true }),
  WC_ID
    ? walletConnect({
        projectId: WC_ID,
        metadata: {
          name: "Wooligotchi",
          description: "Send 1 NFT → get 1 life",
          url: "https://example.local",
          icons: [],
        },
        showQrModal: true,
      })
    : null,
  CB_APP
    ? coinbaseWallet({
        appName: CB_APP,
      })
    : null,
].filter(Boolean) as any[];

const config = createConfig({
  chains: [MONAD],
  ssr: false,
  connectors: connectorsList,
  transports: {
    [MONAD.id]: http(RPC_URL),
  },
});

/** ===== Lives counter sync (optimistic across reloads) ===== */
const PENDING_LIFE_KEY = "wg_pending_life";

function useOptimisticLives(address?: string | null) {
  const chainId = useChainId();
  const [lives, setLives] = useState<number>(0);

  useEffect(() => {
    if (!address) return;

    // Restore optimistic +1 life across reloads after NFT send
    const p = ls.get(PENDING_LIFE_KEY) as string | null;
    if (p && p.toLowerCase() === address.toLowerCase()) {
      setLives((x) => (x > 0 ? x : 1));
    }

    // Poll backend for real lives
    let t: any;
    async function tick() {
      try {
        const res = await fetch(
          `${LIVES_REST}/lives?addr=${encodeURIComponent(address)}&chain=${chainId}`,
          { method: "GET" }
        );
        if (res.ok) {
          const data = (await res.json()) as { lives: number };
          if (typeof data?.lives === "number") setLives(data.lives);
        }
      } catch {
        /* keep last value */
      }
    }
    tick();
    t = setInterval(tick, 3000);
    return () => clearInterval(t);
  }, [chainId, address]);
  return lives;
}

function AppInner() {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, status: connectStatus } = useConnect(
    // @ts-ignore
    { connectors: connectorsList }
  );
  const { disconnect } = useDisconnect();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [forceGame, setForceGame] = useState(false);

  // Lives from backend + optimistic +1 after NFT send
  const livesCount = useOptimisticLives(address);

  const activeAddr = address ?? null;

  // === Events from Tamagotchi ===
  useEffect(() => {
    const onRequestNft = () => setVaultOpen(true);

    const onConfirmed = async () => {
      // Mark optimistic +1 life and keep game mounted
      if (address) ls.set(PENDING_LIFE_KEY, address);
      setVaultOpen(false);
      setForceGame(true);
    };

    window.addEventListener("wg:request-nft", onRequestNft as any);
    window.addEventListener("wg:nft-confirmed", onConfirmed as any);
    return () => {
      window.removeEventListener("wg:request-nft", onRequestNft as any);
      window.removeEventListener("wg:nft-confirmed", onConfirmed as any);
    };
  }, [address]);

  // === Audio ===
  useEffect(() => {
    const onFeed = () => audio.playEatSfx();
    const onCatStart = () => audio.playCatastrophe();
    const onCatEnd = () => audio.playCatEnd();
    window.addEventListener("wg:fed", onFeed as any);
    window.addEventListener("wg:catastrophe-start", onCatStart as any);
    window.addEventListener("wg:catastrophe-end", onCatEnd as any);
    return () => {
      window.removeEventListener("wg:fed", onFeed as any);
      window.removeEventListener("wg:catastrophe-start", onCatStart as any);
      window.removeEventListener("wg:catastrophe-end", onCatEnd as any);
    };
  }, []);

  const gate: "splash" | "locked" | "game" =
    !isConnected
      ? "splash"
      : forceGame || livesCount > 0
      ? "game"
      : "locked";

  const tamagotchiKey = `wg-${String(chainId ?? MONAD_CHAIN_ID)}-${String(
    activeAddr || "none"
  )}`;

  return (
    <div className="wrap">
      {/* Hidden audio tags */}
      <audio id="sfx_eat" src="/audio/eat.mp3" preload="auto" />
      <audio id="sfx_catastrophe" src="/audio/catastrophe.mp3" preload="auto" />
      <audio id="sfx_cat_end" src="/audio/cat_end.mp3" preload="auto" />

      <header className="topbar">
        <div className="brand">
          <div className="logo">🐣</div>
          <div className="title">Wooligotchi</div>
        </div>

        <div className="walletRow">
          <MuteButton />

          {isConnected ? (
            <>
              <span className="pill">
                {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—"}
              </span>
              <span className="pill">Chain: {chainId ?? "—"}</span>
              <button className="btn" onClick={() => setVaultOpen(true)}>
                Send NFT
              </button>
              <button className="btn btn-ghost" onClick={() => disconnect()}>
                Disconnect
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => setPickerOpen(true)}>
              Connect
            </button>
          )}
        </div>
      </header>

      {gate === "splash" && (
        <section className="card splash">
          <div className="splash-inner">
            <div className="splash-title">Wooligotchi</div>
            <div className="muted">Send 1 NFT → get 1 life (to the Vault)</div>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => setPickerOpen(true)}
            >
              Connect Wallet
            </button>
          </div>
        </section>
      )}

      {gate === "locked" && (
        <>
          {/* Mount game even when locked so DeathOverlay can show immediately */}
          <div style={{ maxWidth: 980, margin: "0 auto" }}>
            <Tamagotchi
              key={tamagotchiKey}
              walletAddress={activeAddr || undefined}
              lives={0}
            />
          </div>

          <section className="card splash" style={{ maxWidth: 640, margin: "24px auto" }}>
            <div className="splash-inner">
              <div className="splash-title" style={{ marginBottom: 8 }}>
                No lives on this wallet
              </div>
              <div className="muted" style={{ marginBottom: 16, textAlign: "center" }}>
                Send 1 NFT to the Vault to start. If another wallet already has a life,
                switch to it and your pet will continue from there.
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                {!isConnected ? (
                  <button className="btn btn-primary btn-lg" onClick={() => setPickerOpen(true)}>
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
            key={tamagotchiKey}
            walletAddress={activeAddr || undefined}
            lives={livesCount}
          />
        </div>
      )}

      {pickerOpen && (
        <div onClick={() => setPickerOpen(false)} className="modal">
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: 460, maxWidth: "92vw" }}
          >
            <div className="title" style={{ fontSize: 20, marginBottom: 10, color: "white" }}>
              Connect a wallet
            </div>
            <div className="wallet-grid">
              {connectors.map((c) => (
                <button
                  key={c.id}
                  className="btn"
                  disabled={connectStatus === "pending"}
                  onClick={() => connect({ connector: c })}
                >
                  {c.name}
                </button>
              ))}
            </div>
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
            <VaultPanel onDone={() => setVaultOpen(false)} />
          </div>
        </div>
      )}

      <footer className="footer">
        <div className="muted">Monad testnet mini-app • Woolly Eggs</div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <WagmiProvider config={config}>
      <AppInner />
    </WagmiProvider>
  );
}
