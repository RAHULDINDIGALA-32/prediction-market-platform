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
import { useMarketInfo, useMarketProbabilities, useUserPositions, useEthBalance } from "@/hooks/useMarketData";
import { useUnsignedQuote, signQuote } from "@/hooks/useQuote";
import { calculateProbability, formatEth, formatTimeRemaining, formatAddress } from "@/lib/utils";
import { parseContractError } from "@/lib/errors";
import { AlertTriangle, Clock, TrendingUp, TrendingDown, AlertCircle, Wallet, CheckCircle, Loader } from "lucide-react";
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
  title?: string | null;
  description?: string | null;
  category?: string | null;
  resolutionSource?: string | null;
  ipfsCid?: string | null;
  metadataHash?: string | null;
  endTime?: bigint | null;
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

const ESTIMATED_GAS_COST = BigInt(150000); // Estimated gas units for a trade
const GAS_PRICE_GWEI = BigInt(50); // Estimate 50 gwei
const SCALE_GWEI = 1_000_000_000n;
const SCALE_WEI = 1_000_000_000_000_000_000n;

export default function MarketDetailClient({ market }: Props) {
  const { address } = useAccount();
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [amount, setAmount] = useState("");
  const [isSell, setIsSell] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingUnsignedQuote, setPendingUnsignedQuote] = useState<any>(null);
  const [signingError, setSigningError] = useState<string | null>(null);
  const [isSigningQuote, setIsSigningQuote] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<"pending" | "confirmed" | "failed" | null>(null);

  const marketAddress = market.contractAddress as `0x${string}` | undefined;
  const { data: marketInfo } = useMarketInfo(marketAddress);

  // Get token addresses from market info
  const yesToken = marketInfo?.[2] as `0x${string}` | undefined;
  const noToken = marketInfo?.[3] as `0x${string}` | undefined;
  const endTime = marketInfo?.[1];

  const { data: probabilities, yesSupply, noSupply } = useMarketProbabilities(
    marketAddress,
    yesToken,
    noToken
  );

  const positions = useUserPositions(address, yesToken, noToken);
  const { balance: ethBalance } = useEthBalance(address);

  const displayProbs = probabilities || calculateProbability(market.qYes, market.qNo);

  // Request unsigned quote only when amount > 0
  const quoteRequest = address && amount && Number(amount) > 0
    ? {
        marketId: market.id,
        trader: address,
        side,
        amount: (BigInt(Math.floor(Number(amount) * 1e18))).toString(),
        isSell,
      }
    : null;

  const { quote: unsignedQuote, error: quoteError, isLoading: quoteLoading, secondsRemaining, isExpired, refetch } = useUnsignedQuote(quoteRequest);

  // Auto-refresh quote every 10 seconds
  useEffect(() => {
    if (!unsignedQuote || isExpired) return;
    const interval = setInterval(() => {
      refetch();
    }, 10000);
    return () => clearInterval(interval);
  }, [unsignedQuote, isExpired, refetch]);

  const { writeContractAsync, isPending: isWriting } = useWriteContract();
  const { data: receipt, isLoading: isConfirming, isSuccess, isError } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}` | undefined,
  });

  // Update transaction status based on receipt
  useEffect(() => {
    if (isSuccess) {
      setTxStatus("confirmed");
      // Auto-close modal and reset form after successful confirmation
      setTimeout(() => {
        setShowConfirmModal(false);
        setAmount("");
        setPendingUnsignedQuote(null);
        setTxHash(null);
        setTxStatus(null);
      }, 3000); // Show success for 3 seconds
    } else if (isError) {
      setTxStatus("failed");
    }
  }, [isSuccess, isError]);

  // Calculate max buyable / sellable
  const calculateMaxAmount = (): string => {
    if (!address) return "0";

    if (isSell) {
      // For selling: total tokens they have
      const tokenBalance = side === "YES" ? positions.yesBalance : positions.noBalance;
      return formatEth(tokenBalance, 4).replace(" ETH", "");
    } else {
      // For buying: max they can afford with ETH (accounting for gas)
      if (!unsignedQuote || !unsignedQuote.quote?.cost) {
        // Estimate: (balance - gas cost) / average cost per token
        const estimatedGasCost = ESTIMATED_GAS_COST * GAS_PRICE_GWEI * SCALE_GWEI;
        const availableEth = ethBalance > estimatedGasCost ? ethBalance - estimatedGasCost : 0n;
        // Rough estimate: assume cost ≈ amount (conservative)
        return formatEth(availableEth / BigInt(2), 4).replace(" ETH", "");
      }

      // Actual calculation with current quote cost
      const quoteCost = BigInt(unsignedQuote.quote.cost);
      const estimatedGasCost = (ESTIMATED_GAS_COST * GAS_PRICE_GWEI * BigInt(1e9)) / BigInt(1e18);
      const availableEth = ethBalance > estimatedGasCost ? ethBalance - estimatedGasCost : 0n;

      if (availableEth === 0n) return "0";

      // Max tokens = available ETH / cost per token
      // If amount * cost = totalCost, then max_amount = available_eth / (cost / amount)
      const currentAmount = BigInt(unsignedQuote.quote.amount);
      if (currentAmount === 0n) return "0";

      const costPerToken = (quoteCost * SCALE_WEI) / currentAmount; // Wei per token
      const maxTokens = (availableEth * SCALE_WEI) / costPerToken;

      return formatEth(maxTokens, 4).replace(" ETH", "");
    }
  };

  // Validation checks
  const yesBalance = positions.yesBalance;
  const noBalance = positions.noBalance;
  const selectedBalance = side === "YES" ? yesBalance : noBalance;

  const amountBigInt = amount ? BigInt(Math.floor(Number(amount) * 1e18)) : 0n;
  const isAmountExceedsSellBalance = isSell && amountBigInt > selectedBalance;
  const isAmountExceedsEthBalance = !isSell && unsignedQuote && BigInt(unsignedQuote.quote.cost) > ethBalance;

  // Handle max button click
  const handleMaxClick = () => {
    const maxAmount = calculateMaxAmount();
    setAmount(maxAmount);
  };

  // Handle amount change
  const handleAmountChange = (value: string) => {
    // Only allow numbers and decimals
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setAmount(value);
    }
  };

  // Handle trade confirmation
  const handleTradeClick = async () => {
    if (!unsignedQuote || !address) return;

    setPendingUnsignedQuote(unsignedQuote);
    setShowConfirmModal(true);
  };

  // Execute trade after signing
  const executeTrade = async () => {
    if (!pendingUnsignedQuote || !address) return;

    try {
      setIsSigningQuote(true);
      setSigningError(null);
      setTxStatus(null);
      setTxHash(null);

      // Step 1: Sign the quote
      const signedQuote = await signQuote(pendingUnsignedQuote, market.id);
      console.log("Signed quote (outcome already converted to contract enum):", signedQuote);

      // Step 2: Execute on-chain transaction
      // The outcome in signedQuote is already in contract format (1 or 2)

      const quoteStruct = {
        trader: signedQuote.quote.trader as `0x${string}`,
        market: signedQuote.quote.market as `0x${string}`,
        outcome: signedQuote.quote.outcome, // Already contract enum (1 or 2) - signature was computed over this value
        amount: BigInt(signedQuote.quote.amount),
        cost: BigInt(signedQuote.quote.cost),
        deadline: BigInt(signedQuote.quote.deadline),
        nonce: BigInt(signedQuote.quote.nonce),
        isSell: signedQuote.quote.isSell,
        minAmountOut: BigInt(signedQuote.quote.minAmountOut ?? 0),
        minReturn: BigInt(signedQuote.quote.minReturn ?? 0),
      };

      console.log("Quote struct for contract (outcome from signed quote):", quoteStruct);

      // Validate value matches cost for buys
      const value = signedQuote.quote.isSell ? 0n : BigInt(signedQuote.quote.cost);
      console.log("Transaction value:", value.toString(), "wei", "cost:", signedQuote.quote.cost);

      if (!signedQuote.quote.isSell && value !== BigInt(signedQuote.quote.cost)) {
        throw new Error("Value mismatch: ETH amount must exactly match quote cost");
      }

      setTxStatus("pending");

      const txHashResult = await writeContractAsync({
        address: signedQuote.quote.market as `0x${string}`,
        abi: MARKET_ABI,
        functionName: "executeTrade",
        args: [
          quoteStruct,
          signedQuote.signature as `0x${string}`,
          BigInt(signedQuote.quote.minAmountOut ?? 0),
          BigInt(signedQuote.quote.minReturn ?? 0),
        ],
        value,
         gas: BigInt(5000000), // Set a high gas limit to avoid out-of-gas errors
      });

      console.log("Transaction sent:", txHashResult);
      setTxHash(txHashResult);
    } catch (error: any) {
      console.error("Trade execution failed:", error);
      setTxStatus("failed");

      // Detailed error parsing
      let errorMessage = "Trade execution failed. Please try again.";
      
      if (error?.message?.includes("User rejected")) {
        errorMessage = "Transaction rejected by user";
      } else if (error?.message?.includes("insufficient") || error?.message?.includes("Insufficient")) {
        errorMessage = "Insufficient balance or allowance";
      } else if (error?.message?.includes("REVERT") || error?.data?.message?.includes("REVERT")) {
        errorMessage = "Transaction reverted on-chain. Check contract state and parameters.";
      } else if (error?.shortMessage) {
        errorMessage = error.shortMessage;
      } else if (error?.message) {
        errorMessage = error.message;
      }

      setSigningError(errorMessage);
    } finally {
      setIsSigningQuote(false);
    }
  };

  const impliedProbability = unsignedQuote && unsignedQuote.quote
    ? Number(unsignedQuote.quote.cost) / (Number(unsignedQuote.quote.amount) + Number(unsignedQuote.quote.cost))
    : displayProbs.yes;

  const isMarketOpen = market.status === "OPEN";
  const isMarketClosingSoon = endTime
    ? Number(endTime) * 1000 - Date.now() < 3600000
    : false;

  return (
    <div className="space-y-6">
      {/* Market Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-2xl mb-2">
                {market.title || `Market #${market.id.slice(0, 8)}`}
              </CardTitle>
              <CardDescription>
                {market.description || "Binary prediction market settled via optimistic oracle"}
              </CardDescription>
              {market.category && (
                <Badge variant="outline" className="mt-2">
                  {market.category}
                </Badge>
              )}
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
              <div className="text-sm">{new Date(market.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</div>
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
            {/* Wallet Balance Display */}
            {address && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 dark:bg-blue-900/20 dark:border-blue-800 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-200">
                  <Wallet className="h-4 w-4" />
                  Your Balance
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <div className="text-blue-700 dark:text-blue-300 mb-1">ETH</div>
                    <div className="font-semibold text-blue-900 dark:text-blue-100">
                      {formatEth(ethBalance, 4)}
                    </div>
                  </div>
                  <div>
                    <div className="text-blue-700 dark:text-blue-300 mb-1">YES Tokens</div>
                    <div className="font-semibold text-blue-900 dark:text-blue-100">
                      {formatEth(yesBalance, 2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-blue-700 dark:text-blue-300 mb-1">NO Tokens</div>
                    <div className="font-semibold text-blue-900 dark:text-blue-100">
                      {formatEth(noBalance, 2)}
                    </div>
                  </div>
                </div>
              </div>
            )}

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
              <Label htmlFor="isSell" className="cursor-pointer text-sm">
                Sell {side} tokens
              </Label>
            </div>

            {/* Amount Input */}
            <div>
              <Label htmlFor="amount" className="text-sm">
                Amount ({side === "YES" ? "YES" : "NO"} tokens)
              </Label>
              <div className="flex gap-2 mt-1">
                <Input
                  id="amount"
                  type="text"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="0.0"
                  disabled={!isMarketOpen}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMaxClick}
                  disabled={!isMarketOpen || !address}
                  className="min-w-max"
                >
                  Max
                </Button>
              </div>
              {isSell && selectedBalance > 0n && (
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Available: {formatEth(selectedBalance, 4)}
                </div>
              )}
            </div>

            {/* Validation Errors */}
            {isAmountExceedsSellBalance && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                Insufficient {side} balance
              </div>
            )}
            {isAmountExceedsEthBalance && !isSell && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                Insufficient ETH for this trade (includes gas). Require {formatEth(BigInt(unsignedQuote.quote.cost), 4)}
              </div>
            )}

            {/* Quote Preview */}
            {unsignedQuote && !isExpired && !isAmountExceedsSellBalance && !isAmountExceedsEthBalance && (
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
                    <span className="font-semibold">{formatEth(BigInt(unsignedQuote.quote.cost), 4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Implied probability:</span>
                    <span className="font-semibold">{Math.round(impliedProbability * 100)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">Slippage protection:</span>
                    <span className="font-semibold">1%</span>
                  </div>
                  {secondsRemaining !== null && (
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800">
                      <span className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Quote expires in:
                      </span>
                      <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        {secondsRemaining}s
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Warnings */}
            {isExpired && !isAmountExceedsSellBalance && (
              <div className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200">
                <AlertTriangle className="h-4 w-4" />
                Quote expired. Please adjust amount to refresh.
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
                {parseContractError(quoteError.message)}
              </div>
            )}
            {signingError && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {signingError}
              </div>
            )}

            {/* Transaction Status UI */}
            {txHash && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-lg border-2 p-4 space-y-3 ${
                  txStatus === "pending"
                    ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20"
                    : txStatus === "confirmed"
                    ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20"
                    : "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  {txStatus === "pending" && (
                    <Loader className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
                  )}
                  {txStatus === "confirmed" && (
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  )}
                  {txStatus === "failed" && (
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  )}
                  <div className="flex-1">
                    <div className={`font-semibold text-sm ${
                      txStatus === "pending"
                        ? "text-blue-900 dark:text-blue-100"
                        : txStatus === "confirmed"
                        ? "text-green-900 dark:text-green-100"
                        : "text-red-900 dark:text-red-100"
                    }`}>
                      {txStatus === "pending" && "Transaction Pending..."}
                      {txStatus === "confirmed" && "Trade Executed Successfully! ✓"}
                      {txStatus === "failed" && "Transaction Failed"}
                    </div>
                    <div className={`text-xs mt-1 ${
                      txStatus === "pending"
                        ? "text-blue-700 dark:text-blue-300"
                        : txStatus === "confirmed"
                        ? "text-green-700 dark:text-green-300"
                        : "text-red-700 dark:text-red-300"
                    }`}>
                      Hash: <span className="font-mono break-all">{txHash.slice(0, 10)}...{txHash.slice(-8)}</span>
                    </div>
                  </div>
                </div>
                {txStatus === "pending" && (
                  <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                    <p>• Waiting for block confirmation</p>
                  </div>
                )}
                {txStatus === "confirmed" && (
                  <div className="text-xs text-green-700 dark:text-green-300 space-y-1">
                    <p>• {formatEth(BigInt(pendingUnsignedQuote?.quote?.amount || "0"), 4)} {side} tokens received</p>
                    <p>• Market data will update shortly</p>
                  </div>
                )}
                {txStatus === "failed" && (
                  <div className="text-xs text-red-700 dark:text-red-300">
                    <p className="mb-2">Check the error message above for details</p>
                    <p className="font-mono text-xs break-all bg-red-100 dark:bg-red-900/40 p-2 rounded">
                      {txHash}
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {/* Trade Button */}
            <Button
              onClick={handleTradeClick}
              disabled={
                !isMarketOpen ||
                !unsignedQuote ||
                isExpired ||
                quoteLoading ||
                isAmountExceedsSellBalance ||
                isAmountExceedsEthBalance ||
                !amount ||
                isWriting
              }
              className="w-full cursor-pointer"
            >
              {quoteLoading
                ? "Getting quote..."
                : isExpired
                ? "Quote Expired"
                : !unsignedQuote
                ? "Enter amount"
                : isAmountExceedsSellBalance || isAmountExceedsEthBalance
                ? "Insufficient Balance"
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
      {showConfirmModal && pendingUnsignedQuote && (
        <TradeConfirmationModal
          quote={{
            quote: {
              ...pendingUnsignedQuote.quote,
              marketId: market.id,
            },
            signature: "", // Will be generated during execution
          }}
          side={side}
          amount={amount}
          isSell={isSell}
          onConfirm={executeTrade}
          onCancel={() => {
            setShowConfirmModal(false);
            setPendingUnsignedQuote(null);
            setSigningError(null);
          }}
          isPending={isSigningQuote || isWriting}
        />
      )}
    </div>
  );
}
