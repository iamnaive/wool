'use client';

import React, { useState } from "react";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { writeContract, getPublicClient } from "wagmi/actions";
import { config as wagmiConfig, MONAD } from "../utils/wagmiConfigLike";

/**
 * VaultPanel (one-line, ERC-721 only, optimistic confirm)
 * - Single numeric input for tokenId + Send button.
 * - Transfers ERC-721 via safeTransferFrom(owner -> VAULT).
 * - Emits "wg:nft-confirmed" optimistically and again on receipt success.
 * - Also emits "wg:open-game" so the app can immediately switch to the game.
 *
 * ENV required (via wagmiConfigLike):
 *  - chain id inside MONAD.id
 *  - VITE_VAULT_ADDRESS
 */

const MONAD_CHAIN_ID = MONAD.id;
const VAULT = (import.meta.env.VITE_VAULT_ADDRESS as Address) ?? zeroAddress;
const ALLOWED_CONTRACT: Address = "0x88c78d5852f45935324c6d100052958f694e8446";

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

export default function VaultPanel({ onClose }: { onClose?: () => void }) {
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const pc = getPublicClient(wagmiConfig);

  const [idStr, setIdStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function fireConfirmed(addr: Address | undefined) {
    window.dispatchEvent(new CustomEvent("wg:nft-confirmed", { detail: { address: addr } }));
  }

  async function send() {
    if (!isConnected || !address || VAULT === zeroAddress) {
      setMsg("Connect wallet or configure VAULT.");
      return;
    }
    const idNum = Number(idStr);
    if (!Number.isFinite(idNum) || idNum < 0) {
      setMsg("Enter a valid token id.");
      return;
    }
    const parsedId = BigInt(idNum);

    try {
      // ensure correct chain
      if (chainId !== MONAD_CHAIN_ID) {
        try { await switchChain({ chainId: MONAD_CHAIN_ID }); }
        catch { setMsg(`Switch to chain ${MONAD_CHAIN_ID} failed.`); return; }
      }

      setBusy(true);
      setMsg("Sending…");

      const { hash } = await writeContract(wagmiConfig, {
        abi: ERC721_WRITE_ABI,
        address: ALLOWED_CONTRACT,
        functionName: "safeTransferFrom",
        args: [address as Address, VAULT, parsedId],
        account: address as Address,
        chainId: MONAD_CHAIN_ID,
      });

      // optimistic signals (start game immediately, close modal if app listens)
      fireConfirmed(address as Address);
      window.dispatchEvent(new Event("wg:open-game"));

      setMsg(`Tx sent: ${hash.slice(0, 10)}…`);
      setIdStr("");

      // repeat on confirmation (harmless duplication)
      pc.waitForTransactionReceipt({ hash, confirmations: 0, timeout: 45_000 })
        .then((rcpt) => {
          if (rcpt && rcpt.status === "success") {
            fireConfirmed(address as Address);
            window.dispatchEvent(new Event("wg:open-game"));
            setMsg("Transfer confirmed ✅");
            onClose?.();
          } else {
            setMsg("Transaction failed.");
          }
        })
        .catch(() => setMsg("Receipt wait timed out."))
        .finally(() => setBusy(false));
    } catch (e: any) {
      setBusy(false);
      setMsg(e?.shortMessage || e?.message || "Transaction failed.");
    }
  }

  const disabled = !isConnected || VAULT === zeroAddress || busy;

  return (
    <div className="w-full flex flex-col gap-2">
      <div className="w-full flex items-center gap-2">
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="NFT id (e.g. 0..10000)"
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
          Send
        </button>
      </div>

      {msg && <div className="muted" style={{ fontSize: 12 }}>{msg}</div>}
    </div>
  );
}
