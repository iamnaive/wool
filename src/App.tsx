// src/App.tsx
// Gate fixes + optimistic life persist across reloads.
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
import "./styles.css";

// === Audio (minimal listeners) ===
import { audio } from "./audio/AudioManager";
import { MuteButton } from "./audio/MuteButton";

// ===== ENV =====
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
  CB_APP ? coinbaseWallet({ appName: CB_APP }) : null,
].filter(Boolean) as any[];

// ===== WAGMI CONFIG (LOCAL) =====
const config = createConfig({
  chains: [MONAD],
  connectors: connectorsList,
  transports: { [MONAD.id]: http(RPC_URL) },
});

// ===== Optional: polling authoritative lives =====
function useRemoteLives(chainId?: number, address?: string | null) {
  const [lives, setLives] = useState(0);
  useEffect(() => {
    let t: any;
    async function tick() {
      try {
        if (!address) {
          setLives(0);
          return;
        }
        const r = await fetch(
          `${String(LIVES_REST).replace(/\/$/, "")}/lives/${address}`
        );
        const j = r.ok ? await r.json() : { lives: 0 };
        const v = Number(j?.lives || 0);
        setLives(v);
        window.dispatchEvent(
          new CustomEvent("wg:lives-changed", {
            detail: { chainId: chainId ?? MONAD_CHAIN_ID, address, lives: v },
          })
        );
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
  const { connect, connectors, status: connectStatus } = useConnect();
  const { disconnect } = useDisconnect();

  // --- optimistic life persist (per wallet, 15 min TTL) ---
  const PENDING_KEY = (addr?: string | null) =>
    `wg_${(addr || "").toLowerCase()}__pending_life`;
  const setPendingLife = (addr?: string | null) => {
    try { if (addr) localStorage.setItem(PENDING_KEY(addr), String(Date.now())); } catch {}
  };
  const clearPendingLife = (addr?: string | null) => {
    try { if (addr) localStorage.removeItem(PENDING_KEY(addr)); } catch {}
  };
  const hasPendingLife = (addr?: string | null, ttlMs = 15 * 60_000) => {
    try {
      if (!addr) return false;
      const raw = localStorage.getItem(PENDING_KEY(addr));
      if (!raw) return false;
      const t = Number(raw) || 0;
      return Date.now() - t <= ttlMs;
    } catch { return false; }
  };

  // Keep last non-null address to preserve game key between reconnects
  const [activeAddr, setActiveAddr] = useState<string | null>(null);
  useEffect(() => {
    if (address) setActiveAddr(address);
  }, [address]);

  // Wallet picker modal
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickWallet = async (connectorId: string) => {
    try {
      const c = connectors.find((x) => x.id === connectorId);
      if (!c) return;
      await connect({ connector: c });
      setPickerOpen(false);
    } catch (e: any) {
      alert(e?.shortMessage || e?.message || "Connect failed");
    }
  };

  // Send-NFT modal (Vault)
  const [vaultOpen, setVaultOpen] = useState(false);

  // Do not unmount the game after the first successful connect
  const [keepGameMounted, setKeepGameMounted] = useState(false);
  useEffect(() => {
    if (isConnected) setKeepGameMounted(true);
  }, [isConnected]);

  // Lives from backend
  const livesFromBackend = useRemoteLives(chainId, address);

  // UI lives + force flag
  const [livesCount, setLivesCount] = useState(0);
  const [forceGame, setForceGame] = useState(false);

  // Keep UI lives in sync with backend; clear pending if real lives arrived
  useEffect(() => {
    setLivesCount(livesFromBackend);
    if (livesFromBackend > 0) {
      clearPendingLife(address);
      setForceGame(false);
    }
  }, [livesFromBackend, address]);

  // reset flags on wallet/chain change + honor pending life
  useEffect(() => {
    setForceGame(false);
    setLivesCount(0);
    setVaultOpen(false);
    if (hasPendingLife(address)) {
      setForceGame(true);
      setLivesCount((prev) => (prev > 0 ? prev : 1));
    }
  }, [address, chainId]);

  // Bridge events
  useEffect(() => {
    const onRequestNft = () => setVaultOpen(true);
    const onConfirmed = (e: Event) => {
      const ce = e as CustomEvent;
      const evAddr = String((ce?.detail as any)?.address || "").toLowerCase();
      const cur = String(address || "").toLowerCase();
      if (!evAddr || !cur || evAddr !== cur) return;
      setVaultOpen(false);
      setForceGame(true);
      setLivesCount((prev) => (prev > 0 ? prev : 1));
      setPendingLife(address); // persist across reloads
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
    const onCatastrophe = (e: Event) => {
      const ce = e as CustomEvent;
      const on = Boolean((ce?.detail as any)?.on);
      audio.setCatastrophe(on);
    };
    const onCatStart = () => audio.setCatastrophe(true);
    const onCatEnd = () => audio.setCatastrophe(false);

    window.addEventListener("wg:feed", onFeed as any);
    window.addEventListener("wg:catastrophe", onCatastrophe as any);
    window.addEventListener("wg:catastrophe-start", onCatStart as any);
    window.addEventListener("wg:catastrophe-end", onCatEnd as any);

    return () => {
      window.removeEventListener("wg:feed", onFeed as any);
      window.removeEventListener("wg:catastrophe", onCatastrophe as any);
      window.removeEventListener("wg:catastrophe-start", onCatStart as any);
      window.removeEventListener("wg:catastrophe-end", onCatEnd as any);
    };
  }, []);

  const gate: "splash" | "locked" | "game" =
    !isConnected && !keepGameMounted
      ? "splash"
      : forceGame || livesCount > 0
      ? "game"
      : "locked";

  const tamagotchiKey = `wg-${String(chainId ?? MONAD_CHAIN_ID)}-${String(
    (activeAddr || "anon").toLowerCase()
  )}`;

  return (
    <div className="page">
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
              <span className="pill">Lives: {livesCount}</span>
              <button
                className="btn btn-primary"
                onClick={() => setVaultOpen(true)}
                style={{ marginLeft: 8 }}
              >
                Send NFT (+1 life)
              </button>
              <button className="btn ghost" onClick={() => disconnect()}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              {keepGameMounted && (
                <span
                  className="pill"
                  style={{
                    borderColor: "rgba(255,160,0,0.5)",
                    background: "rgba(255,160,0,0.12)",
                  }}
                >
                  Wallet disconnected — reconnect to send NFT
                </span>
              )}
              <button
                className="btn btn-primary"
                onClick={() => setPickerOpen(true)}
                style={{ marginLeft: 8 }}
              >
                Connect
              </button>
            </>
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
                  onClick={() => pickWallet(c.id)}
                  disabled={connectStatus === "pending"}
                  className="btn btn-ghost"
                  style={{ width: "100%" }}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setPickerOpen(false)} className="btn">Close</button>
            </div>
          </div>
        </div>
      )}

      {vaultOpen && (
        <div onClick={() => setVaultOpen(false)} className="modal">
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: 520, maxWidth: "94vw" }}
          >
            <div className="title" style={{ color: "white", marginBottom: 8 }}>
              Send 1 NFT → +1 life
            </div>
            <VaultPanel />
            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setVaultOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
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
