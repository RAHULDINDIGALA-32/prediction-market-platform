"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";

type Props = {
  initialMarketId?: string;
  compact?: boolean;
};

/**
 * ABI as objects (required for wagmi)
 */
const MARKET_ABI = [
  {
    type: "function",
    name: "executeTrade",
    stateMutability: "payable",
    inputs: [
      {
        name: "quote",
        type: "tuple",
        components: [
          { name: "trader", type: "address" },
          { name: "market", type: "address" },
          { name: "outcome", type: "uint8" },
          { name: "amount", type: "uint256" },
          { name: "cost", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "isSell", type: "bool" },
          { name: "minAmountOut", type: "uint256" },
          { name: "minReturn", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
      { name: "minAmountOut", type: "uint256" },
      { name: "minReturn", type: "uint256" },
    ],
    outputs: [],
  },
];

export default function TradeForm({ initialMarketId, compact }: Props) {
  const { address, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();

  const [marketId, setMarketId] = useState(initialMarketId ?? "");
  const [amount, setAmount] = useState("0.1");
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [isSell, setIsSell] = useState(false);
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

  const { data: balance } = useBalance({
    address,
    query: { enabled: Boolean(address) },
  });

  const disabled = useMemo(
    () => !marketId || isPending || isConfirming,
    [marketId, isPending, isConfirming]
  );

  async function requestQuote() {
    setError(null);

    if (!address) {
      openConnectModal?.();
      return;
    }

    if (!marketId) {
      setError("Please select a market to trade on.");
      return;
    }

    try {
      setStatus("Requesting server-side quote...");

      
      const outcome = side === "YES" ? 0 : 1;

      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          marketId,
          trader: address,
          outcome,      
          amount,
          isSell,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Quote request failed");
      }

      const { quote, signature } = data;

      setStatus("Quote received — sending transaction...");

      const quoteStruct = [
        quote.trader,
        quote.market,
        quote.outcome,
        BigInt(quote.amount),
        BigInt(quote.cost),
        BigInt(quote.deadline),
        BigInt(quote.nonce),
        quote.isSell,
        BigInt(quote.minAmountOut ?? 0), 
        BigInt(quote.minReturn ?? 0),     
      ] as const;

      const value = isSell ? 0n : BigInt(quote.cost);

      const txHash = await writeContractAsync({
        address: quote.market as `0x${string}`,
        abi: MARKET_ABI,
        functionName: "executeTrade",
        args: [
          quoteStruct,
          signature,
          BigInt(quote.minAmountOut ?? 0),
          BigInt(quote.minReturn ?? 0),
        ],
        value,
      });

      setStatus(`Transaction submitted: ${txHash}`);
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setStatus(null);
    }
  }

  useEffect(() => {
    if (isConfirming) {
      setStatus("Transaction confirming on-chain...");
    }
    if (isConfirmed && hash) {
      setStatus(`Transaction confirmed: ${hash}`);
    }
  }, [isConfirming, isConfirmed, hash]);

  const wrapperClasses = compact
    ? "w-full rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-950"
    : "w-full max-w-xl rounded-lg border bg-white p-6 shadow dark:border-zinc-800 dark:bg-zinc-950";

  return (
    <div className={wrapperClasses}>
      <div className="mb-3 flex items-center justify-between text-xs">
        <h3 className={compact ? "font-semibold" : "text-sm font-semibold"}>
          Trade
        </h3>
        {chainId && (
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Chain ID: {chainId}
          </span>
        )}
      </div>

      {!compact && (
        <div className="mb-3">
          <label className="block text-xs text-zinc-600 dark:text-zinc-300">
            Market database ID
          </label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none ring-0 transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            value={marketId}
            onChange={(e) => setMarketId(e.target.value)}
            placeholder="e.g. market UUID"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-xs">
        <div>
          <label className="block text-[11px] text-zinc-600 dark:text-zinc-300">
            Side
          </label>
          <select
            className="mt-1 rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            value={side}
            onChange={(e) => setSide(e.target.value as "YES" | "NO")}
          >
            <option value="YES">YES</option>
            <option value="NO">NO</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] text-zinc-600 dark:text-zinc-300">
            Amount (shares)
          </label>
          <input
            className="mt-1 w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="flex items-end gap-2">
          <label className="flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              className="h-3 w-3 rounded border-zinc-300 text-zinc-900 focus:ring-0 dark:border-zinc-700"
              checked={isSell}
              onChange={(e) => setIsSell(e.target.checked)}
            />
            Sell instead of buy
          </label>
        </div>

        {balance && (
          <div className="ml-auto text-[11px] text-zinc-500 dark:text-zinc-400">
            Balance: {balance.formatted.slice(0, 8)} {balance.symbol}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs">
        <button
          onClick={requestQuote}
          disabled={disabled}
          className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-50 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isPending
            ? "Signing…"
            : isConfirming
            ? "Confirming…"
            : "Request quote & execute"}
        </button>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Quotes are priced off-chain with LMSR and executed atomically on-chain.
        </p>
      </div>

      {status && (
        <p className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400">
          {status}
        </p>
      )}

      {error && (
        <p className="mt-1 text-[11px] text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
