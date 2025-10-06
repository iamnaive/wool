// src/App.tsx
// Keep game mounted on wallet disconnect; avoid repeated "Send NFT" after confirm.
// Comments: English only.

import React, { useEffect, useMemo, useState } from "react";
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

// ===== Optional: small poller for authoritative lives =====
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
        // Broadcast to any listeners (e.g., other tabs/components)
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

  // Lives from backend poller
  const livesFromBackend = useRemoteLives(chainId, address);

  // UI lives + force flag so we don't show "Send NFT" again after confirm
  const [livesCount, setLivesCount] = useState(0);
  const [forceGame, setForceGame] = useState(false);
  
// When we enter the "locked" gate, force the pet to render as dead (preview)
useEffect(() => {
  if (gate === "locked") {
    window.dispatchEvent(new CustomEvent("wg:force-dead-preview"));
  }
}, [gate]);

  // Keep UI lives in sync with backend
  useEffect(() => {
    setLivesCount(livesFromBackend);
    if (livesFromBackend > 0) setForceGame(false);
  }, [livesFromBackend]);

  // Bridge events: Tamagotchi → App (open Vault); Vault → App (confirmed)
  useEffect(() => {
    const onRequestNft = () => setVaultOpen(true);

    const onConfirmed = (e: any) => {
      // Close modal immediately
      setVaultOpen(false);
      // Force enter the game even if backend lives haven't synced yet
      setForceGame(true);
      // Soft bump UI lives so the user won't see "Send NFT" again
      setLivesCount((prev) => (prev > 0 ? prev : 1));
      // If you mirror to local storage elsewhere by chainId, always use MONAD_CHAIN_ID here
      // to avoid mismatched keys during reconnects.
      // Example: grantLives(MONAD_CHAIN_ID, address, 1);
    };

    window.addEventListener("wg:request-nft", onRequestNft as any);
    window.addEventListener("wg:nft-confirmed", onConfirmed as any);
    return () => {
      window.removeEventListener("wg:request-nft", onRequestNft as any);
      window.removeEventListener("wg:nft-confirmed", onConfirmed as any);
    };
  }, [address]);

  // Gate:
  // - If never connected: show splash
  // - Else if 0 lives and not forcing game: show locked
  // - Else: show game (do not unmount on disconnect)
  const gate: "splash" | "locked" | "game" =
    !isConnected && !keepGameMounted
      ? "splash"
      : forceGame || livesCount > 0
      ? "game"
      : "locked";

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="logo">🐣</div>
          <div className="title">Wooligotchi</div>
        </div>

        <div className="walletRow">
          {isConnected ? (
            <>
              <span className="pill">
                {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—"}
              </span>
              <span className="pill">Chain: {chainId ?? "—"}</span>
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

      {/* Splash */}
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

      {/* Locked (no lives) — death screen */}
      {gate === "locked" && (
  <section className="card splash">
    <div className="splash-inner">
      <div className="splash-title">Your pet died while you were away</div>
      <div className="muted">
        Send 1 NFT → get 1 life and continue.
      </div>
      <button
        className="btn btn-primary"
        onClick={() => setVaultOpen(true)}
        style={{ marginTop: 12 }}
      >
        Send NFT
      </button>
    </div>
  </section>
)}


      {/* Game stays mounted even if wallet disconnects */}
      {gate === "game" && (
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <Tamagotchi />
        </div>
      )}

      {/* Wallet picker */}
      {pickerOpen && (
        <div onClick={() => setPickerOpen(false)} className="modal">
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ width: 460, maxWidth: "92vw" }}
          >
            <div
              className="title"
              style={{ fontSize: 20, marginBottom: 10, color: "white" }}
            >
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
            <div
              style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}
            >
              <button onClick={() => setPickerOpen(false)} className="btn">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vault modal (Send NFT) */}
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
