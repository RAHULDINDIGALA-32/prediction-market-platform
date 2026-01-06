"use client";

import React, { useState } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";

const SETTLEMENT_ABI = [
  {
    type: "function",
    name: "settleMarket",
    stateMutability: "nonpayable",
    inputs: [{ name: "market", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "redeem",
    stateMutability: "nonpayable",
    inputs: [
      { name: "market", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
];

const SETTLEMENT_ADDRESS =
  (process.env.NEXT_PUBLIC_SETTLEMENT_ENGINE_ADDRESS as `0x${string}`) ??
  "0x0000000000000000000000000000000000000000";

export default function SettlementPanel() {
  const [market, setMarket] = useState("");
  const [amount, setAmount] = useState("1");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    writeContractAsync,
    data: hash,
    isPending,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
  } = useWaitForTransactionReceipt({
    hash,
  });

  async function handleSettle() {
    setStatus(null);
    setError(null);

    try {
      const txHash = await writeContractAsync({
        address: SETTLEMENT_ADDRESS,
        abi: SETTLEMENT_ABI,
        functionName: "settleMarket",
        args: [market as `0x${string}`],
      });
      setStatus(`Settle transaction submitted: ${txHash}`);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  }

  async function handleRedeem() {
    setStatus(null);
    setError(null);

    try {
      const amountWei = BigInt(amount) * 10n ** 18n;
      const txHash = await writeContractAsync({
        address: SETTLEMENT_ADDRESS,
        abi: SETTLEMENT_ABI,
        functionName: "redeem",
        args: [market as `0x${string}`, amountWei],
      });
      setStatus(`Redeem transaction submitted: ${txHash}`);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  }

  return (
    <div className="max-w-xl space-y-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h2 className="text-base font-semibold">Settlement engine</h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Finalize resolved markets and redeem winning outcome tokens for ETH.
          Anyone can settle once the oracle has finalized an outcome; only
          holders of the winning token can redeem.
        </p>
      </div>

      <div className="space-y-4 text-sm">
        <div>
          <label className="block text-xs text-zinc-600 dark:text-zinc-300">
            Market address
          </label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="0x…"
            value={market}
            onChange={(e) => setMarket(e.target.value)}
          />
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSettle}
              disabled={!market || isPending || isConfirming}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-50 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Settle market
            </button>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Calls `settleMarket` on the engine; requires market to be expired and oracle resolved.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <label className="block text-[11px] text-zinc-600 dark:text-zinc-300">
                Redeem amount (tokens)
              </label>
              <input
                className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <button
              onClick={handleRedeem}
              disabled={!market || isPending || isConfirming}
              className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-400/50 dark:text-emerald-300"
            >
              Redeem winnings
            </button>
          </div>
        </div>
      </div>

      {hash && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Tx hash: {hash}
        </p>
      )}
      {status && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          {status}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}


