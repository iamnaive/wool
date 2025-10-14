// src/wool/woolApi.ts
// Signed calls to your Cloudflare Worker API.

import { v4 as uuidv4 } from "uuid";
import { signMessage } from "@wagmi/core";

// Fallback: use your public Worker URL if env is missing
const API_BASE = (import.meta.env.VITE_WOOL_API as string)
  || "https://wooligotchi-wool-api.wooligotchi.workers.dev";

type CollectResult = {
  ok: boolean;
  ymd?: string;
  dayCount?: number;
  total?: number;
  capped?: boolean;
  error?: string;
};

function ymdUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function apiCollect(address: `0x${string}`, chainId: number): Promise<CollectResult> {
  const requestId = uuidv4();
  const ymd = ymdUTC(new Date());
  const message =
    `Wooligotchi collect\n` +
    `address:${address}\n` +
    `chain:${chainId}\n` +
    `yyyymmdd:${ymd}\n` +
    `request:${requestId}`;
  const signature = await signMessage({ message });

  const res = await fetch(`${API_BASE}/collect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address, chainId, requestId, message, signature }),
  });

  // Optional: surface errors for easier debugging
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`collect failed: ${res.status} ${txt}`);
  }
  return res.json();
}

export async function apiLeaderboard(limit = 100) {
  const r = await fetch(`${API_BASE}/leaderboard?limit=${limit}`);
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`leaderboard failed: ${r.status} ${txt}`);
  }
  return r.json() as Promise<{ ok: true; rows: Array<{ address: string; total: number }> }>;
}

export async function apiAddress(addr: string) {
  const r = await fetch(`${API_BASE}/address/${addr}`);
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`address failed: ${r.status} ${txt}`);
  }
  return r.json() as Promise<{ ok: true; total: number; days: Record<string, { collected: number }> }>;
}
