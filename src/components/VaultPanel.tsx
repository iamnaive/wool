'use client';

import React, { useMemo, useState } from "react";
import type { Address } from "viem";
import { zeroAddress } from "viem";
import { useAccount, useSwitchChain, useConfig, useChainId } from "wagmi";
import { writeContract, getPublicClient } from "wagmi/actions";

/**
 * VaultPanel (ERC-721, optimistic confirm)
 * - Single numeric tokenId input + Send.
 * - Calls safeTransferFrom(owner -> VAULT) on ALLOWED_CONTRACT.
 * - Fires "wg:nft-confirmed" optimistically after tx hash and again on receipt.
 * - Shows clear error states and disables button when invalid.
 */

const MONAD_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 10143);
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

export default function VaultPanel() {
  const { address, isConnected } = useAccount();
  const activeChainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const wagmiConfig = useConfig();
  const pc = useMemo(() => getPublicClient(wagmiConfig), [wagmiConfig]);

  const [idStr, setIdStr] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const parsedId = useMemo(() => {
    if (!idStr) return null;
    if (!/^\d+$/.test(idStr)) return null;
    const n = Number(idStr);
    if (!Number.isFinite(n) || n < 0) return null;
    return BigInt(n);
  }, [idStr]);

  const isRightChain = activeChainId === MONAD_CHAIN_ID;
  const vaultOk = VAULT && VAULT !== zeroAddress;

  const disabled =
    !isConnected ||
    busy ||
    isSwitching ||
    !vaultOk ||
    !parsedId ||
    (isConnected && !isRightChain);

  function fireConfirmed(addr: Address | undefined) {
    try {
      window.dispatchEvent(new CustomEvent("wg:nft-confirmed", { detail: { address: addr } }));
    } catch {}
  }

  async function send() {
    setMsg(null);
    if (!isConnected || !address) {
      setMsg("Connect a wallet first.");
      return;
    }
    if (!vaultOk) {
      setMsg("Vault address is not set. Check VITE_VAULT_ADDRESS.");
      return;
    }
    if (!parsedId) {
      setMsg("Enter a valid NFT id (integer).");
      return;
    }

    try {
      // ensure correct chain
      if (!isRightChain) {
        await switchChain({ chainId: MONAD_CHAIN_ID });
      }

      setBusy(true);

      const { hash } = await writeContract(wagmiConfig, {
        abi: ERC721_WRITE_ABI,
        address: ALLOWED_CONTRACT,
        functionName: "safeTransferFrom",
        args: [address as Address, VAULT, parsedId],
        account: address as Address,
        chainId: MONAD_CHAIN_ID,
      });

      // optimistic life grant (App listens to this)
      fireConfirmed(address as Address);
      setMsg(`Tx sent: ${hash.slice(0, 10)}…`);

      // confirm later; repeat event on success (harmless)
      pc.waitForTransactionReceipt({ hash, confirmations: 0, timeout: 60_000 })
        .then((rcpt) => {
          if (rcpt?.status === "success") {
            fireConfirmed(address as Address);
            setMsg("Transfer confirmed ✅");
          } else {
            setMsg("Transaction failed.");
          }
        })
        .catch((e) => {
          console.error("waitForTransactionReceipt error:", e);
          setMsg("Could not confirm the transaction (timeout).");
        })
        .finally(() => setBusy(false));

      setIdStr("");
    } catch (e: any) {
      console.error("send error:", e);
      setBusy(false);
      const reason =
        e?.shortMessage || e?.message || "Failed to send transaction.";
      setMsg(reason);
    }
  }

  return (
    <div className="w-full" style={{ display: "grid", gap: 8 }}>
      {/* quick status */}
      <div className="muted" style={{ fontSize: 12 }}>
        Chain: <b>{String(activeChainId)}</b> {isRightChain ? "✅" : "❌"} • Vault:{" "}
        <b>{vaultOk ? VAULT : "NOT SET"}</b>
      </div>

      <div className="w-full flex items-center gap-2">
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="NFT id (0..1000000)"
          value={idStr}
          onChange={(e) => setIdStr(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter" && !disabled) send(); }}
          className="px-3 py-2 rounded-xl bg-black/30 border border-white/10 w-full"
        />
        {!isRightChain ? (
          <button
            onClick={() => switchChain({ chainId: MONAD_CHAIN_ID })}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 disabled:opacity-50"
            disabled={busy || isSwitching}
            title="Switch to target chain"
          >
            Switch
          </button>
        ) : (
          <button
            disabled={disabled}
            onClick={send}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 disabled:opacity-50"
            title="Send 1 NFT → get 1 life"
          >
            Send
          </button>
        )}
      </div>

      {msg && (
        <div className="muted" style={{ fontSize: 12 }}>
          {msg}
        </div>
      )}
    </div>
  );
}
