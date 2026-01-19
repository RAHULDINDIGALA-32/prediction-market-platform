/**
 * @description Hook for fetching markets with oracle status
 */

import { useEffect, useState } from "react";

export type OracleMarketStatus = "CLOSED" | "DISPUTED" | "RESOLVED";

export interface OracleEvent {
  id: string;
  marketId: string;
  proposer: string;
  disputer: string | null;
  proposed: string; // YES or NO
  finalized: string | null;
  disputedAt: Date | null;
  finalizedAt: Date;
  createdAt: Date;
}

export interface OracleMarket {
  id: string;
  contractAddress: string | null;
  status: string;
  title: string | null;
  description: string | null;
  category: string | null;
  resolutionSource: string | null;
  ipfsCid: string | null;
  creator: string;
  createdAt: Date;
  endTime: string | null;
  qYes: string;
  qNo: string;
  collateral: string;
  version: number;
  oracleStatus: OracleMarketStatus;
  latestOracleEvent: OracleEvent | null;
}

export function useOracleMarkets(
  oracleStatus?: OracleMarketStatus,
  category?: string,
  searchQuery?: string
) {
  const [markets, setMarkets] = useState<OracleMarket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMarkets() {
      try {
        setIsLoading(true);
        const params = new URLSearchParams();

        if (oracleStatus) params.append("status", oracleStatus);
        if (category) params.append("category", category);
        if (searchQuery) params.append("search", searchQuery);

        const response = await fetch(`/api/oracle/markets?${params}`);
        if (!response.ok) throw new Error("Failed to fetch markets");

        const data = await response.json();
        setMarkets(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setMarkets([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchMarkets();
  }, [oracleStatus, category, searchQuery]);

  return { markets, isLoading, error };
}
