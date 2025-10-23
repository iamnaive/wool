"use client";

/**
 * WalletModal — wallet chooser modal with distinct buttons:
 * MetaMask, Phantom, Backpack, Keplr, WalletConnect.
 * Works with wagmi v2 config from utils/wagmiConfigLike.
 */

import React, { useMemo } from "react";
import { useConnect } from "wagmi";

export default function WalletModal({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { connectAsync, connectors, isPending } = useConnect();

  const items = useMemo(() => {
    // Build labeled list similar to your zip logic
    return connectors
      .map((c) => {
        const id = (c as any).id ?? (c as any).uid ?? c.name;
        const opts: any = (c as any).options ?? {};
        let label = c.name;

        if (c.type === "injected" && opts?.target === "metaMask")  label = "MetaMask";
        if (c.type === "injected" && opts?.target === "phantom")   label = "Phantom";
        if (c.type === "injected" && opts?.target === "backpack")  label = "Backpack";
        if (c.type === "injected" && opts?.target === "keplr")     label = "Keplr";
        if (/walletconnect/i.test(c.name) || id === "walletConnect") label = "WalletConnect";

        const prio =
          label === "MetaMask" ? 1 :
          label === "Phantom" ? 2 :
          label === "Backpack" ? 3 :
          label === "Keplr" ? 4 :
          label === "WalletConnect" ? 5 : 99;

        return { key: id, label, connector: c, prio };
      })
      .filter((x, i, arr) => i === arr.findIndex(y => y.label === x.label)) // dedupe by label
      .sort((a, b) => a.prio - b.prio);
  }, [connectors]);

  if (!open) return null;

  return (
    <div
      className="modal"
      onClick={onClose}
      style={{ zIndex: 1000 }}
    >
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "92vw" }}>
        <div className="title" style={{ fontSize: 20, marginBottom: 10, color: "white" }}>Connect a wallet</div>

        <div className="wallet-grid" style={{ marginTop: 12 }}>
          {items.map(({ key, label, connector }) => (
            <button
              key={key}
              className="btn"
              disabled={isPending || !connector.ready}
              title={!connector.ready ? `${label} not available` : `Connect with ${label}`}
              onClick={async () => {
                try {
                  await connectAsync({ connector });
                  onClose();
                } catch {
                  // keep modal open to try another option
                }
              }}
            >
              {isPending ? "Connecting…" : label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
