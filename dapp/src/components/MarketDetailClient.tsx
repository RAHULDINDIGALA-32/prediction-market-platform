"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMarketInfo, useMarketProbabilities, useUserPositions } from "@/hooks/useMarketData";
import { useQuote } from "@/hooks/useQuote";
import { calculateProbability, formatEth, formatTimeRemaining, formatAddress } from "@/lib/utils";
import { parseContractError } from "@/lib/errors";
import { AlertTriangle, Clock, TrendingUp, TrendingDown } from "lucide-react";
import TradeConfirmationModal from "@/components/TradeConfirmationModal";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";

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
] as const;

interface Market {
  id: string;
  status: string;
  qYes: any;
  qNo: any;
  collateral: any;
  contractAddress?: string | null;
  createdAt: Date;
  trades: Array<{
    id: string;
    side: string;
    amount: any;
    cost: any;
    trader: string;
    createdAt: Date;
  }>;
}

interface Props {
  market: Market;
}

export default function MarketDetailClient({ market }: Props) {
  const { address } = useAccount();
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [amount, setAmount] = useState("1");
  const [isSell, setIsSell] = useState(false);
  const [slippage, setSlippage] = useState("1");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingQuote, setPendingQuote] = useState<any>(null);

  const marketAddress = market.contractAddress as `0x${string}` | undefined;
  const { data: marketInfo } = useMarketInfo(marketAddress);
  
  // Get token addresses from market info (tuple: [state, endTime, yesToken, noToken, vault, isExpired, isClosed])
  const yesToken = marketInfo?.[2] as `0x${string}` | undefined;
  const noToken = marketInfo?.[3] as `0x${string}` | undefined;
  const endTime = marketInfo?.[1];

  const { data: probabilities, yesSupply, noSupply } = useMarketProbabilities(
    marketAddress,
    yesToken,
    noToken
  );

  const positions = useUserPositions(address, yesToken, noToken);

  const displayProbs = probabilities || calculateProbability(market.qYes, market.qNo);

  // Request quote
  const quoteRequest = address && amount && Number(amount) > 0
    ? {
        marketId: market.id,
        trader: address,
        side,
        amount,
        isSell,
      }
    : null;

  const { quote, error: quoteError, isLoading: quoteLoading, secondsRemaining, isExpired, refetch } = useQuote(quoteRequest);

  // Auto-refresh quote every 10 seconds
  useEffect(() => {
    if (!quote || isExpired) return;
    const interval = setInterval(() => {
      refetch();
    }, 10000);
    return () => clearInterval(interval);
  }, [quote, isExpired, refetch]);

  const { writeContractAsync, isPending: isWriting } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: undefined, // Will be set when transaction is submitted
  });

  const handleTrade = async () => {
    if (!quote || !address) return;

    setPendingQuote(quote);
    setShowConfirmModal(true);
  };

  const executeTrade = async () => {
    if (!pendingQuote || !address) return;

    try {
      const quoteStruct = {
        trader: pendingQuote.quote.trader as `0x${string}`,
        market: pendingQuote.quote.market as `0x${string}`,
        outcome: pendingQuote.quote.outcome as 0 | 1,
        amount: BigInt(pendingQuote.quote.amount),
        cost: BigInt(pendingQuote.quote.cost),
        deadline: BigInt(pendingQuote.quote.deadline),
        nonce: BigInt(pendingQuote.quote.nonce),
        isSell: pendingQuote.quote.isSell,
        minAmountOut: BigInt(pendingQuote.quote.minAmountOut ?? 0),
        minReturn: BigInt(pendingQuote.quote.minReturn ?? 0),
      };

      const value = pendingQuote.quote.isSell ? 0n : BigInt(pendingQuote.quote.cost);

      await writeContractAsync({
        address: pendingQuote.quote.market as `0x${string}`,
        abi: MARKET_ABI,
        functionName: "executeTrade",
        args: [
          quoteStruct,
          pendingQuote.signature as `0x${string}`,
          BigInt(pendingQuote.quote.minAmountOut ?? 0),
          BigInt(pendingQuote.quote.minReturn ?? 0),
        ],
        value,
      });

      setShowConfirmModal(false);
      // Refetch data after successful trade
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error: any) {
      console.error("Trade execution failed:", error);
      // Error will be shown via wagmi's error handling
    }
  };

  const impliedProbability = quote
    ? Number(quote.quote.cost) / (Number(quote.quote.amount) + Number(quote.quote.cost))
    : displayProbs.yes;

  const isMarketOpen = market.status === "OPEN";
  const isMarketClosingSoon = marketInfo && endTime 
    ? Number(endTime) * 1000 - Date.now() < 3600000 // 1 hour
    : false;

  return (
    <div className="space-y-6">
      {/* Market Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-2xl mb-2">
                Market #{market.id.slice(0, 8)}
              </CardTitle>
              <CardDescription>
                Binary prediction market settled via optimistic oracle
              </CardDescription>
            </div>
            <Badge variant={market.status === "OPEN" ? "success" : "secondary"}>
              {market.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Volume</div>
              <div className="text-sm font-semibold">{formatEth(market.collateral, 2)}</div>
            </div>
            {endTime && (
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Ends
                </div>
                <div className="text-sm font-semibold">
                  {formatTimeRemaining(Number(endTime) * 1000)}
                </div>
              </div>
            )}
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Contract</div>
              <div className="text-xs font-mono">
                {market.contractAddress ? formatAddress(market.contractAddress) : "Not deployed"}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Created</div>
              <div className="text-sm">{market.createdAt.toLocaleDateString()}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Probability Visualization */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Market Probabilities</CardTitle>
            <CardDescription>
              Current implied probabilities based on token supply
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                    YES
                  </span>
                  <span className="text-2xl font-bold">
                    {Math.round(displayProbs.yes * 100)}%
                  </span>
                </div>
                <Progress value={displayProbs.yes * 100} className="h-3" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg font-semibold text-red-600 dark:text-red-400">
                    NO
                  </span>
                  <span className="text-2xl font-bold">
                    {Math.round(displayProbs.no * 100)}%
                  </span>
                </div>
                <Progress value={displayProbs.no * 100} className="h-3" />
              </div>

              {/* Token Supply Info */}
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-zinc-500 dark:text-zinc-400 mb-1">YES Supply</div>
                    <div className="font-semibold">{formatEth(yesSupply || 0n, 2)}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500 dark:text-zinc-400 mb-1">NO Supply</div>
                    <div className="font-semibold">{formatEth(noSupply || 0n, 2)}</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trade Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Trade</CardTitle>
            <CardDescription>
              Buy or sell outcome tokens
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Side Toggle */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={side === "YES" ? "default" : "outline"}
                onClick={() => setSide("YES")}
                disabled={!isMarketOpen}
              >
                YES
              </Button>
              <Button
                variant={side === "NO" ? "default" : "outline"}
                onClick={() => setSide("NO")}
                disabled={!isMarketOpen}
              >
                NO
              </Button>
            </div>

            {/* Amount Input */}
            <div>
              <Label htmlFor="amount">Amount (tokens)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={!isMarketOpen}
                  min="0"
                  step="0.1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Set max based on balance if selling
                    if (isSell) {
                      const balance = side === "YES" ? positions?.yesBalance : positions?.noBalance;
                      if (balance) {
                        setAmount(formatEth(balance, 4).replace(" ETH", ""));
                      }
                    }
                  }}
                  disabled={!isMarketOpen}
                >
                  Max
                </Button>
              </div>
            </div>

            {/* Buy/Sell Toggle */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isSell"
                checked={isSell}
                onChange={(e) => setIsSell(e.target.checked)}
                disabled={!isMarketOpen}
                className="h-4 w-4 rounded border-zinc-300"
              />
              <Label htmlFor="isSell" className="cursor-pointer">
                Sell instead of buy
              </Label>
            </div>

            {/* Real-Time Quote Box */}
            {quote && !isExpired && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 space-y-2 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="text-sm font-semibold mb-3">Quote Preview</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">You are {isSell ? "selling" : "buying"}:</span>
                    <span className="font-semibold">{amount} {side}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">{isSell ? "You receive" : "Cost"}:</span>
                    <span className="font-semibold">{formatEth(quote.quote.cost, 4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Implied probability:</span>
                    <span className="font-semibold">{Math.round(impliedProbability * 100)}%</span>
                  </div>
                  {secondsRemaining !== null && (
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Quote expires in:
                      </span>
                      <span className="text-xs font-semibold">{secondsRemaining}s</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Warnings */}
            {isExpired && (
              <div className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200">
                <AlertTriangle className="h-4 w-4" />
                Quote expired. Please refresh.
              </div>
            )}
            {isMarketClosingSoon && (
              <div className="flex items-center gap-2 rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-800 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-200">
                <AlertTriangle className="h-4 w-4" />
                Market closing soon
              </div>
            )}
            {quoteError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200">
                {parseContractError(quoteError)}
              </div>
            )}

            {/* Trade Button */}
            <Button
              onClick={handleTrade}
              disabled={!isMarketOpen || !quote || isExpired || quoteLoading || isWriting || isConfirming}
              className="w-full"
            >
              {quoteLoading
                ? "Requesting quote..."
                : isWriting
                ? "Signing transaction..."
                : isConfirming
                ? "Confirming..."
                : isExpired
                ? "Quote Expired"
                : !quote
                ? "Enter amount"
                : "Review Trade"}
            </Button>

            {!address && (
              <p className="text-xs text-center text-zinc-500 dark:text-zinc-400">
                Connect wallet to trade
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Panel */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {market.trades.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No trades yet</p>
          ) : (
            <div className="space-y-3">
              {market.trades.map((trade) => (
                <div
                  key={trade.id}
                  className="flex items-center justify-between py-2 border-b border-zinc-200 dark:border-zinc-800 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    {trade.side === "YES" ? (
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-600" />
                    )}
                    <div>
                      <div className="text-sm font-medium">{trade.side}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatAddress(trade.trader)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{formatEth(trade.amount, 2)}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {formatEth(trade.cost, 4)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trade Confirmation Modal */}
      {showConfirmModal && pendingQuote && (
        <TradeConfirmationModal
          quote={pendingQuote}
          side={side}
          amount={amount}
          isSell={isSell}
          onConfirm={executeTrade}
          onCancel={() => {
            setShowConfirmModal(false);
            setPendingQuote(null);
          }}
          isPending={isWriting || isConfirming}
        />
      )}
    </div>
  );
}

