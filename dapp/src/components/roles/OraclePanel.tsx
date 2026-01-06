"use client";

import React, { useState } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";

const ORACLE_ABI = [
  {
    type: "function",
    name: "proposeOutcome",
    stateMutability: "payable",
    inputs: [
      { name: "market", type: "address" },
      { name: "outcome", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "disputeOutcome",
    stateMutability: "payable",
    inputs: [{ name: "market", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "resolveOutcome",
    stateMutability: "nonpayable",
    inputs: [
      { name: "market", type: "address" },
      { name: "finalOutcome", type: "uint8" },
      { name: "isProposerCorrect", type: "bool" },
    ],
    outputs: [],
  },
];

const ORACLE_ADDRESS =
  (process.env.NEXT_PUBLIC_ORACLE_ADAPTER_ADDRESS as `0x${string}`) ??
  "0x0000000000000000000000000000000000000000";

function parseEthToWei(value: string): bigint {
  if (!value) return 0n;
  const [whole, fraction = "0"] = value.split(".");
  const fracPadded = (fraction + "000000000000000000").slice(0, 18);
  return BigInt(whole || "0") * 10n ** 18n + BigInt(fracPadded || "0");
}

export default function OraclePanel() {
  const [market, setMarket] = useState("");
  const [outcome, setOutcome] = useState<"YES" | "NO">("YES");
  const [bond, setBond] = useState("0.1");
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

  async function handlePropose() {
    setStatus(null);
    setError(null);

    try {
      const value = parseEthToWei(bond);
      const txHash = await writeContractAsync({
        address: ORACLE_ADDRESS,
        abi: ORACLE_ABI,
        functionName: "proposeOutcome",
        args: [market as `0x${string}`, outcome === "YES" ? 0 : 1],
        value,
      });
      setStatus(`Propose transaction submitted: ${txHash}`);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  }

  async function handleDispute() {
    setStatus(null);
    setError(null);

    try {
      const value = parseEthToWei(bond);
      const txHash = await writeContractAsync({
        address: ORACLE_ADDRESS,
        abi: ORACLE_ABI,
        functionName: "disputeOutcome",
        args: [market as `0x${string}`],
        value,
      });
      setStatus(`Dispute transaction submitted: ${txHash}`);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  }

  async function handleResolve(isProposerCorrect: boolean) {
    setStatus(null);
    setError(null);

    try {
      const txHash = await writeContractAsync({
        address: ORACLE_ADDRESS,
        abi: ORACLE_ABI,
        functionName: "resolveOutcome",
        args: [market as `0x${string}`, outcome === "YES" ? 0 : 1, isProposerCorrect],
      });
      setStatus(`Resolve transaction submitted: ${txHash}`);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  }

  return (
    <div className="max-w-xl space-y-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h2 className="text-base font-semibold">Oracle actions</h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Use these controls to propose and dispute outcomes on expired markets.
          Resolver addresses can finalize disputed markets and redistribute bonds.
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

        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs text-zinc-600 dark:text-zinc-300">
              Proposed / final outcome
            </label>
            <select
              className="mt-1 rounded-md border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as "YES" | "NO")}
            >
              <option value="YES">YES</option>
              <option value="NO">NO</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-600 dark:text-zinc-300">
              Bond (ETH)
            </label>
            <input
              className="mt-1 w-28 rounded-md border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              value={bond}
              onChange={(e) => setBond(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handlePropose}
              disabled={!market || isPending || isConfirming}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-50 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Propose outcome
            </button>
            <button
              onClick={handleDispute}
              disabled={!market || isPending || isConfirming}
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-400/40 dark:text-amber-300"
            >
              Dispute outcome
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleResolve(true)}
              disabled={!market || isPending || isConfirming}
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-400/40 dark:text-emerald-300"
            >
              Resolve (proposer correct)
            </button>
            <button
              onClick={() => handleResolve(false)}
              disabled={!market || isPending || isConfirming}
              className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-400/40 dark:text-rose-300"
            >
              Resolve (disputer correct)
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


