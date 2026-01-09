"use client";

import { useAccount } from "wagmi";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatEth, formatAddress } from "@/lib/utils";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

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
] as const;

const ORACLE_ABI = [
  {
    type: "function",
    name: "getFinalOutcome",
    stateMutability: "view",
    inputs: [{ name: "market", type: "address" }],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "isFinalized",
    stateMutability: "view",
    inputs: [{ name: "market", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

interface Market {
  id: string;
  status: string;
  contractAddress?: string | null;
}

interface Props {
  market?: Market;
}

export default function SettlementClient({ market }: Props) {
  const { address, isConnected } = useAccount();
  const [redeemAmount, setRedeemAmount] = useState("");
  const marketAddress = market?.contractAddress as `0x${string}` | undefined;

  const { data: marketInfo } = useReadContract({
    address: marketAddress,
    abi: MARKET_ABI,
    functionName: "getMarketInfo",
    query: {
      enabled: !!marketAddress,
    },
  });


  const marketState = marketInfo?.[0];
  const yesToken = marketInfo?.[2] as `0x${string}` | undefined;
  const noToken = marketInfo?.[3] as `0x${string}` | undefined;
  const winningToken = marketState === 2 ? (yesToken || noToken) : undefined;

  const { data: balance } = useReadContract({
    address: winningToken,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!winningToken && !!address,
    },
  });

  const { writeContractAsync, isPending: isWriting } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: undefined,
  });

  const handleRedeem = async () => {
    if (!marketAddress || !redeemAmount || !address) return;

    try {
      // We need the settlement engine address - this should come from env or config
      const settlementEngine = process.env.NEXT_PUBLIC_SETTLEMENT_ENGINE_ADDRESS as `0x${string}`;
      
      await writeContractAsync({
        address: settlementEngine,
        abi: SETTLEMENT_ENGINE_ABI,
        functionName: "redeem",
        args: [marketAddress, BigInt(redeemAmount)],
      });
    } catch (error: any) {
      console.error("Redemption failed:", error);
    }
  };

  if (!isConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Settlement & Redemption</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Redeem winning outcome tokens after market settlement
          </p>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              Connect your wallet to redeem tokens
            </p>
            <ConnectButton />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Settlement & Redemption</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Redeem winning outcome tokens after market settlement
          </p>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Select a market to view redemption options
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isSettled = market.status === "SETTLED";
  const hasBalance = balance && balance > 0n;
  const redeemableAmount = balance ? formatEth(balance, 4) : "0 ETH";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Settlement & Redemption</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Redeem winning outcome tokens after market settlement
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Market #{market.id.slice(0, 8)}</CardTitle>
              <CardDescription>
                {market.contractAddress ? formatAddress(market.contractAddress) : "Not deployed"}
              </CardDescription>
            </div>
            <Badge variant={isSettled ? "success" : "warning"}>
              {market.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isSettled ? (
            <div className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200">
              <AlertTriangle className="h-4 w-4" />
              <span>Market must be settled before redemption</span>
            </div>
          ) : !hasBalance ? (
            <div className="flex items-center gap-2 rounded-lg bg-zinc-50 border border-zinc-200 p-4 text-sm text-zinc-600 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400">
              <AlertTriangle className="h-4 w-4" />
              <span>No winning tokens to redeem</span>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-semibold text-emerald-900 dark:text-emerald-100">
                    You hold {redeemableAmount} winning tokens
                  </span>
                </div>
                <div className="text-sm text-emerald-700 dark:text-emerald-300">
                  Each token redeems for 1 ETH
                </div>
              </div>

              <div>
                <Label htmlFor="redeemAmount">Amount to redeem</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="redeemAmount"
                    type="number"
                    value={redeemAmount}
                    onChange={(e) => setRedeemAmount(e.target.value)}
                    placeholder={redeemableAmount.replace(" ETH", "")}
                    max={redeemableAmount.replace(" ETH", "")}
                    min="0"
                    step="0.1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRedeemAmount(redeemableAmount.replace(" ETH", ""))}
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
                      <span className="font-semibold">{formatEth(BigInt(redeemAmount) * BigInt(1e18), 4)}</span>
                    </div>
                  </div>
                </motion.div>
              )}

              <Button
                onClick={handleRedeem}
                disabled={!redeemAmount || Number(redeemAmount) <= 0 || isWriting || isConfirming}
                className="w-full"
              >
                {isWriting || isConfirming ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Redeem"
                )}
              </Button>

              {isConfirmed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-200"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Redemption successful!</span>
                </motion.div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


