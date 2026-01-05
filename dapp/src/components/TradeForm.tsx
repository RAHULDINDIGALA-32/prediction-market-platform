"use client";

import React, { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";

type Props = {};

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

export default function TradeForm(_: Props) {
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();

  const [marketId, setMarketId] = useState("");
  const [amount, setAmount] = useState("0.1");
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [isSell, setIsSell] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  /**
   * wagmi write hook
   */
  const {
    writeContractAsync,
    data: hash,
    isPending,
  } = useWriteContract();

  /**
   * wagmi receipt hook
   */
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
  } = useWaitForTransactionReceipt({
    hash,
  });

  /**
   * Main flow:
   * 1. Fetch signed quote
   * 2. Call executeTrade via wagmi
   */
  async function requestQuote() {
    if (!address) {
      openConnectModal?.();
      return;
    }

    try {
      setStatus("Requesting quote...");

      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          marketId,
          trader: address,
          side,
          amount,
          isSell,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Quote request failed");
      }

      const { quote, signature } = data;

      setStatus("Quote received — signing transaction...");

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

      setStatus(`Transaction sent: ${txHash}`);
    } catch (err: any) {
      setStatus(err?.message ?? String(err));
    }
  }

  /**
   * Reactively update tx status
   */
  useEffect(() => {
    if (isConfirming) {
      setStatus("Transaction confirming...");
    }
    if (isConfirmed && hash) {
      setStatus(`Transaction confirmed: ${hash}`);
    }
  }, [isConfirming, isConfirmed, hash]);

  return (
    <div className="w-full max-w-xl rounded-lg border bg-white p-6 shadow">
      <h3 className="mb-4 text-lg font-semibold">Trade on Market</h3>

      <label className="block text-sm text-gray-600">
        Market DB ID
      </label>
      <input
        className="mt-1 mb-2 w-full rounded border px-3 py-2"
        value={marketId}
        onChange={(e) => setMarketId(e.target.value)}
        placeholder="market db id"
      />

      <div className="flex gap-2">
        <div>
          <label className="block text-sm text-gray-600">
            Side
          </label>
          <select
            className="mt-1 rounded border px-3 py-2"
            value={side}
            onChange={(e) => setSide(e.target.value as any)}
          >
            <option value="YES">YES</option>
            <option value="NO">NO</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-600">
            Amount
          </label>
          <input
            className="mt-1 rounded border px-3 py-2"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="block text-sm text-gray-600">
            Sell
          </label>
          <input
            type="checkbox"
            checked={isSell}
            onChange={(e) => setIsSell(e.target.checked)}
          />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={requestQuote}
          disabled={isPending || isConfirming}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {isPending
            ? "Signing..."
            : isConfirming
            ? "Confirming..."
            : "Request & Execute"}
        </button>
      </div>

      {status && (
        <p className="mt-3 text-sm text-gray-700">
          {status}
        </p>
      )}
    </div>
  );
}
