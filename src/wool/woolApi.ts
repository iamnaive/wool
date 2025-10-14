// src/wool/woolApi.ts
// Signed API calls to the Cloudflare Worker with safe fallback + verbose logs.

import { v4 as uuidv4 } from "uuid";
import { signMessage } from "@wagmi/core";
import type { Address } from "viem";
import { config as wagmiConfig } from "../utils/wagmiConfigLike";

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
  ymd?: string;
  error?: string;
};

async function signWithWagmiOrFallback(address: Address, message: string): Promise<string> {
  try {
    // wagmi v2 requires config + account
    const sig = await signMessage(wagmiConfig, { account: address, message });
    return sig as string;
  } catch (e) {
    console.warn("[WOOL] wagmi signMessage failed, trying personal_sign fallback", e);
    // Fallback to window.ethereum if available
    const eth: any = (globalThis as any).ethereum;
    if (!eth) throw new Error("No ethereum provider for personal_sign");
    // important: personal_sign params order = [message, address]
    const sig = await eth.request({ method: "personal_sign", params: [message, address] });
    return sig as string;
  }
}

export async function apiCollect(address: `0x${string}`, chainId: number): Promise<CollectRes> {
  const requestId = uuidv4();
  const ymd = ymdUTC();
  const message =
    `Wooligotchi collect\n` +
    `address:${address}\n` +
    `chain:${chainId}\n` +
    `yyyymmdd:${ymd}\n` +
    `request:${requestId}`;

  console.log("[WOOL] signMessage ->", { address, chainId, requestId, ymd, api: API_BASE });
  const signature = await signWithWagmiOrFallback(address, message);

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
  try { json = text ? (JSON.parse(text) as CollectRes) : null; } catch {}
  console.log("[WOOL] ← /collect", res.status, json || text);
  if (!res.ok) throw new Error(json?.error || `collect failed: ${res.status} ${text}`);
  return json || { ok: true };
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

export async function apiAddress(addr: string) {
  const url = `${API_BASE}/address/${addr}`;
  console.log("[WOOL] GET", url);
  const r = await fetch(url);
  const text = await r.text().catch(() => "");
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  console.log("[WOOL] ADDR ←", r.status, json || text);
  if (!r.ok) throw new Error(`address failed: ${r.status} ${text}`);
  return json as { ok: true; total: number; days: Record<string, { collected: number }> };
}

export function getApiBase() {
  return API_BASE;
}
