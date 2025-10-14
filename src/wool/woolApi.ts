// src/wool/woolApi.ts
// Signed API calls to the Cloudflare Worker with safe fallback + verbose logs.

import { v4 as uuidv4 } from "uuid";
import { signMessage } from "@wagmi/core";

const API_BASE: string =
  (import.meta as any).env?.VITE_WOOL_API ||
  "https://wooligotchi-wool-api.wooligotchi.workers.dev";

function ymdUTC(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export type CollectRes = {
  ok: boolean;
  total?: number;
  dayCount?: number;
  capped?: boolean;
  error?: string;
};

export async function apiCollect(address: `0x${string}`, chainId: number): Promise<CollectRes> {
  const requestId = uuidv4();
  const ymd = ymdUTC();
  const message =
    `Wooligotchi collect\n` +
    `address:${address}\n` +
    `chain:${chainId}\n` +
    `yyyymmdd:${ymd}\n` +
    `request:${requestId}`;

  console.log("[WOOL] signMessage ->", { address, chainId, requestId, ymd });
  const signature = await signMessage({ message });

  const url = `${API_BASE}/collect`;
  const body = { address, chainId, requestId, message, signature };

  console.log("[WOOL] → POST", url, body);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text().catch(() => "");
  let json: CollectRes | null = null;
  try { json = text ? JSON.parse(text) : null; } catch {}

  console.log("[WOOL] ←", res.status, json || text);
  if (!res.ok) {
    throw new Error(json?.error || `collect failed: ${res.status} ${text}`);
  }
  return (json as CollectRes) || { ok: true };
}

export async function apiLeaderboard(limit = 100) {
  const url = `${API_BASE}/leaderboard?limit=${limit}`;
  console.log("[WOOL] GET", url);
  const r = await fetch(url);
  const text = await r.text().catch(() => "");
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  console.log("[WOOL] LB ←", r.status, json || text);
  if (!r.ok) throw new Error(`leaderboard failed: ${r.status} ${text}`);
  return json as { ok: true; rows: Array<{ address: string; total: number }> };
}

export function getApiBase() {
  return API_BASE;
}
