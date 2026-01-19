"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  Loader,
  X,
  ExternalLink,
  ArrowUpRight,
} from "lucide-react";
import {
  calculateProbability,
  formatEth,
  formatTimeRemaining,
  formatAddress,
} from "@/lib/utils";
import { getSettlementConfig, weiToEth, formatSeconds, isRedemptionClosed, getRedemptionTimeRemaining } from "@/lib/settlementConfig";
import { SettlementMarket } from "@/hooks/useSettlementMarkets";

const SETTLEMENT_ENGINE_ABI = [
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
  {
    type: "function",
    name: "creatorWithdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "market", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "isRedemptionOpen",
    stateMutability: "view",
    inputs: [{ name: "market", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

const MARKET_ABI = [
  {
    type: "function",
    name: "getMarketInfo",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "state_", type: "uint8" },
      { name: "endTime_", type: "uint256" },
      { name: "yesToken_", type: "address" },
      { name: "noToken_", type: "address" },
      { name: "vault_", type: "address" },
      { name: "isExpired_", type: "bool" },
      { name: "isClosed_", type: "bool" },
    ],
  },
] as const;

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

const VAULT_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "market", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const ORACLE_ABI = [
  {
    type: "function",
    name: "getFinalizationTime",
    stateMutability: "view",
    inputs: [{ name: "market", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

interface Props {
  market: SettlementMarket;
  onClose: () => void;
  userAddress?: `0x${string}`;
}

function parseEthToWei(value: string): bigint {
  if (!value || !value.trim()) return 0n;
  try {
    const [whole = "0", fraction = "0"] = value.split(".");
    const fracPadded = (fraction + "000000000000000000").slice(0, 18);
    return BigInt(whole) * 10n ** 18n + BigInt(fracPadded);
  } catch {
    return 0n;
  }
}

export default function SettlementMarketDetailModal({
  market,
  onClose,
  userAddress,
}: Props) {
  const config = getSettlementConfig();
  const isSettled = market.settlementStatus === "SETTLED";
  const marketAddress = market.contractAddress as `0x${string}` | undefined;
  const settlementEngineAddress = config.settlementEngineAddress as `0x${string}`;
  const oracleAdapterAddress = config.oracleAdapterAddress as `0x${string}`;

  const [redeemAmount, setRedeemAmount] = useState("");
  const [txHash, setTxHash] = useState<string | undefined>();

  // Get market info
  const { data: marketInfo } = useReadContract({
    address: marketAddress,
    abi: MARKET_ABI,
    functionName: "getMarketInfo",
    query: {
      enabled: !!marketAddress,
    },
  });

  const marketState = marketInfo?.[0];
  const yesTokenAddress = (marketInfo?.[2] as `0x${string}` | undefined) || undefined;
  const noTokenAddress = (marketInfo?.[3] as `0x${string}` | undefined) || undefined;
  const vaultAddress = (marketInfo?.[4] as `0x${string}` | undefined) || undefined;

  // Determine winning token based on resolved outcome
  const winningToken = market.latestOracleEvent?.finalized === "YES" ? yesTokenAddress : noTokenAddress;

  // Get user's winning token balance
  const { data: userTokenBalance } = useReadContract({
    address: winningToken,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!winningToken && !!userAddress,
    },
  });

  // Get vault balance (remaining ETH for creator withdrawal)
  const { data: vaultBalance } = useReadContract({
    address: vaultAddress,
    abi: VAULT_ABI,
    functionName: "balanceOf",
    args: marketAddress ? [marketAddress] : undefined,
    query: {
      enabled: !!vaultAddress && !!marketAddress,
    },
  });

  // Get finalization time from oracle
  const { data: finalizationTime } = useReadContract({
    address: oracleAdapterAddress,
    abi: ORACLE_ABI,
    functionName: "getFinalizationTime",
    args: marketAddress ? [marketAddress] : undefined,
    query: {
      enabled: !!marketAddress,
    },
  });

  // Write contracts
  const { writeContractAsync: redeemAsync, isPending: redeemPending } = useWriteContract();
  const { writeContractAsync: withdrawAsync, isPending: withdrawPending } = useWriteContract();
  const { isLoading: isRedeemConfirming, isSuccess: redeemSuccess } = useWaitForTransactionReceipt({ hash: txHash? txHash as `0x${string}` : undefined });
  const { isLoading: isWithdrawConfirming, isSuccess: withdrawSuccess } = useWaitForTransactionReceipt({ hash: txHash? txHash as `0x${string}` : undefined });

  // Calculate probability
  const probabilities = calculateProbability(BigInt(market.qYes), BigInt(market.qNo));
  const yesPercent = (probabilities.yes * 100).toFixed(1);
  const noPercent = (probabilities.no * 100).toFixed(1);

  // Format balances
  const redeemableAmount = userTokenBalance ? formatEth(userTokenBalance, 4) : "0 ETH";
  const vaultEthAmount = vaultBalance ? formatEth(vaultBalance, 4) : "0 ETH";

  // Time remaining in redemption period
  const timeRemaining = finalizationTime
    ? getRedemptionTimeRemaining(Number(finalizationTime))
    : 0;
  const timeRemainingFormatted = formatTimeRemaining(timeRemaining);

  // Check if creator
  const isCreator = userAddress?.toLowerCase() === market.creator.toLowerCase();

  const handleRedeem = async () => {
    if (!redeemAmount || !marketAddress || !userAddress) return;

    try {
      const hash = await redeemAsync({
        address: settlementEngineAddress,
        abi: SETTLEMENT_ENGINE_ABI,
        functionName: "redeem",
        args: [marketAddress, parseEthToWei(redeemAmount)],
      });
      setTxHash(hash);
      setRedeemAmount("");
    } catch (error) {
      console.error("Redemption failed:", error);
    }
  };

  const handleCreatorWithdraw = async () => {
    if (!marketAddress) return;

    try {
      const hash = await withdrawAsync({
        address: settlementEngineAddress,
        abi: SETTLEMENT_ENGINE_ABI,
        functionName: "creatorWithdraw",
        args: [marketAddress],
      });
      setTxHash(hash);
    } catch (error) {
      console.error("Withdrawal failed:", error);
    }
  };

  const statusConfig = {
    RESOLVED: {
      color: "bg-emerald-50 dark:bg-emerald-900/20",
      textColor: "text-emerald-700 dark:text-emerald-300",
      borderColor: "border-emerald-200 dark:border-emerald-800",
      badge: "success" as const,
      label: "Redemption Open",
      description: "Token holders can redeem winning tokens for ETH",
    },
    SETTLED: {
      color: "bg-blue-50 dark:bg-blue-900/20",
      textColor: "text-blue-700 dark:text-blue-300",
      borderColor: "border-blue-200 dark:border-blue-800",
      badge: "default" as const,
      label: "Settlement Closed",
      description: "Creators can withdraw remaining collateral",
    },
  };

  const statusInfo = statusConfig[market.settlementStatus];

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-2xl">{market.title || "Untitled Market"}</DialogTitle>
              <DialogDescription className="mt-2">
                {market.description || "No description available"}
              </DialogDescription>
            </div>
            <Badge variant={statusInfo.badge}>{statusInfo.label}</Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Market Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Market Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">Category</span>
                  <p className="font-semibold">
                    {market.category ? market.category.charAt(0).toUpperCase() + market.category.slice(1) : "Other"}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">Resolved Outcome</span>
                  <p className="font-semibold text-lg">
                    {market.latestOracleEvent?.finalized === "YES" ? (
                      <span className="text-blue-600 dark:text-blue-400">YES</span>
                    ) : (
                      <span className="text-pink-600 dark:text-pink-400">NO</span>
                    )}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-zinc-600 dark:text-zinc-400">Market Address</span>
                  <p className="font-mono text-sm">{formatAddress(market.contractAddress || "")}</p>
                </div>
              </div>

              {/* Probability */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">Market Probability</span>
                  <div className="flex gap-3">
                    <span className="font-semibold text-blue-600 dark:text-blue-400">YES {yesPercent}%</span>
                    <span className="font-semibold text-pink-600 dark:text-pink-400">NO {noPercent}%</span>
                  </div>
                </div>
                <Progress value={parseFloat(yesPercent)} className="h-2" />
              </div>
            </CardContent>
          </Card>

          {/* Settlement Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Settlement Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className={`rounded-lg border ${statusInfo.borderColor} ${statusInfo.color} p-4`}>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle className="h-5 w-5" />
                    <span>{statusInfo.label}</span>
                  </div>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">{statusInfo.description}</p>
                  {!isSettled && (
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4" />
                      <span>
                        Redemption period ends in: <strong>{timeRemainingFormatted}</strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Resolved Outcome Info */}
              {market.latestOracleEvent && (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="space-y-1">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                      Resolved by: {formatAddress(market.latestOracleEvent.proposer)}
                    </p>
                    {market.latestOracleEvent.disputed && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Disputed by: {formatAddress(market.latestOracleEvent.disputer || "")}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Card - Changes based on status */}
          {!isSettled ? (
            // RESOLVED: Token Redemption
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Redeem Winning Tokens</CardTitle>
                <CardDescription>Convert your winning tokens to ETH</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {userTokenBalance && userTokenBalance > 0n ? (
                  <>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        <span className="font-semibold text-emerald-900 dark:text-emerald-100">
                          You hold {redeemableAmount} winning tokens
                        </span>
                      </div>
                      <div className="text-sm text-emerald-700 dark:text-emerald-300">
                        Each token redeems for 1 ETH at 1:1 payout rate
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="redeemAmount">Amount to redeem (tokens)</Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          id="redeemAmount"
                          type="number"
                          value={redeemAmount}
                          onChange={(e) => setRedeemAmount(e.target.value)}
                          placeholder={redeemableAmount.replace(" ETH", "")}
                          max={redeemableAmount.replace(" ETH", "")}
                          min="0"
                          step="0.01"
                          disabled={redeemPending || isRedeemConfirming}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRedeemAmount(redeemableAmount.replace(" ETH", ""))}
                          disabled={redeemPending || isRedeemConfirming}
                        >
                          Max
                        </Button>
                      </div>
                    </div>

                    {redeemAmount && Number(redeemAmount) > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900"
                      >
                        <div className="text-sm font-semibold mb-2">Redemption Preview</div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-zinc-600 dark:text-zinc-400">Tokens to redeem:</span>
                            <span className="font-semibold">{redeemAmount}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-600 dark:text-zinc-400">ETH to receive:</span>
                            <span className="font-semibold">
                              {formatEth(parseEthToWei(redeemAmount), 4)}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}

                    <Button
                      onClick={handleRedeem}
                      disabled={!redeemAmount || Number(redeemAmount) <= 0 || redeemPending || isRedeemConfirming}
                      className="w-full"
                    >
                      {redeemPending || isRedeemConfirming ? (
                        <>
                          <Loader className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <ArrowUpRight className="h-4 w-4 mr-2" />
                          Redeem Tokens
                        </>
                      )}
                    </Button>

                    {redeemSuccess && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-200"
                      >
                        <CheckCircle className="h-4 w-4" />
                        <span>Redemption successful!</span>
                        {txHash && (
                          <a
                            href={`https://sepolia.etherscan.io/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-auto"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </motion.div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-zinc-50 border border-zinc-200 p-4 text-sm text-zinc-600 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400">
                    <AlertTriangle className="h-4 w-4" />
                    <span>No winning tokens to redeem in your wallet</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            // SETTLED: Creator Withdrawal
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Creator Profit Withdrawal</CardTitle>
                <CardDescription>Redeem-period closed. Withdraw remaining collateral.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isCreator ? (
                  <>
                    {vaultBalance && vaultBalance > 0n ? (
                      <>
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            <span className="font-semibold text-blue-900 dark:text-blue-100">
                              Remaining Collateral: {vaultEthAmount}
                            </span>
                          </div>
                          <div className="text-sm text-blue-700 dark:text-blue-300">
                            This is the remaining ETH from your market after all redemptions
                          </div>
                        </div>

                        <Button
                          onClick={handleCreatorWithdraw}
                          disabled={withdrawPending || isWithdrawConfirming}
                          className="w-full"
                        >
                          {withdrawPending || isWithdrawConfirming ? (
                            <>
                              <Loader className="h-4 w-4 mr-2 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <ArrowUpRight className="h-4 w-4 mr-2" />
                              Withdraw {vaultEthAmount}
                            </>
                          )}
                        </Button>

                        {withdrawSuccess && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex items-center gap-2 rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200"
                          >
                            <CheckCircle className="h-4 w-4" />
                            <span>Withdrawal successful!</span>
                            {txHash && (
                              <a
                                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-auto"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            )}
                          </motion.div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-2 rounded-lg bg-zinc-50 border border-zinc-200 p-4 text-sm text-zinc-600 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400">
                        <AlertCircle className="h-4 w-4" />
                        <span>No remaining collateral to withdraw</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Only the market creator can withdraw profits</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
