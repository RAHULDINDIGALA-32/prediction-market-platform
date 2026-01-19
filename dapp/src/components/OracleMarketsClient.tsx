"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import { Search, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  useOracleMarkets,
  OracleMarketStatus,
  OracleMarket,
} from "@/hooks/useOracleMarkets";
import MarketOracleCard from "@/components/MarketOracleCard";
import OracleMarketDetailModal from "./OracleMarketDetailModal";

type CategoryOption = "all" | "crypto" | "politics" | "sports" | "economics" | "other";

export default function OracleMarketsClient() {
  const { address } = useAccount();
  const [searchQuery, setSearchQuery] = useState("");
  const [oracleStatusFilter, setOracleStatusFilter] = useState<
    OracleMarketStatus | "all"
  >("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryOption>("all");
  const [selectedMarket, setSelectedMarket] = useState<OracleMarket | null>(
    null
  );

  // Fetch markets
  const { markets, isLoading, error } = useOracleMarkets(
    oracleStatusFilter === "all" ? undefined : oracleStatusFilter,
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
          No markets available for oracle operations. Markets appear here once
          they are closed and ready for outcome proposal.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters and Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search markets by title, category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex gap-3">
          <Select
            value={oracleStatusFilter}
            onValueChange={(v) => setOracleStatusFilter(v as OracleMarketStatus | "all")}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Oracle Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
              <SelectItem value="DISPUTED">Disputed</SelectItem>
              <SelectItem value="RESOLVED">Resolved</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={categoryFilter}
            onValueChange={(v) => setCategoryFilter(v as CategoryOption)}
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
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : filteredMarkets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No markets match your filters.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filteredMarkets.map((market) => (
              <MarketOracleCard
                key={market.id}
                market={market}
                onSelect={setSelectedMarket}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Market Detail Modal */}
      <AnimatePresence>
        {selectedMarket && (
          <OracleMarketDetailModal
            market={selectedMarket}
            onClose={() => setSelectedMarket(null)}
            userAddress={address}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
