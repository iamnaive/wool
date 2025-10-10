// src/wool/WoolProvider.tsx
// WOOL drop/collect logic with per-wallet daily cap and simple anti-cheat.
// Integrates non-invasively via window events and (optionally) a #btn-wool element.
//
// Events listened:
//  - "wg:pet-stage" {detail:{stage:"egg"|"child"|"adult"}} -> enables/disables daily spawn
//  - "wg:wool-click" -> attempts to collect one available ball
//  - "wg:wool-force" {detail:{on:boolean}} -> manual override if your stage event has a different name
//
// UI hooks:
//  - <WoolHUD/> displays total + today's remaining and exposes a collect() for your button if you prefer.
//
// Requirements:
//  - Sprites in /public/sprites/wool/ball1.png ... ball3.png (optional visual layer)
//  - Wagmi in app (we read the connected address). If not connected, we use "anon".
//
// Anti-cheat (client-side best effort):
//  - Daily cap = 5 per address
//  - Day boundary from latest block timestamp when available (viem public client), else local time
//  - Debounce on collect; idempotent storage updates
//
// Storage keys:
//  - wg_wool_v1::<address>   -> { total:number, days: { ymd:string -> { collected:number } } }

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";

type WoolLedger = {
  total: number;
  days: Record<string, { collected: number }>;
};

type WoolAPI = {
  address: string;
  enabled: boolean;
  todayLimit: number;      // 5
  todayCollected: number;  // 0..5
  todayRemaining: number;  // 5 - collected
  total: number;
  collectOne: () => Promise<boolean>; // returns true if collected
  forceEnable: (on: boolean) => void;
  ymd: string; // current day key
};

const WoolCtx = createContext<WoolAPI | null>(null);

const DAILY_CAP = 5;
const LS_PREFIX = "wg_wool_v1::";

// Prefer chain time when we can (harder to spoof than local clock).
async function getChainNow(publicClient: ReturnType<typeof usePublicClient> | null): Promise<Date> {
  try {
    if (!publicClient) throw new Error("no client");
    const block = await publicClient.getBlock({ blockTag: "latest" });
    const ts = Number(block.timestamp) * 1000;
    return new Date(ts);
  } catch {
    return new Date();
  }
}

function ymdFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function loadLedger(addr: string): WoolLedger {
  try {
    const raw = localStorage.getItem(LS_PREFIX + addr);
    if (!raw) return { total: 0, days: {} };
    const parsed = JSON.parse(raw) as WoolLedger;
    if (!parsed || typeof parsed.total !== "number" || typeof parsed.days !== "object") {
      return { total: 0, days: {} };
    }
    return parsed;
  } catch {
    return { total: 0, days: {} };
  }
}

function saveLedger(addr: string, led: WoolLedger) {
  try {
    localStorage.setItem(LS_PREFIX + addr, JSON.stringify(led));
  } catch {}
}

export const WoolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { address: wagmiAddr } = useAccount();
  const publicClient = usePublicClient();

  const address = (wagmiAddr?.toLowerCase() ?? "anon");
  const [enabled, setEnabled] = useState(false);
  const [ymd, setYmd] = useState<string>(() => ymdFromDate(new Date()));
  const [ledger, setLedger] = useState<WoolLedger>(() => loadLedger(address));
  const collectingRef = useRef(false); // debounce "double click" spam

  // Refresh ledger when address changes
  useEffect(() => {
    setLedger(loadLedger(address));
  }, [address]);

  // Update day key using chain time when possible
  const refreshDay = useCallback(async () => {
    const now = await getChainNow(publicClient);
    setYmd(ymdFromDate(now));
  }, [publicClient]);

  useEffect(() => {
    // initial day calc
    refreshDay();
    // refresh every ~60s (lightweight)
    const t = setInterval(refreshDay, 60000);
    return () => clearInterval(t);
  }, [refreshDay]);

  // Listen to stage events
  useEffect(() => {
    const onStage = (ev: Event) => {
      const det = (ev as CustomEvent).detail as { stage?: string } | undefined;
      const stage = (det?.stage || "").toLowerCase();
      // Enable only when adult
      setEnabled(stage === "adult");
    };
    window.addEventListener("wg:pet-stage", onStage as EventListener);
    return () => window.removeEventListener("wg:pet-stage", onStage as EventListener);
  }, []);

  // Manual override if your project uses different event names
  useEffect(() => {
    const onForce = (ev: Event) => {
      const det = (ev as CustomEvent).detail as { on?: boolean } | undefined;
      setEnabled(!!det?.on);
    };
    window.addEventListener("wg:wool-force", onForce as EventListener);
    return () => window.removeEventListener("wg:wool-force", onForce as EventListener);
  }, []);

  // Optional: bind to a physical button with id="btn-wool"
  useEffect(() => {
    const el = document.getElementById("btn-wool");
    if (!el) return;
    const onClick = () => window.dispatchEvent(new CustomEvent("wg:wool-click"));
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, []);

  // Main collect handler
  const collectOne = useCallback(async (): Promise<boolean> => {
    if (!enabled) return false;
    if (collectingRef.current) return false; // debounce
    collectingRef.current = true;

    try {
      // Resolve current day (chain time if available)
      const now = await getChainNow(publicClient);
      const dayKey = ymdFromDate(now);

      // Rotate day if needed
      if (dayKey !== ymd) setYmd(dayKey);

      // Read current ledger
      const current = loadLedger(address);
      const dayEntry = current.days[dayKey] || { collected: 0 };

      // Enforce cap
      if (dayEntry.collected >= DAILY_CAP) return false;

      // Atomic-ish update
      dayEntry.collected += 1;
      current.days[dayKey] = dayEntry;
      current.total = (current.total || 0) + 1;

      saveLedger(address, current);
      setLedger(current);
      return true;
    } finally {
      // small delay to avoid ultra-fast double taps
      setTimeout(() => { collectingRef.current = false; }, 200);
    }
  }, [address, enabled, publicClient, ymd]);

  // Listen to "wg:wool-click" from your existing UI
  useEffect(() => {
    const onClick = async () => { await collectOne(); };
    window.addEventListener("wg:wool-click", onClick as EventListener);
    return () => window.removeEventListener("wg:wool-click", onClick as EventListener);
  }, [collectOne]);

  const api: WoolAPI = useMemo(() => {
    const dayEntry = ledger.days[ymd] || { collected: 0 };
    const todayCollected = Math.max(0, Math.min(DAILY_CAP, dayEntry.collected || 0));
    const todayRemaining = Math.max(0, DAILY_CAP - todayCollected);
    return {
      address,
      enabled,
      todayLimit: DAILY_CAP,
      todayCollected,
      todayRemaining,
      total: ledger.total || 0,
      collectOne,
      forceEnable: (on: boolean) => setEnabled(!!on),
      ymd
    };
  }, [address, collectOne, enabled, ledger, ymd]);

  return <WoolCtx.Provider value={api}>{children}</WoolCtx.Provider>;
};

export function useWool() {
  const ctx = useContext(WoolCtx);
  if (!ctx) throw new Error("useWool must be used within <WoolProvider>");
  return ctx;
}
