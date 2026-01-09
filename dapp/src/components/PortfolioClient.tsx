"use client";

import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEth, formatAddress, calculateProbability } from "@/lib/utils";
import { useReadContracts } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Loader2, TrendingUp, TrendingDown } from "lucide-react";
import Link from "next/link";

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
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

async function getUserMarkets(address: string) {
  const res = await fetch(`/api/portfolio?address=${address}`);
  if (!res.ok) return [];
  return res.json();
}

export default function PortfolioClient() {
  const { address, isConnected } = useAccount();

  const { data: markets, isLoading } = useQuery({
    queryKey: ["portfolio", address],
    queryFn: () => getUserMarkets(address!),
    enabled: !!address && isConnected,
  });

  if (!isConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Portfolio</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            View your active positions and trading history
          </p>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              Connect your wallet to view your portfolio
            </p>
            <ConnectButton />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Portfolio</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            View your active positions and trading history
          </p>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-zinc-400" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!markets || markets.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Portfolio</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            View your active positions and trading history
          </p>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No active positions found
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Portfolio</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          View your active positions and trading history
        </p>
      </div>

      <div className="space-y-4">
        {markets.map((market: any) => (
          <PositionCard key={market.id} market={market} userAddress={address!} />
        ))}
      </div>
    </div>
  );
}

function PositionCard({ market, userAddress }: { market: any; userAddress: string }) {
  const marketAddress = market.contractAddress as `0x${string}` | undefined;

  const { data: marketInfo } = useReadContracts({
    contracts: marketAddress
      ? [
          {
            address: marketAddress,
            abi: MARKET_ABI,
            functionName: "getMarketInfo" as const,
          },
        ]
      : [],
  });

  // marketInfo result is a tuple: [state, endTime, yesToken, noToken, vault, isExpired, isClosed]
  const marketInfoResult = marketInfo?.[0]?.result;
  const yesToken = marketInfoResult?.[2] as `0x${string}` | undefined;
  const noToken = marketInfoResult?.[3] as `0x${string}` | undefined;

  const { data: balances } = useReadContracts({
    contracts: [
      {
        address: yesToken!,
        abi: ERC20_ABI,
        functionName: "balanceOf" as const,
        args: [userAddress as `0x${string}`],
      },
      {
        address: noToken!,
        abi: ERC20_ABI,
        functionName: "balanceOf" as const,
        args: [userAddress as `0x${string}`],
      },
    ].filter((c) => c.address),
  });

  const yesBalance = balances?.[0]?.result ?? 0n;
  const noBalance = balances?.[1]?.result ?? 0n;

  const hasPosition = yesBalance > 0n || noBalance > 0n;

  if (!hasPosition) return null;

  const probabilities = calculateProbability(market.qYes, market.qNo);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">Market #{market.id.slice(0, 8)}</CardTitle>
            <CardDescription>Binary prediction market</CardDescription>
          </div>
          <Badge variant={market.status === "OPEN" ? "success" : "secondary"}>
            {market.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Positions */}
          <div className="grid grid-cols-2 gap-4">
            {yesBalance > 0n && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-900/20">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                    YES Position
                  </span>
                </div>
                <div className="text-lg font-bold text-emerald-900 dark:text-emerald-100">
                  {formatEth(yesBalance, 4)}
                </div>
                <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                  Implied entry: {Math.round(probabilities.yes * 100)}%
                </div>
              </div>
            )}
            {noBalance > 0n && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-semibold text-red-900 dark:text-red-100">
                    NO Position
                  </span>
                </div>
                <div className="text-lg font-bold text-red-900 dark:text-red-100">
                  {formatEth(noBalance, 4)}
                </div>
                <div className="text-xs text-red-700 dark:text-red-300 mt-1">
                  Implied entry: {Math.round(probabilities.no * 100)}%
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <Link href={`/markets/${market.id}`} className="flex-1">
              <Button variant="outline" className="w-full">
                View Market
              </Button>
            </Link>
            {market.status === "SETTLED" && (
              <Link href={`/settlement?market=${market.id}`} className="flex-1">
                <Button className="w-full">Redeem</Button>
              </Link>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

