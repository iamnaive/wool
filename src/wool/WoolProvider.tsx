// src/wool/WoolProvider.tsx
// Comments: English only.

import { apiCollect } from "./woolApi";
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { useAccount, usePublicClient, useChainId } from "wagmi";

type WoolLedger = { total: number; days: Record<string, { collected: number }> };
type WoolAPI = {
  address: string;
  enabled: boolean;
  todayLimit: number;
  todayCollected: number;
  todayRemaining: number;
  total: number;
  collectOne: () => Promise<boolean>;
  forceEnable: (on: boolean) => void;
  ymd: string;
};

const WoolCtx = createContext<WoolAPI | null>(null);

const DAILY_CAP = 5;
const LS_PREFIX = "wg_wool_v1::";
const STAGE_LS_KEY = "wg_force_stage"; // dev-localStorage flag (disabled in gate below)

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

  // UI flag; the effective gate uses ONLY enabledState to avoid dev forces
  const [enabledState, setEnabledState] = useState(false);
  const forceRef = useRef(false); // [DISABLED FORCE] kept for compatibility/logs
  const [ymd, setYmd] = useState(() => ymdFromDate(new Date()));
  const [ledger, setLedger] = useState<WoolLedger>(() => loadLedger(address));
  const collectingRef = useRef(false);

  // ---------- Dev helpers on window ----------
  useEffect(() => {
    // [DISABLED FORCE] do not allow programmatic forcing via window helper
    (window as any).wgSetForce = (on: boolean) => {
      console.log("[WOOL] wgSetForce called but force is disabled; ignoring:", on);
      // forceRef.current = !!on; // disabled
      // setEnabledState(prev => prev || !!on); // disabled
    };
    (window as any).wgDebugCollect = async (n = 1) => {
      console.log("[WOOL] wgDebugCollect start", { n, address, chainId, enabledState, force: forceRef.current, ymd });
      for (let i = 0; i < n; i++) { try { await collectOne(); } catch (e) { console.error("[WOOL] wgDebugCollect error", e); } }
      console.log("[WOOL] wgDebugCollect done");
    };
    (window as any).wgWoolClearToday = () => {
      try {
        const bag = loadLedger(address);
        const d = bag.days[ymd] || { collected: 0 };
        d.collected = 0;
        bag.days[ymd] = d;
        saveLedger(address, bag);
        setLedger({ ...bag });
        console.log("[WOOL] cleared local day count");
      } catch {}
    };
  }, [address, chainId, enabledState, ymd]);
  // ------------------------------------------

  // [DISABLED FORCE] do not auto-enable from localStorage "wg_force_stage"
  useEffect(() => {
    try {
      const forced = (localStorage.getItem(STAGE_LS_KEY) || "").toLowerCase();
      if (forced === "adult") {
        console.log("[WOOL] localStorage wg_force_stage=adult detected but force is disabled; ignoring");
        // setEnabledState(true); // disabled
        // forceRef.current = true; // disabled
        // (window as any).__wg_last_stage = "adult"; // disabled
      }
    } catch {}
  }, []);

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
      // Remember last stage for debug only
      (window as any).__wg_last_stage = stage;
      // Effective UI state reflects real stage only
      setEnabledState(stage === "adult");
      console.log("[WOOL] event wg:pet-stage", stage, "-> enabledState:", stage === "adult");
    };

    // [DISABLED FORCE] do not accept external "force" event
    const onForce = (ev: Event) => {
      const det = (ev as CustomEvent).detail as { on?: boolean } | undefined;
      console.log("[WOOL] event wg:wool-force received but force is disabled; ignoring", det);
      // forceRef.current = !!det?.on; // disabled
      // setEnabledState(prev => prev || forceRef.current); // disabled
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
  }, []);

  // Effective gate: ONLY real stage (adult) controls enablement
  const isEnabledNow = () => {
    return enabledState; // no dev forces, no localStorage override
  };

  const collectOne = useCallback(async (): Promise<boolean> => {
    const enabled = isEnabledNow();
    console.log("[WOOL] collectOne invoked", {
      enabled,
      enabledState,
      force: forceRef.current, // informational only
      address,
      chainId,
      anon: address === "anon",
      ymd
    });

    if (!enabled) { console.log("[WOOL] collect blocked: not enabled"); return false; }
    if (address === "anon") { console.warn("[WOOL] wallet not connected"); return false; }
    if (collectingRef.current) { console.log("[WOOL] collect debounced"); return false; }
    collectingRef.current = true;

    try {
      const now = await getChainNow(publicClient);
      const dayKey = ymdFromDate(now);
      if (dayKey !== ymd) setYmd(dayKey);

      // optimistic local update with cap guard
      const current = loadLedger(address);
      const dayEntry = current.days[dayKey] || { collected: 0 };
      if (dayEntry.collected >= DAILY_CAP) {
        console.log("[WOOL] reached DAILY_CAP", DAILY_CAP);
        return false;
      }
      dayEntry.collected += 1;
      current.days[dayKey] = dayEntry;
      current.total = (current.total || 0) + 1;
      saveLedger(address, current);
      setLedger({ ...current });

      // server write
      const chId =
        (typeof chainId === "number" && chainId) ||
        Number((publicClient as any)?.chain?.id ?? 0);

      console.log("[WOOL] → apiCollect", {
        address,
        chId,
        dayKey,
        localTotal: current.total,
        localDay: dayEntry.collected
      });

      // NOTE: keep your existing apiCollect signature
      const server = await apiCollect(address as `0x${string}`, chId).catch((e) => {
        console.error("[WOOL] apiCollect error", e);
        return null;
      });

      if (!server || !server.ok) {
        // rollback on reject
        console.warn("[WOOL] server rejected; rolling back");
        dayEntry.collected -= 1;
        current.days[dayKey] = dayEntry;
        current.total = Math.max(0, (current.total || 0) - 1);
        saveLedger(address, current);
        setLedger({ ...current });
        return false;
      }

      console.log("[WOOL] server ok", server);

      // sync with server response (optional but safer)
      const srvDay = server.ymd || dayKey;
      const synced = loadLedger(address);
      const sEntry = synced.days[srvDay] || { collected: 0 };
      if (typeof server.dayCount === "number") {
        sEntry.collected = Math.max(sEntry.collected, server.dayCount);
      }
      synced.days[srvDay] = sEntry;
      if (typeof server.total === "number") {
        synced.total = Math.max(synced.total || 0, server.total);
      }
      saveLedger(address, synced);
      setLedger({ ...synced });

      // return false only if server says capped=true
      return !(server.capped === true);
    } finally {
      // small anti-spam delay
      setTimeout(() => { collectingRef.current = false; }, 150);
    }
  }, [address, chainId, publicClient, ymd, enabledState]);

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
      // [DISABLED FORCE] keep the signature, make it a no-op to avoid forcing
      forceEnable: (on: boolean) => {
        console.log("[WOOL] forceEnable called but force is disabled; ignoring:", on);
        // forceRef.current = !!on; // disabled
        // setEnabledState(prev => prev || !!on); // disabled
      },
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
