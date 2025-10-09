'use client';

import { useState } from "react";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
import { writeContract, readContract, getPublicClient } from "@wagmi/core";

/**
 * VaultPanel (handles wagmi return shapes)
 * - Supports writeContract returning either `{ hash }` or `string`.
 * - Validates env, chain, and ownership.
 * - Tries 3-arg safeTransferFrom, falls back to 4-arg with empty data.
 * - Fires "wg:nft-confirmed" optimistically on send, and again on receipt.
 * - Comments: English only.
 */

const MONAD_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 10143);
const VAULT: Address =
  ((import.meta.env.VAULT_ADDRESS as Address) ||
    (import.meta.env.VITE_VAULT_ADDRESS as Address) ||
    zeroAddress) as Address;

// Prefer env; fallback to your hardcoded collection for safety
const ALLOWED_CONTRACT: Address =
  ((import.meta.env.VITE_COLLECTION_ADDRESS as Address) ??
    "0x88c78d5852f45935324c6d100052958f694e8446") as Address;

const ERC721_ABI_READ = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
] as const;

const ERC721_SAFE_3 = [
  {
    type: "function",
    name: "safeTransferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const ERC721_SAFE_4 = [
  {
    type: "function",
    name: "safeTransferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

// Normalize wagmi writeContract return value across versions
function normalizeTxHash(res: unknown): `0x${string}` | null {
  if (!res) return null;
  if (typeof res === "string") return res as `0x${string}`;
  if (typeof res === "object" && "hash" in (res as any)) {
    const h = (res as any).hash;
    if (typeof h === "string") return h as `0x${string}`;
  }
  return null;
}

export default function VaultPanel() {
  const { address, isConnected, chainId } = useAccount();
  const cfg = useConfig();
  const pc = getPublicClient(cfg);
  const { switchChain } = useSwitchChain();

  const [idStr, setIdStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function fireConfirmed(addr: Address | undefined) {
    try {
      window.dispatchEvent(new CustomEvent("wg:nft-confirmed", { detail: { address: addr } }));
    } catch {}
  }

  async function ensureChain(): Promise<boolean> {
    if (chainId === MONAD_CHAIN_ID) return true;
    try {
      await switchChain({ chainId: MONAD_CHAIN_ID });
      return true;
    } catch {
      setErr("Please switch to the Monad testnet.");
      return false;
    }
  }

  async function checkOwnership(tokenId: bigint): Promise<boolean> {
    try {
      const owner = (await readContract(cfg, {
        abi: ERC721_ABI_READ,
        address: ALLOWED_CONTRACT,
        functionName: "ownerOf",
        args: [tokenId],
        chainId: MONAD_CHAIN_ID,
      })) as Address;
      if (!address || owner.toLowerCase() !== address.toLowerCase()) {
        setErr("You are not the owner of this tokenId.");
        return false;
      }
      return true;
    } catch {
      setErr("Cannot verify ownership (invalid tokenId or RPC error).");
      return false;
    }
  }

  async function send() {
    setErr(null);
    setInfo(null);

    if (!isConnected || !address) {
      setErr("Connect a wallet first.");
      return;
    }
    if (!VAULT || VAULT === zeroAddress) {
      setErr("VAULT address is not configured. Set VITE_VAULT_ADDRESS.");
      return;
    }
    const idNum = Number(idStr);
    if (!Number.isFinite(idNum) || idNum < 0) {
      setErr("Enter a valid tokenId (0 or greater).");
      return;
    }
    const tokenId = BigInt(idNum);

    const okChain = await ensureChain();
    if (!okChain) return;

    const okOwner = await checkOwnership(tokenId);
    if (!okOwner) return;

    setBusy(true);
    setInfo("Sending NFT... confirm in your wallet");

    try {
      // Try 3-arg first
      let res: unknown;
      try {
        res = await writeContract(cfg, {
          abi: ERC721_SAFE_3,
          address: ALLOWED_CONTRACT,
          functionName: "safeTransferFrom",
          args: [address as Address, VAULT, tokenId],
          account: address as Address,
          chainId: MONAD_CHAIN_ID,
        });
      } catch {
        // Fallback to 4-arg with empty data
        res = await writeContract(cfg, {
          abi: ERC721_SAFE_4,
          address: ALLOWED_CONTRACT,
          functionName: "safeTransferFrom",
          args: [address as Address, VAULT, tokenId, "0x"],
          account: address as Address,
          chainId: MONAD_CHAIN_ID,
        });
      }

      const hash = normalizeTxHash(res);

      // Optimistic: always notify the game on send (even if hash shape unknown)
      fireConfirmed(address as Address);

      if (!hash) {
        // Do not fail hard; just inform and rely on backend poll for lives
        setInfo("Transaction sent. Waiting for backend to detect the life…");
      } else {
        setInfo("Transaction sent. Waiting for confirmation…");
        try {
          const rcpt = await pc.waitForTransactionReceipt({
            hash,
            confirmations: 0,
            timeout: 60_000,
          });
          if (rcpt?.status === "success") {
            fireConfirmed(address as Address);
            setInfo("Confirmed ✓");
          } else {
            setErr("Transaction failed.");
          }
        } catch {
          // Timeout/RPC hiccup — backend poll should still pick it up
          setInfo("Tx broadcasted. It may take a moment to appear.");
        }
      }

      setIdStr("");
    } catch (e: any) {
      const msg = (e?.shortMessage || e?.message || "Failed to send NFT").toString();
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  const disabled = !isConnected || busy || !address;

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="w-full flex items-center gap-2">
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="NFT id (e.g. 1)"
          value={idStr}
          onChange={(e) => setIdStr(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter" && !disabled && idStr) send(); }}
          className="px-3 py-2 rounded-xl bg-black/30 border border-white/10 w-full"
        />
        <button
          disabled={disabled || idStr.length === 0}
          onClick={send}
          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 disabled:opacity-50"
          title="Send 1 NFT → get 1 life"
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>

      {info && <div className="text-xs text-white/80">{info}</div>}
      {err && <div className="text-xs text-red-400">{err}</div>}

      {VAULT === zeroAddress && (
        <div className="text-xs text-yellow-400">
          Tip: set <code>VITE_VAULT_ADDRESS</code> in your env (now zero).
        </div>
      )}
    </div>
  );
}
