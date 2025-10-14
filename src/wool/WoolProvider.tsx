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

import { apiCollect } from "./woolApi";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAccount, usePublicClient, useChainId } from "wagmi";

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
  const chainId = useChainId(); // ← explicit chainId (more reliable for signing/API)
  const publicClient = usePublicClient();

  const address = (wagmiAddr?.toLowerCase() ?? "anon");
  const [enabled, setEnabled] = useState(false);
  const [ymd, setYmd] = useState<string>(() => ymdFromDate(new Date()));
  const [ledger, setLedger] = useState<WoolLedger>(() => loadLedger(address));
  const collectingRef = useRef(false); // debounce "double click" spam

  // Dev helper: quick collector exposed to window (does NOT change app logic)
  useEffect(() => {
    (window as any).wgDebugCollect = async (n = 1) => {
      console.log("[WOOL] wgDebugCollect start", {
        n,
        address,
        chainId,
        enabled,
        ymd,
      });
      for (let i = 0; i < n; i++) {
        try {
          // Force-enable path is still via events; here we just call collectOne()
          // to see end-to-end API flow and logs.
          // If you need force, dispatch wg:wool-force beforehand.
          // @ts-ignore
          await collectOne();
        } catch (e) {
          console.error("[WOOL] wgDebugCollect error", e);
        }
      }
      console.log("[WOOL] wgDebugCollect done");
    };
  }, [address, chainId, enabled, ymd]);

  // Refresh ledger when address changes
  useEffect(() => {
    setLedger(loadLedger(address));
  }, [address]);

  // Update day key using chain time when possible
  const refreshDay = useCallback(async () => {
    const now = await getChainNow(publicClient);
    const key = ymdFromDate(now);
    if (key !== ymd) {
      console.log("[WOOL] day rollover", ymd, "->", key);
      setYmd(key);
    }
  }, [publicClient, ymd]);

  useEffect(() => {
    refreshDay(); // initial
    const t = setInterval(refreshDay, 60000);
    return () => clearInterval(t);
  }, [refreshDay]);

  // Listen to stage events
  useEffect(() => {
    const onStage = (ev: Event) => {
      const det = (ev as CustomEvent).detail as { stage?: string } | undefined;
      const stage = (det?.stage || "").toLowerCase();
      setEnabled(stage === "adult");
      console.log("[WOOL] event wg:pet-stage", stage, "-> enabled:", stage === "adult");
    };
    window.addEventListener("wg:pet-stage", onStage as EventListener);
    return () => window.removeEventListener("wg:pet-stage", onStage as EventListener);
  }, []);

  // Manual override if your project uses different event names
  useEffect(() => {
    const onForce = (ev: Event) => {
      const det = (ev as CustomEvent).detail as { on?: boolean } | undefined;
      setEnabled(!!det?.on);
      console.log("[WOOL] event wg:wool-force", !!det?.on);
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
    // Visible logs to ensure we see every attempt
    console.log("[WOOL] collectOne invoked", {
      enabled,
      address,
      chainId,
      anon: address === "anon",
      ymd,
    });

    if (!enabled) {
      console.log("[WOOL] collect blocked: not enabled");
      return false;
    }
    if (address === "anon") {
      console.warn("[WOOL] wallet not connected -> server will reject. Connect wallet to record globally.");
      return false;
    }
    if (collectingRef.current) {
      console.log("[WOOL] collect debounced");
      return false; // debounce
    }
    collectingRef.current = true;

    try {
      // Resolve current day (chain time if available)
      const now = await getChainNow(publicClient);
      const dayKey = ymdFromDate(now);
      if (dayKey !== ymd) setYmd(dayKey);

      // Local optimistic update
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

      // Server authoritative update
      // Prefer wagmi chainId; fallback to viem client if needed.
      const chId =
        (typeof chainId === "number" && chainId) ||
        Number((publicClient as any)?.chain?.id ?? 0);

      console.log("[WOOL] → apiCollect", { address, chId, dayKey, localTotal: current.total, localDay: dayEntry.collected });
      const server = await apiCollect(address as `0x${string}`, chId).catch((e) => {
        console.error("[WOOL] apiCollect error", e);
        return null;
      });

      if (!server || !server.ok) {
        console.warn("[WOOL] server rejected; rolling back");
        // rollback if server rejected
        dayEntry.collected -= 1;
        current.days[dayKey] = dayEntry;
        current.total = Math.max(0, (current.total || 0) - 1);
        saveLedger(address, current);
        setLedger({ ...current });
        return false;
      }

      console.log("[WOOL] server ok", server);

      // Align local state to server response
      const srvDay = (server as any).ymd || dayKey;
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

      return !(server.capped === true);
    } finally {
      setTimeout(() => {
        collectingRef.current = false;
      }, 200);
    }
  }, [address, enabled, publicClient, ymd, chainId]);

  // Listen to "wg:wool-click" from your existing UI
  useEffect(() => {
    const onClick = async () => {
      console.log("[WOOL] event wg:wool-click (received)");
      await collectOne();
    };
    window.addEventListener("wg:wool-click", onClick as EventListener);
    console.log("[WOOL] Provider mounted");
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
      ymd,
    };
  }, [address, collectOne, enabled, ledger, ymd]);

  return <WoolCtx.Provider value={api}>{children}</WoolCtx.Provider>;
};

export function useWool() {
  const ctx = useContext(WoolCtx);
  if (!ctx) throw new Error("useWool must be used within <WoolProvider>");
  return ctx;
}
