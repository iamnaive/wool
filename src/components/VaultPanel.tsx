'use client';

import { useState } from "react";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
import { writeContract, readContract, getPublicClient } from "@wagmi/core";

/**
 * VaultPanel (robust, ERC-721 only, optimistic confirm + clear errors)
 * - Validates env and ownership.
 * - Switches to target chain if needed.
 * - Tries 3-arg safeTransferFrom, falls back to 4-arg version with empty data.
 * - Fires "wg:nft-confirmed" on tx hash (optimistic) and again on receipt success.
 * - Shows inline error/status to the user.
 * - Comments in English only.
 */

const MONAD_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 10143);
const VAULT: Address = (import.meta.env.VAULT_ADDRESS ?? import.meta.env.VITE_VAULT_ADDRESS) as Address ?? zeroAddress;
const ALLOWED_CONTRACT: Address = "0x88c78d5852f45935324c6d100052958f694e8446";

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
    } catch (e) {
      setErr("Please switch to the Monad testnet.");
      return false;
    }
  }

  async function checkOwnership(tokenId: bigint): Promise<boolean> {
    try {
      const owner = await readContract(cfg, {
        abi: ERC721_ABI_READ,
        address: ALLOWED_CONTRACT,
        functionName: "ownerOf",
        args: [tokenId],
        chainId: MONAD_CHAIN_ID,
      }) as Address;
      if (!address || owner.toLowerCase() !== address.toLowerCase()) {
        setErr("You are not the owner of this tokenId.");
        return false;
      }
      return true;
    } catch {
      // Some contracts may revert on nonexistent token; surface a clean message
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
      setErr("VAULT address is not configured. Set VITE_VAULT_ADDRESS in env.");
      return;
    }

    // Basic tokenId validation
    const idNum = Number(idStr);
    if (!Number.isFinite(idNum) || idNum < 0) {
      setErr("Enter a valid tokenId (0 or greater).");
      return;
    }
    const tokenId = BigInt(idNum);

    // Switch chain if needed
    const okChain = await ensureChain();
    if (!okChain) return;

    // Ownership precheck
    const okOwner = await checkOwnership(tokenId);
    if (!okOwner) return;

    setBusy(true);
    setInfo("Sending NFT... confirm in your wallet");

    try {
      // First try the 3-arg version
      let hash: `0x${string}` | null = null;
      try {
        const res = await writeContract(cfg, {
          abi: ERC721_SAFE_3,
          address: ALLOWED_CONTRACT,
          functionName: "safeTransferFrom",
          args: [address as Address, VAULT, tokenId],
          account: address as Address,
          chainId: MONAD_CHAIN_ID,
        });
        hash = res.hash;
      } catch (e: any) {
        // If the selector doesn't exist or reverted due to signature, try 4-arg
        const res = await writeContract(cfg, {
          abi: ERC721_SAFE_4,
          address: ALLOWED_CONTRACT,
          functionName: "safeTransferFrom",
          args: [address as Address, VAULT, tokenId, "0x"],
          account: address as Address,
          chainId: MONAD_CHAIN_ID,
        });
        hash = res.hash;
      }

      if (!hash) throw new Error("No tx hash");

      // Optimistic: notify game immediately (overlay can reset visuals)
      fireConfirmed(address as Address);
      setInfo("Transaction sent. Waiting for confirmation...");

      // Repeat on confirmation (harmless duplicate)
      try {
        const rcpt = await pc.waitForTransactionReceipt({ hash, confirmations: 0, timeout: 60_000 });
        if (rcpt?.status === "success") {
          fireConfirmed(address as Address);
          setInfo("Confirmed ✓");
        } else {
          setErr("Transaction failed.");
        }
      } catch {
        // Timeout or RPC error — backend poll should still pick up life later
        setInfo("Tx broadcasted. It may take a moment to appear.");
      }

      setIdStr("");
    } catch (e: any) {
      // Surface a friendly message
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

      {/* Inline status / error */}
      {info && <div className="text-xs text-white/80">{info}</div>}
      {err && <div className="text-xs text-red-400">{err}</div>}

      {/* Quick env hint if VAULT is missing */}
      {VAULT === zeroAddress && (
        <div className="text-xs text-yellow-400">
          Tip: set <code>VITE_VAULT_ADDRESS</code> in your env (now it is zero).
        </div>
      )}
    </div>
  );
}
