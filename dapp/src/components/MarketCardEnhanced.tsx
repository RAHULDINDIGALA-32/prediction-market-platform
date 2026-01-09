"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { calculateProbability, formatEth, formatTimeRemaining } from "@/lib/utils";
import { ArrowRight, Clock } from "lucide-react";

type MarketStatus = "OPEN" | "LOCKED" | "RESOLVED" | "SETTLED";

interface Market {
  id: string;
  status: MarketStatus;
  qYes: string | bigint;
  qNo: string | bigint;
  collateral: string | bigint;
  contractAddress?: string;
  createdAt: Date;
  endTime?: Date | number;
}

interface Props {
  market: Market;
}

const statusConfig: Record<MarketStatus, { label: string; variant: "default" | "secondary" | "success" | "warning" }> = {
  OPEN: { label: "OPEN", variant: "success" },
  LOCKED: { label: "LOCKED", variant: "warning" },
  RESOLVED: { label: "RESOLVED", variant: "secondary" },
  SETTLED: { label: "SETTLED", variant: "default" },
};

export default function MarketCardEnhanced({ market }: Props) {
  const probabilities = calculateProbability(market.qYes, market.qNo);
  const statusInfo = statusConfig[market.status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="overflow-hidden transition-all hover:shadow-lg">
        <CardContent className="p-0">
          <div className="p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold mb-2 line-clamp-2">
                  Market #{market.id.slice(0, 8)}
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
                  Binary prediction market with YES/NO outcomes
                </p>
              </div>
              <Badge variant={statusInfo.variant}>
                {statusInfo.label}
              </Badge>
            </div>

            {/* Probability Bars */}
            <div className="space-y-3 mb-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    YES
                  </span>
                  <span className="text-sm font-semibold">
                    {Math.round(probabilities.yes * 100)}%
                  </span>
                </div>
                <Progress 
                  value={probabilities.yes * 100} 
                  className="h-2 bg-zinc-200 dark:bg-zinc-800"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-red-600 dark:text-red-400">
                    NO
                  </span>
                  <span className="text-sm font-semibold">
                    {Math.round(probabilities.no * 100)}%
                  </span>
                </div>
                <Progress 
                  value={probabilities.no * 100} 
                  className="h-2 bg-zinc-200 dark:bg-zinc-800"
                />
              </div>
            </div>

            {/* Market Stats */}
            <div className="grid grid-cols-2 gap-4 mb-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
              <div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                  Volume
                </div>
                <div className="text-sm font-semibold">
                  {formatEth(market.collateral, 2)}
                </div>
              </div>
              {market.endTime && (
                <div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Ends in
                  </div>
                  <div className="text-sm font-semibold">
                    {formatTimeRemaining(market.endTime)}
                  </div>
                </div>
              )}
            </div>

            {/* Action Button */}
            <Link href={`/markets/${market.id}`}>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-center gap-2 w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-50 transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200">
                  <span>Trade</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              </motion.div>
            </Link>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
