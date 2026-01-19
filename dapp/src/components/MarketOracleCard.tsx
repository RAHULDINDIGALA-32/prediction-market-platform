"use client";

import React from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  calculateProbability,
  formatEth,
  formatTimeRemaining,
} from "@/lib/utils";
import {
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";
import { OracleMarket, OracleMarketStatus } from "@/hooks/useOracleMarkets";

interface Props {
  market: OracleMarket;
  onSelect: (market: OracleMarket) => void;
}

const oracleStatusConfig: Record<
  OracleMarketStatus,
  {
    label: string;
    color: string;
    icon: React.ReactNode;
    description: string;
  }
> = {
  CLOSED: {
    label: "CLOSED",
    color: "bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300",
    icon: <Clock className="h-4 w-4" />,
    description: "Ready for outcome proposal",
  },
  DISPUTED: {
    label: "DISPUTED",
    color:
      "bg-rose-500/10 border-rose-500/40 text-rose-700 dark:text-rose-300",
    icon: <AlertTriangle className="h-4 w-4" />,
    description: "Awaiting resolver decision",
  },
  RESOLVED: {
    label: "RESOLVED",
    color:
      "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
    icon: <CheckCircle className="h-4 w-4" />,
    description: "Outcome finalized",
  },
};

export default function MarketOracleCard({ market, onSelect }: Props) {
  const probabilities = calculateProbability(market.qYes, market.qNo);
  const config = oracleStatusConfig[market.oracleStatus];
  const yesPercent = (probabilities.yes * 100).toFixed(1);
  const noPercent = (probabilities.no * 100).toFixed(1);

  const timeRemaining = market.endTime
    ? formatTimeRemaining(Number(market.endTime) * 1000)
    : "Unknown";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={() => onSelect(market)}
      className="cursor-pointer"
    >
      <Card className="group overflow-hidden transition-all hover:shadow-lg dark:hover:shadow-lg/20">
        <CardContent className="p-4">
          {/* Header with Status Badge */}
          <div className="mb-3 flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 line-clamp-2">
                {market.title || market.id}
              </h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">
                {market.category}
              </p>
            </div>
            <Badge
              className={`ml-2 flex items-center gap-1 whitespace-nowrap border ${config.color}`}
              variant="outline"
            >
              {config.icon}
              {config.label}
            </Badge>
          </div>

          {/* Description */}
          <p className="mb-3 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
            {market.description}
          </p>

          {/* Oracle Event Info */}
          {market.latestOracleEvent && (
            <div className="mb-3 rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900/50">
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Proposer:
                  </span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100">
                    {market.latestOracleEvent.proposer.slice(0, 6)}...
                    {market.latestOracleEvent.proposer.slice(-4)}
                  </span>
                </div>
                {market.latestOracleEvent.disputer && (
                  <div className="flex justify-between">
                    <span className="text-zinc-600 dark:text-zinc-400">
                      Disputer:
                    </span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-100">
                      {market.latestOracleEvent.disputer.slice(0, 6)}...
                      {market.latestOracleEvent.disputer.slice(-4)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Probability Bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                YES / NO Probability
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Progress
                value={Number(yesPercent)}
                className="flex-1 h-2"
              />
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-50 min-w-12">
                {yesPercent}% / {noPercent}%
              </span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400">
              <TrendingUp className="h-3 w-3" />
              <span>
                Vol: <span className="font-semibold">{formatEth(market.collateral, 2)} ETH</span>
              </span>
            </div>
            <div className="flex items-center gap-1 text-zinc-600 dark:text-zinc-400">
              <Clock className="h-3 w-3" />
              <span>{timeRemaining}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
