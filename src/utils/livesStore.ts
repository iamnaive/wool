// src/utils/livesStore.ts
// Single source of truth for lives. English-only comments.

type LivesMap = Record<string, number>;

const KEY = "wg_lives_v1";
const key = (chainId: number, addr: string) =>
  `${chainId}:${addr.toLowerCase()}`;

export function getLives(chainId: number, addr?: string | null): number {
  if (!addr) return 0;
  const raw = localStorage.getItem(KEY);
  const map: LivesMap = raw ? JSON.parse(raw) : {};
  return map[key(chainId, addr)] ?? 0;
}

export function setLives(chainId: number, addr: string, v: number): number {
  const raw = localStorage.getItem(KEY);
  const map: LivesMap = raw ? JSON.parse(raw) : {};
  map[key(chainId, addr)] = v;
  localStorage.setItem(KEY, JSON.stringify(map));
  return v;
}

export function addLives(chainId: number, addr: string, delta = 1): number {
  const raw = localStorage.getItem(KEY);
  const map: LivesMap = raw ? JSON.parse(raw) : {};
  const k = key(chainId, addr);
  map[k] = (map[k] ?? 0) + delta;
  localStorage.setItem(KEY, JSON.stringify(map));
  return map[k];
}
