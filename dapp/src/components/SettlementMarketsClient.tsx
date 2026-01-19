"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import { Search, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  useSettlementMarkets,
  SettlementStatus,
  SettlementMarket,
} from "@/hooks/useSettlementMarkets";
import SettlementMarketCard from "@/components/SettlementMarketCard";
import SettlementMarketDetailModal from "./SettlementMarketDetailModal";

type CategoryOption = "all" | "crypto" | "politics" | "sports" | "economics" | "other";

export default function SettlementMarketsClient() {
  const { address } = useAccount();
  const [searchQuery, setSearchQuery] = useState("");
  const [settlementStatusFilter, setSettlementStatusFilter] = useState<
    SettlementStatus | "all"
  >("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryOption>("all");
  const [selectedMarket, setSelectedMarket] = useState<SettlementMarket | null>(
    null
  );

  // Fetch markets
  const { markets, isLoading, error } = useSettlementMarkets(
    settlementStatusFilter === "all" ? undefined : settlementStatusFilter,
    categoryFilter === "all" ? undefined : categoryFilter,
    searchQuery || undefined
  );

  // Filter by search (local filtering on top of API filtering)
  const filteredMarkets = useMemo(() => {
    return markets.filter((market) => {
      const query = searchQuery.toLowerCase();
      return (
        market.id.toLowerCase().includes(query) ||
        market.contractAddress?.toLowerCase().includes(query) ||
        market.title?.toLowerCase().includes(query) ||
        market.description?.toLowerCase().includes(query)
      );
    });
  }, [markets, searchQuery]);

  if (error) {
    return (
      <div className="rounded-lg border border-dashed border-red-300 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-950/30">
        <p className="text-sm text-red-600 dark:text-red-400">
          Error loading markets: {error}
        </p>
      </div>
    );
  }

  if (markets.length === 0 && !isLoading) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No markets available for redemption. Markets appear here once they are resolved and in the settlement phase.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Settlement & Redemption</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Redeem winning tokens and settle market positions
        </p>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search markets by title, category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-3">
          <Select
            value={settlementStatusFilter}
            onValueChange={(value) => setSettlementStatusFilter(value as SettlementStatus | "all")}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="RESOLVED">Redemption Open</SelectItem>
              <SelectItem value="SETTLED">Settlement Closed</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={categoryFilter}
            onValueChange={(value) => setCategoryFilter(value as CategoryOption)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="crypto">Crypto</SelectItem>
              <SelectItem value="politics">Politics</SelectItem>
              <SelectItem value="sports">Sports</SelectItem>
              <SelectItem value="economics">Economics</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Markets Grid */}
      <div>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        ) : filteredMarkets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No markets match your search filters
            </p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
          >
            <AnimatePresence mode="popLayout">
              {filteredMarkets.map((market) => (
                <motion.div
                  key={market.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                >
                  <SettlementMarketCard
                    market={market}
                    onClick={() => setSelectedMarket(market)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {selectedMarket && (
          <SettlementMarketDetailModal
            market={selectedMarket}
            onClose={() => setSelectedMarket(null)}
            userAddress={address}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
