"use client";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatEth } from "@/lib/utils";
import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

interface Quote {
  quote: {
    trader: string;
    market: string;
    outcome: number;
    amount: string;
    cost: string;
    deadline: number;
    nonce: string;
    isSell: boolean;
    minAmountOut?: string;
    minReturn?: string;
  };
  signature: string;
}

interface Props {
  quote: Quote;
  side: "YES" | "NO";
  amount: string;
  isSell: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
}

export default function TradeConfirmationModal({
  quote,
  side,
  amount,
  isSell,
  onConfirm,
  onCancel,
  isPending = false,
}: Props) {
  const deadline = new Date(quote.quote.deadline * 1000);
  const timeUntilExpiry = deadline.getTime() - Date.now();
  const secondsRemaining = Math.max(0, Math.floor(timeUntilExpiry / 1000));

  const maxLoss = isSell ? formatEth(quote.quote.amount, 4) : formatEth(quote.quote.cost, 4);

  return (
    <Dialog open={true} onOpenChange={onCancel}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Trade</DialogTitle>
          <DialogDescription>
            Review your trade details before confirming
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Trade Summary */}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 space-y-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Side</span>
              <span className="text-sm font-semibold">{side}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Action</span>
              <span className="text-sm font-semibold">{isSell ? "Sell" : "Buy"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Tokens {isSell ? "Sold" : "Received"}</span>
              <span className="text-sm font-semibold">{amount} {side}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{isSell ? "ETH Received" : "ETH Cost"}</span>
              <span className="text-sm font-semibold">{formatEth(quote.quote.cost, 4)}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Max {isSell ? "Gain" : "Loss"}</span>
              <span className="text-sm font-semibold">{maxLoss}</span>
            </div>
          </div>

          {/* Settlement Rule */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="flex-1">
                <div className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-1">
                  Settlement Rule
                </div>
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  Winning tokens redeem for 1 ETH each after oracle resolution. Losing tokens have no value.
                </div>
              </div>
            </div>
          </div>

          {/* Quote Expiry Warning */}
          {secondsRemaining < 30 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200"
            >
              <AlertTriangle className="h-4 w-4" />
              <span>Quote expires in {secondsRemaining}s</span>
            </motion.div>
          )}

          {/* Slippage Protection Info */}
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <Clock className="h-3 w-3" />
            <span>
              This quote is valid for {Math.floor(secondsRemaining / 60)}m {secondsRemaining % 60}s
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isPending || secondsRemaining <= 0}>
            {isPending ? "Processing..." : "Confirm Trade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


