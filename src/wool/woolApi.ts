// src/wool/woolApi.ts
// Signed calls to your Cloudflare Worker API.

import { v4 as uuidv4 } from "uuid";
import { signMessage } from "@wagmi/core";

const API_BASE = import.meta.env.VITE_WOOL_API as string;

export type CollectResult = {
  ok: boolean;
  ymd?: string;
  dayCount?: number;
  total?: number;
  capped?: boolean;
  error?: string;
};

function ymdUTC(d: Date) {
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
  return res.json();
}

export async function apiLeaderboard(limit = 100) {
  const r = await fetch(`${API_BASE}/leaderboard?limit=${limit}`);
  return r.json() as Promise<{ ok: true; rows: Array<{ address: string; total: number }> }>;
}

export async function apiAddress(addr: string) {
  const r = await fetch(`${API_BASE}/address/${addr}`);
  return r.json() as Promise<{ ok: true; total: number; days: Record<string, { collected: number }> }>;
}
