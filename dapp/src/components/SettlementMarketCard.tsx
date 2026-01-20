"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatAddress, calculateProbability, formatTimeRemaining } from "@/lib/utils";
import { SettlementMarket } from "@/hooks/useSettlementMarkets";
import { CheckCircle2, Clock, TrendingUp } from "lucide-react";

interface Props {
  market: SettlementMarket;
  onClick: () => void;
}

export default function SettlementMarketCard({ market, onClick }: Props) {
  const isSettled = market.settlementStatus === "SETTLED";

  // Calculate probability for YES/NO
  const probabilities = calculateProbability(BigInt(market.qYes), BigInt(market.qNo));
  const yesPercent = (probabilities.yes * 100).toFixed(1);
  const noPercent = (probabilities.no * 100).toFixed(1);

  // Time remaining until redemption ends (for RESOLVED markets)
  const timeRemaining = market.endTime ? formatTimeRemaining(Number(market.endTime) * 1000) : "N/A";

  const statusConfig = {
    RESOLVED: {
      color: "bg-emerald-50 dark:bg-emerald-900/20",
      textColor: "text-emerald-700 dark:text-emerald-300",
      borderColor: "border-emerald-200 dark:border-emerald-800",
      badge: "success" as const,
      label: "Redemption Open",
    },
    SETTLED: {
      color: "bg-blue-50 dark:bg-blue-900/20",
      textColor: "text-blue-700 dark:text-blue-300",
      borderColor: "border-blue-200 dark:border-blue-800",
      badge: "default" as const,
      label: "Settlement Closed",
    },
  };

  const config = statusConfig[market.settlementStatus];

  return (
    <Card
      onClick={onClick}
      className="cursor-pointer transition-all hover:shadow-lg hover:border-zinc-400 dark:hover:border-zinc-600"
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <CardTitle className="line-clamp-2 text-lg">{market.title || "Untitled Market"}</CardTitle>
            <CardDescription className="mt-1">
              {market.contractAddress ? formatAddress(market.contractAddress) : "Not deployed"}
            </CardDescription>
          </div>
          <Badge variant={config.badge}>{config.label}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Market Details */}
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between text-zinc-600 dark:text-zinc-400">
            <span className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Category
            </span>
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {market.category ? market.category.charAt(0).toUpperCase() + market.category.slice(1) : "Other"}
            </span>
          </div>
        </div>

        {/* Probability Visualization */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Probability</span>
            <div className="flex gap-3">
              <span className="font-semibold text-blue-600 dark:text-blue-400">YES {yesPercent}%</span>
              <span className="font-semibold text-pink-600 dark:text-pink-400">NO {noPercent}%</span>
            </div>
          </div>
          <Progress value={parseFloat(yesPercent)} className="h-2" />
        </div>

        {/* Oracle Event Info */}
        {market.latestOracleEvent && (
          <div className={`rounded-lg border ${config.borderColor} ${config.color} p-3 text-sm`}>
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                <span>Resolved: {market.latestOracleEvent.finalized === "YES" ? "YES" : "NO"}</span>
              </div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400">
                by {formatAddress(market.latestOracleEvent.proposer)}
              </div>
            </div>
          </div>
        )}

        {/* Settlement Status Info */}
        <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {isSettled ? "Settlement Closed" : "Redemption Ends Soon"}
          </span>
          <span className="font-mono">{timeRemaining}</span>
        </div>
      </CardContent>
    </Card>
  );
}
