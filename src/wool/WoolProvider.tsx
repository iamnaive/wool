// src/wool/WoolProvider.tsx
// Comments: English only.

import { apiCollect } from "./woolApi";
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { useAccount, usePublicClient, useChainId } from "wagmi";

type WoolLedger = { total: number; days: Record<string, { collected: number }> };
type WoolAPI = {
  address: string; enabled: boolean; todayLimit: number; todayCollected: number;
  todayRemaining: number; total: number; collectOne: () => Promise<boolean>;
  forceEnable: (on: boolean) => void; ymd: string;
};

const WoolCtx = createContext<WoolAPI | null>(null);

const DAILY_CAP = 5;
const LS_PREFIX = "wg_wool_v1::";

async function getChainNow(publicClient: ReturnType<typeof usePublicClient> | null): Promise<Date> {
  try {
    if (!publicClient) throw new Error("no client");
    const block = await publicClient.getBlock({ blockTag: "latest" });
    return new Date(Number(block.timestamp) * 1000);
  } catch {
    return new Date();
  }
}
function ymdFromDate(d: Date) {
  const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, "0"), day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
function loadLedger(addr: string): WoolLedger {
  try {
    const raw = localStorage.getItem(LS_PREFIX + addr);
    if (!raw) return { total: 0, days: {} };
    const parsed = JSON.parse(raw) as WoolLedger;
    if (!parsed || typeof parsed.total !== "number" || typeof parsed.days !== "object") return { total: 0, days: {} };
    return parsed;
  } catch { return { total: 0, days: {} }; }
}
function saveLedger(addr: string, led: WoolLedger) {
  try { localStorage.setItem(LS_PREFIX + addr, JSON.stringify(led)); } catch {}
}

export const WoolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { address: wagmiAddr } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  const address = (wagmiAddr?.toLowerCase() ?? "anon");

  const [enabledState, setEnabledState] = useState(false);       // UI-state
  const forceRef = useRef(false);                                 // immediate force gate (no React lag)
  const [ymd, setYmd] = useState(() => ymdFromDate(new Date()));
  const [ledger, setLedger] = useState<WoolLedger>(() => loadLedger(address));
  const collectingRef = useRef(false);

  // Expose quick dev helpers on window
  useEffect(() => {
    (window as any).wgSetForce = (on: boolean) => { forceRef.current = !!on; console.log("[WOOL] force set ->", forceRef.current); };
    (window as any).wgDebugCollect = async (n = 1) => {
      console.log("[WOOL] wgDebugCollect start", { n, address, chainId, enabledState, force: forceRef.current, ymd });
      for (let i = 0; i < n; i++) { try { await collectOne(); } catch (e) { console.error("[WOOL] wgDebugCollect error", e); } }
      console.log("[WOOL] wgDebugCollect done");
    };
  }, [address, chainId, enabledState, ymd]);

  // Address change -> reload local ledger
  useEffect(() => { setLedger(loadLedger(address)); }, [address]);

  // Keep day key fresh (chain time preferred)
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const key = ymdFromDate(await getChainNow(publicClient));
      if (alive && key !== ymd) { console.log("[WOOL] day rollover", ymd, "->", key); setYmd(key); }
    };
    tick();
    const t = setInterval(tick, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [publicClient, ymd]);

  // Events
  useEffect(() => {
    const onStage = (ev: Event) => {
      const det = (ev as CustomEvent).detail as { stage?: string } | undefined;
      const stage = (det?.stage || "").toLowerCase();
      setEnabledState(stage === "adult");
      console.log("[WOOL] event wg:pet-stage", stage, "-> enabledState:", stage === "adult");
    };
    const onForce = (ev: Event) => {
      const det = (ev as CustomEvent).detail as { on?: boolean } | undefined;
      forceRef.current = !!det?.on;             // immediate toggle (no async setState)
      setEnabledState(prev => prev || forceRef.current); // keep UI in sync (optional)
      console.log("[WOOL] event wg:wool-force", forceRef.current);
    };
    const onClick = async () => {
      console.log("[WOOL] event wg:wool-click (received)");
      await collectOne();
    };
    window.addEventListener("wg:pet-stage", onStage as EventListener);
    window.addEventListener("wg:wool-force", onForce as EventListener);
    window.addEventListener("wg:wool-click", onClick as EventListener);
    console.log("[WOOL] Provider mounted");
    return () => {
      window.removeEventListener("wg:pet-stage", onStage as EventListener);
      window.removeEventListener("wg:wool-force", onForce as EventListener);
      window.removeEventListener("wg:wool-click", onClick as EventListener);
    };
  }, []); // mount once

  // Gate check uses BOTH UI-state and forceRef
  const isEnabledNow = () => enabledState || forceRef.current;

  const collectOne = useCallback(async (): Promise<boolean> => {
    const enabled = isEnabledNow();
    console.log("[WOOL] collectOne invoked", { enabled, enabledState, force: forceRef.current, address, chainId, anon: address === "anon", ymd });

    if (!enabled) { console.log("[WOOL] collect blocked: not enabled"); return false; }
    if (address === "anon") { console.warn("[WOOL] wallet not connected"); return false; }
    if (collectingRef.current) { console.log("[WOOL] collect debounced"); return false; }
    collectingRef.current = true;

    try {
      const now = await getChainNow(publicClient);
      const dayKey = ymdFromDate(now);
      if (dayKey !== ymd) setYmd(dayKey);

      // optimistic local update
      const current = loadLedger(address);
      const dayEntry = current.days[dayKey] || { collected: 0 };
      if (dayEntry.collected >= DAILY_CAP) { console.log("[WOOL] reached DAILY_CAP", DAILY_CAP); return false; }
      dayEntry.collected += 1;
      current.days[dayKey] = dayEntry;
      current.total = (current.total || 0) + 1;
      saveLedger(address, current);
      setLedger({ ...current });

      // server write
      const chId = (typeof chainId === "number" && chainId) || Number((publicClient as any)?.chain?.id ?? 0);
      console.log("[WOOL] → apiCollect", { address, chId, dayKey, localTotal: current.total, localDay: dayEntry.collected });
      const server = await apiCollect(address as `0x${string}`, chId).catch((e) => { console.error("[WOOL] apiCollect error", e); return null; });

      if (!server || !server.ok) {
        console.warn("[WOOL] server rejected; rolling back");
        dayEntry.collected -= 1;
        current.days[dayKey] = dayEntry;
        current.total = Math.max(0, (current.total || 0) - 1);
        saveLedger(address, current);
        setLedger({ ...current });
        return false;
      }

      console.log("[WOOL] server ok", server);
      const srvDay = server.ymd || dayKey;
      const synced = loadLedger(address);
      const sEntry = synced.days[srvDay] || { collected: 0 };
      if (typeof server.dayCount === "number") sEntry.collected = Math.max(sEntry.collected, server.dayCount);
      synced.days[srvDay] = sEntry;
      if (typeof server.total === "number") synced.total = Math.max(synced.total || 0, server.total);
      saveLedger(address, synced);
      setLedger({ ...synced });

      return !(server.capped === true);
    } finally {
      setTimeout(() => { collectingRef.current = false; }, 200);
    }
  }, [address, chainId, publicClient, ymd]);

  const api: WoolAPI = useMemo(() => {
    const dayEntry = ledger.days[ymd] || { collected: 0 };
    const todayCollected = Math.max(0, Math.min(DAILY_CAP, dayEntry.collected || 0));
    const todayRemaining = Math.max(0, DAILY_CAP - todayCollected);
    return {
      address,
      enabled: isEnabledNow(),
      todayLimit: DAILY_CAP,
      todayCollected,
      todayRemaining,
      total: ledger.total || 0,
      collectOne,
      forceEnable: (on: boolean) => { forceRef.current = !!on; setEnabledState(prev => prev || !!on); },
      ymd,
    };
  }, [address, ledger, ymd, collectOne, enabledState]);

  return <WoolCtx.Provider value={api}>{children}</WoolCtx.Provider>;
};

export function useWool() {
  const ctx = useContext(WoolCtx);
  if (!ctx) throw new Error("useWool must be used within <WoolProvider>");
  return ctx;
}
