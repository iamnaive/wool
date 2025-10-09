'use client';

import React, { useState } from "react";
import type { Address } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { writeContract, getPublicClient } from "wagmi/actions";

/**
 * VaultPanel (ONE-LINE, ERC-721 only, optimistic confirm)
 * - Single input for tokenId + Send button in one row.
 * - Sends ERC-721 via safeTransferFrom(owner -> VAULT).
 * - Dispatches "wg:nft-confirmed" immediately after tx hash (optimistic),
 *   and repeats the event again when the receipt confirms.
 * - English-only comments.
 *
 * ENV required:
 *  - VITE_CHAIN_ID
 *  - VITE_VAULT_ADDRESS
 *
 * NOTE: Collection address is kept hardcoded for compatibility.
 */

type Props = {
  onClose?: () => void;
};

const MONAD_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 10143);
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const VAULT: Address = (import.meta.env.VITE_VAULT_ADDRESS as Address) ?? ZERO;

// Allowed collection to send from (ERC-721)
const ALLOWED_CONTRACT: Address = "0x88c78d5852f45935324c6d100052958f694e8446";

// Minimal write ABI
const ERC721_WRITE_ABI = [
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

export default function VaultPanel({ onClose }: Props) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();

  const pc = getPublicClient(); // reads from WagmiProvider config

  const [idStr, setIdStr] = useState("");
  const [busy, setBusy] = useState(false);

  const disabled = !isConnected || VAULT === ZERO || busy;

  // Fire the in-game event
  function fireConfirmed(addr: Address | undefined) {
    try {
      window.dispatchEvent(new CustomEvent("wg:nft-confirmed", { detail: { address: addr } }));
    } catch {}
  }

  async function send() {
    if (disabled) return;
    const me = address as Address | undefined;
    if (!me) return;
    const idNum = Number(idStr);
    if (!Number.isFinite(idNum) || idNum < 0 || idNum > 1_000_000_000) return;

    try {
      // Ensure correct chain
      if (chainId !== MONAD_CHAIN_ID) {
        try {
          await switchChain({ chainId: MONAD_CHAIN_ID });
        } catch {
          // user rejected or wallet not ready
        }
      }

      setBusy(true);

      const { hash } = await writeContract({
        abi: ERC721_WRITE_ABI,
        address: ALLOWED_CONTRACT,
        functionName: "safeTransferFrom",
        args: [me, VAULT, BigInt(idNum)],
        account: me,
        chainId: MONAD_CHAIN_ID,
      });

      // Optimistic: start the new life immediately
      fireConfirmed(me);

      // Confirm later (re-fire on success — harmless)
      pc.waitForTransactionReceipt({ hash, confirmations: 0, timeout: 60_000 })
        .then((rcpt) => {
          if (rcpt && rcpt.status === "success") fireConfirmed(me);
        })
        .catch(() => {})
        .finally(() => setBusy(false));

      setIdStr("");
      onClose?.();
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="w-full flex items-center gap-2">
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="NFT id (0..1e9)"
        value={idStr}
        onChange={(e) => setIdStr(e.target.value.replace(/[^0-9]/g, ""))}
        onKeyDown={(e) => { if (e.key === "Enter" && !disabled && idStr.length > 0) send(); }}
        className="px-3 py-2 rounded-xl bg-black/30 border border-white/10 w-full"
      />
      <button
        disabled={disabled || idStr.length === 0}
        onClick={send}
        className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 disabled:opacity-50"
        title="Send 1 NFT → get 1 life"
      >
        Send
      </button>
    </div>
  );
}
