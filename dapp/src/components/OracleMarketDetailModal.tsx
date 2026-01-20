"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  Loader,
  ExternalLink,
  X
} from "lucide-react";
import {
  calculateProbability,
  formatEth,
  formatTimeRemaining,
  formatAddress,
} from "@/lib/utils";
import { getOracleConfig, weiToEth, formatSeconds } from "@/lib/oracleConfig";
import { syncOracleToDatabase } from "@/lib/blockchainUtils";
import { OracleMarket } from "@/hooks/useOracleMarkets";


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
  {
    type: "function",
    name: "finalizeUndisputedOutcome",
    stateMutability: "nonpayable",
    inputs: [{ name: "market", type: "address" }],
    outputs: [],
  },
] as const;

const ORACLE_ADDRESS = (process.env.NEXT_PUBLIC_ORACLE_ADAPTER_ADDRESS as `0x${string}`) ??
  ("0x0000000000000000000000000000000000000000" as `0x${string}`);

interface Props {
  market: OracleMarket;
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

export default function OracleMarketDetailModal({
  market,
  onClose,
  userAddress,
}: Props) {
  const config = getOracleConfig();
  const { writeContractAsync, isPending } = useWriteContract();
  const [selectedOutcome, setSelectedOutcome] = useState<"YES" | "NO">("YES");
  const [bondAmount, setBondAmount] = useState(weiToEth(config.proposerBondWei));
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txError, setTxError] = useState<string | null>(null);
  //const [isResolving, setIsResolving] = useState(false);
  const [resolveDecision, setResolveDecision] = useState<"correct" | "incorrect">("correct");

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}` | undefined,
  });

  const probabilities = calculateProbability(market.qYes, market.qNo);
  const yesPercent = (probabilities.yes * 100).toFixed(1);
  const noPercent = (probabilities.no * 100).toFixed(1);
  
  const timeRemaining = market.endTime
    ? formatTimeRemaining(Number(market.endTime) * 1000)
    : "Unknown";

  // Determine if user is the proposer
  // const isProposer =
  //   market.latestOracleEvent?.proposer?.toLowerCase() ===
  //   userAddress?.toLowerCase();
  // const isDisputer =
  //   market.latestOracleEvent?.disputer?.toLowerCase() ===
  //   userAddress?.toLowerCase();

  // Reset form when market changes
  useEffect(() => {
    setTxHash(null);
    setTxStatus("idle");
    setTxError(null);
  }, [market.id]);

  const handleProposeOutcome = async () => {
    try {
      setTxError(null);
      setTxStatus("pending");

      const value = parseEthToWei(bondAmount);
      if (value === 0n) {
        throw new Error("Invalid bond amount");
      }

      const hash = await writeContractAsync({
        address: ORACLE_ADDRESS,
        abi: ORACLE_ABI,
        functionName: "proposeOutcome",
        args: [
          market.contractAddress as `0x${string}`,
          selectedOutcome === "YES" ? 1 : 0,
        ],
        value,
      });

      setTxHash(hash);
      setTxStatus("success");

      // ISSUE #1 RESOLUTION: Sync oracle proposal to database
      console.log(`[ORACLE MODAL] Syncing proposal for market ${market.id}`);
      const syncSuccess = await syncOracleToDatabase(
        "propose",
        market.id,
        hash as `0x${string}`,
        {
          proposer: userAddress,
          proposedOutcome: selectedOutcome,
        }
      );

      if (!syncSuccess) {
        console.error(
          "[ORACLE MODAL] Proposal syncing failed - database may be out of sync"
        );
        setTxError(
          "Proposal confirmed but database sync failed. Please refresh the page."
        );
      }
    } catch (err: unknown) {
      setTxStatus("error");
      const errorMessage = err instanceof Error ? err.message : "Failed to propose outcome";
      setTxError(errorMessage);
      console.error("Propose error:", err);
    }
  };

  // const handleDisputeOutcome = async () => {
  //   try {
  //     setTxError(null);
  //     setTxStatus("pending");

  //     const value = parseEthToWei(bondAmount);
  //     if (value === 0n) {
  //       throw new Error("Invalid bond amount");
  //     }

  //     const hash = await writeContractAsync({
  //       address: ORACLE_ADDRESS,
  //       abi: ORACLE_ABI,
  //       functionName: "disputeOutcome",
  //       args: [market.contractAddress as `0x${string}`],
  //       value,
  //     });

  //     setTxHash(hash);
  //     setTxStatus("success");

  //     // ISSUE #2 RESOLUTION: Sync oracle dispute to database
  //     console.log(`[ORACLE MODAL] Syncing dispute for market ${market.id}`);
  //     const syncSuccess = await syncOracleToDatabase(
  //       "dispute",
  //       market.id,
  //       hash as `0x${string}`,
  //       {
  //         disputer: userAddress,
  //       }
  //     );

  //     if (!syncSuccess) {
  //       console.error(
  //         "[ORACLE MODAL] Dispute syncing failed - database may be out of sync"
  //       );
  //       setTxError(
  //         "Dispute confirmed but database sync failed. Please refresh the page."
  //       );
  //     }
  //   } catch (err: unknown) {
  //     setTxStatus("error");
  //     const errorMessage = err instanceof Error ? err.message : "Failed to dispute outcome";
  //     setTxError(errorMessage);
  //     console.error("Dispute error:", err);
  //   }
  // };

  const handleResolveOutcome = async () => {
    try {
      setTxError(null);
      setTxStatus("pending");

      const hash = await writeContractAsync({
        address: ORACLE_ADDRESS,
        abi: ORACLE_ABI,
        functionName: "resolveOutcome",
        args: [
          market.contractAddress as `0x${string}`,
          selectedOutcome === "YES" ? 1 : 0,
          resolveDecision === "correct",
        ],
      });

      setTxHash(hash);
      setTxStatus("success");

      // ISSUE #3 RESOLUTION: Sync oracle resolution to database
      console.log(`[ORACLE MODAL] Syncing resolution for market ${market.id}`);
      const syncSuccess = await syncOracleToDatabase(
        "resolve",
        market.id,
        hash as `0x${string}`,
        {
          finalOutcome: selectedOutcome,
        }
      );

      if (!syncSuccess) {
        console.error(
          "[ORACLE MODAL] Resolution syncing failed - database may be out of sync"
        );
        setTxError(
          "Resolution confirmed but database sync failed. Please refresh the page."
        );
      }
    } catch (err: unknown) {
      setTxStatus("error");
      const errorMessage = err instanceof Error ? err.message : "Failed to resolve outcome";
      setTxError(errorMessage);
      console.error("Resolve error:", err);
    }
  };

  // const handleFinalizeOutcome = async () => {
  //   try {
  //     setTxError(null);
  //     setTxStatus("pending");

  //     const hash = await writeContractAsync({
  //       address: ORACLE_ADDRESS,
  //       abi: ORACLE_ABI,
  //       functionName: "finalizeUndisputedOutcome",
  //       args: [market.contractAddress as `0x${string}`],
  //     });

  //     setTxHash(hash);
  //     setTxStatus("success");

    
  //     console.log(
  //       `[ORACLE MODAL] Syncing finalization for market ${market.id}`
  //     );
  //     const syncSuccess = await syncOracleToDatabase(
  //       "finalize",
  //       market.id,
  //       hash as `0x${string}`,
  //       {
  //         finalOutcome: market.latestOracleEvent?.proposed || "YES",
  //       }
  //     );

  //     if (!syncSuccess) {
  //       console.error(
  //         "[ORACLE MODAL] Finalization syncing failed - database may be out of sync"
  //       );
  //       setTxError(
  //         "Finalization confirmed but database sync failed. Please refresh the page."
  //       );
  //     }
  //   } catch (err: unknown) {
  //     setTxStatus("error");
  //     const errorMessage = err instanceof Error ? err.message : "Failed to finalize outcome";
  //     setTxError(errorMessage);
  //     console.error("Finalize error:", err);
  //   }
  // };

  const renderOracleActions = () => {
    switch (market.oracleStatus) {
      case "CLOSED":
        return (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              This market is closed and open for outcome proposal. Anyone can
              propose an outcome by posting the proposer bond.
            </p>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Proposed Outcome</Label>
                <div className="flex gap-2 mt-2">
                  {(["YES", "NO"] as const).map((outcome) => (
                    <Button
                      key={outcome}
                      variant={selectedOutcome === outcome ? "default" : "outline"}
                      onClick={() => setSelectedOutcome(outcome)}
                      className="flex-1"
                      disabled={isPending || isConfirming}
                    >
                      {outcome}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="bond-amount" className="text-xs">
                  Proposer Bond (ETH)
                </Label>
                <Input
                  id="bond-amount"
                  type="number"
                  step="0.01"
                  value={bondAmount}
                  onChange={(e) => setBondAmount(e.target.value)}
                  disabled={isPending || isConfirming}
                  className="mt-1 text-sm"
                  placeholder={weiToEth(config.proposerBondWei)}
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Required: {weiToEth(config.proposerBondWei)} ETH
                </p>
              </div>

              <Button
                onClick={handleProposeOutcome}
                disabled={isPending || isConfirming || !userAddress}
                className="w-full"
              >
                {isPending || isConfirming ? (
                  <>
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    Proposing...
                  </>
                ) : (
                  "Propose Outcome"
                )}
              </Button>
            </div>
          </div>
        );

      case "DISPUTED":
        return (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              This outcome has been disputed. Only authorized resolvers can
              resolve the dispute by determining the correct outcome.
            </p>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Final Outcome</Label>
                <div className="flex gap-2 mt-2">
                  {(["YES", "NO"] as const).map((outcome) => (
                    <Button
                      key={outcome}
                      variant={selectedOutcome === outcome ? "default" : "outline"}
                      onClick={() => setSelectedOutcome(outcome)}
                      className="flex-1"
                      disabled={isPending || isConfirming}
                    >
                      {outcome}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs">Resolution Decision</Label>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant={
                      resolveDecision === "correct" ? "default" : "outline"
                    }
                    onClick={() => setResolveDecision("correct")}
                    className="flex-1"
                    disabled={isPending || isConfirming}
                  >
                    Proposer Correct
                  </Button>
                  <Button
                    variant={
                      resolveDecision === "incorrect" ? "default" : "outline"
                    }
                    onClick={() => setResolveDecision("incorrect")}
                    className="flex-1"
                    disabled={isPending || isConfirming}
                  >
                    Disputer Correct
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleResolveOutcome}
                disabled={isPending || isConfirming || !userAddress}
                className="w-full"
              >
                {isPending || isConfirming ? (
                  <>
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    Resolving...
                  </>
                ) : (
                  "Resolve Dispute"
                )}
              </Button>
            </div>
          </div>
        );

      case "RESOLVED":
        return (
          <div className="space-y-3 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-sm text-emerald-900 dark:text-emerald-100">
                  Outcome Resolved
                </h4>
                <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1">
                  This market&apos;s outcome has been finalized. The outcome is:{" "}
                  <span className="font-semibold">
                    {market.latestOracleEvent?.finalized || "Pending"}
                  </span>
                </p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between w-full">
            <div className="flex-1">
              <DialogTitle className="text-lg">{market.title || market.id}</DialogTitle>
              <DialogDescription className="text-xs mt-1">
                {market.description}
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-6 w-6"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Market Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Market Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-zinc-500">Category</Label>
                  <p className="text-sm font-medium mt-1">{market.category}</p>
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Creator</Label>
                  <p className="text-sm font-medium font-mono mt-1">
                    {formatAddress(market.creator)}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Total Volume</Label>
                  <p className="text-sm font-medium mt-1">
                    {formatEth(market.collateral, 2)} ETH
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Time Remaining</Label>
                  <p className="text-sm font-medium mt-1">{timeRemaining}</p>
                </div>
                {market.resolutionSource && (
                  <div className="col-span-2">
                    <Label className="text-xs text-zinc-500">
                      Resolution Source
                    </Label>
                    <p className="text-sm font-medium mt-1">
                      {market.resolutionSource}
                    </p>
                  </div>
                )}
              </div>

              {/* Probability Visualization */}
              <div className="pt-2 border-t">
                <Label className="text-xs text-zinc-500">Market Probabilities</Label>
                <div className="mt-2 space-y-2">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium">YES</span>
                      <span className="text-xs font-bold">
                        {yesPercent}%
                      </span>
                    </div>
                    <Progress
                      value={Number(yesPercent)}
                      className="h-2"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium">NO</span>
                      <span className="text-xs font-bold">
                        {noPercent}%
                      </span>
                    </div>
                    <Progress
                      value={Number(noPercent)}
                      className="h-2"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Oracle Event Details */}
          {market.latestOracleEvent && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Oracle Event</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-zinc-500">Proposer</Label>
                    <p className="text-sm font-medium font-mono mt-1">
                      {formatAddress(market.latestOracleEvent.proposer)}
                    </p>
                  </div>
                  {market.latestOracleEvent.disputer && (
                    <div>
                      <Label className="text-xs text-zinc-500">Disputer</Label>
                      <p className="text-sm font-medium font-mono mt-1">
                        {formatAddress(market.latestOracleEvent.disputer)}
                      </p>
                    </div>
                  )}
                  <div>
                    <Label className="text-xs text-zinc-500">
                      Proposed Outcome
                    </Label>
                    <p className="text-sm font-medium mt-1">
                      {market.latestOracleEvent.proposed}
                    </p>
                  </div>
                  {market.latestOracleEvent.finalized && (
                    <div>
                      <Label className="text-xs text-zinc-500">
                        Final Outcome
                      </Label>
                      <p className="text-sm font-medium mt-1">
                        {market.latestOracleEvent.finalized}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Oracle Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Oracle Actions</CardTitle>
            </CardHeader>
            <CardContent>{renderOracleActions()}</CardContent>
          </Card>

          {/* Transaction Status */}
          {txStatus !== "idle" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {txStatus === "pending" || isConfirming ? (
                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 flex items-start gap-3">
                  <Loader className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 animate-spin flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-sm text-blue-900 dark:text-blue-100">
                      Transaction Pending
                    </h4>
                    <p className="text-xs text-blue-800 dark:text-blue-300 mt-1">
                      {txHash && (
                        <a
                          href={`https://etherscan.io/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline flex items-center gap-1"
                        >
                          View on Etherscan
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </p>
                  </div>
                </div>
              ) : txStatus === "success" ? (
                <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-sm text-emerald-900 dark:text-emerald-100">
                      Transaction Successful
                    </h4>
                    <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1">
                      {txHash && (
                        <a
                          href={`https://etherscan.io/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline flex items-center gap-1"
                        >
                          View on Etherscan
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </p>
                  </div>
                </div>
              ) : txStatus === "error" ? (
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-sm text-red-900 dark:text-red-100">
                      Transaction Failed
                    </h4>
                    <p className="text-xs text-red-800 dark:text-red-300 mt-1">
                      {txError}
                    </p>
                  </div>
                </div>
              ) : null}
            </motion.div>
          )}

          {/* Info Box */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Oracle Parameters</CardTitle>
              <CardDescription className="text-xs">
                Key parameters for this oracle resolution process
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-zinc-500">Proposer Bond</Label>
                  <p className="text-sm font-semibold mt-1 font-mono">
                    {weiToEth(config.proposerBondWei)} ETH
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Disputer Bond</Label>
                  <p className="text-sm font-semibold mt-1 font-mono">
                    {weiToEth(config.disputerBondWei)} ETH
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Dispute Window</Label>
                  <p className="text-sm font-semibold mt-1">
                    {formatSeconds(config.disputeWindowSeconds)}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Resolution Deadline</Label>
                  <p className="text-sm font-semibold mt-1">
                    {formatSeconds(config.resolutionDeadlineSeconds)}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Proposer Bounty</Label>
                  <p className="text-sm font-semibold mt-1 font-mono">
                    {weiToEth(config.proposerBountyWei)} ETH
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-sm text-amber-900 dark:text-amber-100">
                Important
              </h4>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                Ensure you have sufficient ETH for the required bond amount and
                gas fees before proceeding.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
