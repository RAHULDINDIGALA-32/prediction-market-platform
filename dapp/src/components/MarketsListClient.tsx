"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MarketCard from "@/components/MarketCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";

type MarketStatus = "OPEN" | "CLOSED" | "RESOLVED" | "SETTLED";

interface Market {
  id: string;
  status: MarketStatus;
  qYes: any;
  qNo: any;
  collateral: any;
  contractAddress?: string | null;
  createdAt: Date;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  ipfsCid?: string | null;
  endTime?: Date | number | bigint | null;
}

interface Props {
  initialMarkets: Market[];
}

type CategoryOption = "all" | "crypto" | "politics" | "sports" | "economics" | "other";

export default function MarketsListClient({ initialMarkets }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<MarketStatus | "all">("all");
  const [sortBy, setSortBy] = useState<CategoryOption>("all");
  const [isLoading, setIsLoading] = useState(false);

  const filteredAndSorted = useMemo(() => {
    let filtered = [...initialMarkets];

    // Filter by status
    if (statusFilter !== "all") {
      filtered = filtered.filter((m) => m.status === statusFilter);
    }

    // Filter by search (market ID or contract address)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.id.toLowerCase().includes(query) ||
          m.contractAddress?.toLowerCase().includes(query) ||
          m.title?.toLowerCase().includes(query)
      );
    }

    // Sort by category
    if (sortBy === "all") {
      filtered = filtered;
    }else if (sortBy === "crypto") {
      filtered = filtered.filter((m) => m.category === "crypto");
    } else if (sortBy === "politics") {
      filtered = filtered.filter((m) => m.category === "politics");
    } else if (sortBy === "sports") {
      filtered = filtered.filter((m) => m.category === "sports");
    } else if (sortBy === "economics") {
      filtered = filtered.filter((m) => m.category === "economics");
    } else if (sortBy === "other") {
      filtered = filtered.filter((m) => m.category === "other");
    }


    return filtered;
  }, [initialMarkets, statusFilter, searchQuery, sortBy]);

  if (initialMarkets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No markets found. Once markets are created and synced, they will appear here for trading.
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
            placeholder="Search markets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as MarketStatus | "all")}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
              <SelectItem value="RESOLVED">Resolved</SelectItem>
              <SelectItem value="SETTLED">Settled</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as CategoryOption)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort by" />
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
      ) : filteredAndSorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No markets match your filters.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filteredAndSorted.map((market) => (
              <MarketCard
                key={market.id}
                market={market}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}


