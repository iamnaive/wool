// src/App.tsx
// Keep game mounted on wallet disconnect; avoid repeated "Send NFT" after confirm.
// Comments: English only.

import React, { useEffect, useMemo, useState } from "react";
import {
  WagmiProvider,
  useAccount,
  useConnect,
  useDisconnect,
  useChainId,
} from "wagmi";
import wagmiConfig from "./wagmiConfigLike"; // default export ONLY
import Tamagotchi from "./components/Tamagotchi";
import VaultPanel from "./components/VaultPanel";
import "./styles.css";

// Use env for chain id (your wagmiConfigLike does not export chain)
const MONAD_CHAIN_ID: number = Number(
  (import.meta as any).env?.VITE_CHAIN_ID ?? 10143
);

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

  // Lives count coming from backend via custom event (optional)
  const [livesCount, setLivesCount] = useState(0);

  // Force the UI into "game" immediately after NFT confirm,
  // so user won’t see "Send NFT" again while backend syncs.
  const [forceGame, setForceGame] = useState(false);

  // Bridge events: Tamagotchi -> App (open vault modal / grant life)
  useEffect(() => {
    const onRequestNft = () => setVaultOpen(true);

    const onConfirmed = (e: any) => {
      // Close the modal immediately
      setVaultOpen(false);
      // Force game even if lives haven't synced yet
      setForceGame(true);
      // Soft bump lives visually; backend will overwrite soon
      setLivesCount((prev) => (prev > 0 ? prev : 1));
      // If you also mirror to local storage elsewhere by chainId, use MONAD_CHAIN_ID
      // to avoid mismatched keys when chainId is undefined during reconnects.
      // Example (only if you have a local store):
      // grantLives(MONAD_CHAIN_ID, address, 1);
    };

    const onLivesChanged = (e: any) => {
      try {
        const d = e?.detail || {};
        if (typeof d.lives === "number") {
          setLivesCount(d.lives);
          if (d.lives > 0) setForceGame(false);
        }
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("wg:request-nft", onRequestNft as any);
    window.addEventListener("wg:nft-confirmed", onConfirmed as any);
    window.addEventListener("wg:lives-changed", onLivesChanged as any);
    return () => {
      window.removeEventListener("wg:request-nft", onRequestNft as any);
      window.removeEventListener("wg:nft-confirmed", onConfirmed as any);
      window.removeEventListener("wg:lives-changed", onLivesChanged as any);
    };
  }, [address]);

  // Gate:
  // - If never connected: show splash
  // - Else if we have no lives and not forcing game: show locked
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
            <div className="splash-title">No lives</div>
            <div className="muted">Send 1 NFT → get 1 life</div>
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
    <WagmiProvider config={wagmiConfig}>
      <AppInner />
    </WagmiProvider>
  );
}
