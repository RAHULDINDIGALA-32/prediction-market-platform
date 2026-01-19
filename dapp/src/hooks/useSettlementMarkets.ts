import { useEffect, useState } from "react";

export type SettlementStatus = "RESOLVED" | "SETTLED";

export interface OracleEvent {
  proposer: string;
  disputed: boolean;
  disputer: string | null;
  proposed: string; // YES or NO
  finalized: string | null; // YES or NO if finalized
  finalizedAt: Date;
}

export interface SettlementMarket {
  id: string;
  contractAddress: string | null;
  status: string;
  title: string | null;
  description: string | null;
  category: string | null;
  createdAt: Date;
  endTime: bigint | null;
  qYes: number;
  qNo: number;
  creator: string;
  settlementStatus: SettlementStatus;
  resolvedAt: number;
  redemptionEndsAt: number;
  latestOracleEvent: OracleEvent | null;
}

interface UseSettlementMarketsResult {
  markets: SettlementMarket[];
  isLoading: boolean;
  error: string | null;
}

export function useSettlementMarkets(
  status?: SettlementStatus,
  category?: string,
  searchQuery?: string
): UseSettlementMarketsResult {
  const [markets, setMarkets] = useState<SettlementMarket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMarkets = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (status) params.append("status", status);
        if (category) params.append("category", category);
        if (searchQuery) params.append("search", searchQuery);

        const response = await fetch(`/api/settlement/markets?${params.toString()}`);
        if (!response.ok) {
          throw new Error("Failed to fetch settlement markets");
        }

        const data = await response.json();
        setMarkets(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchMarkets();
  }, [status, category, searchQuery]);

  return { markets, isLoading, error };
}
