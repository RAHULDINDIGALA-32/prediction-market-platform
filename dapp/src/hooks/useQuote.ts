import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";

export interface Quote {
  quote: {
    trader: string;
    market: string;
    marketId: string;
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
  quoteHash?: string;
}

interface QuoteRequest {
  marketId: string;
  trader: string;
  side: "YES" | "NO";
  amount: string;
  isSell?: boolean;
}

export function useQuote(request: QuoteRequest | null) {
  const { address } = useAccount();
  const [expiryTime, setExpiryTime] = useState<number | null>(null);

  const { data, error, isLoading, refetch } = useQuery<Quote>({
    queryKey: ["quote", request],
    queryFn: async () => {
      if (!request || !address) throw new Error("Missing request or address");

      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...request,
          trader: address,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch quote");
      }

      const quoteData = await res.json();
      
      // Set expiry time (deadline - 5 seconds buffer)
      if (quoteData.quote?.deadline) {
        setExpiryTime(quoteData.quote.deadline * 1000 - 5000);
      }

      return quoteData;
    },
    enabled: !!request && !!address,
    staleTime: 0, // Always consider stale
    gcTime: 0, // Don't cache
  });

  // Auto-refresh quote when it's about to expire
  useEffect(() => {
    if (!expiryTime) return;

    const timeUntilExpiry = expiryTime - Date.now();
    if (timeUntilExpiry <= 0) return;

    const timer = setTimeout(() => {
      refetch();
    }, timeUntilExpiry);

    return () => clearTimeout(timer);
  }, [expiryTime, refetch]);

  const timeUntilExpiry = expiryTime ? Math.max(0, expiryTime - Date.now()) : null;
  const secondsRemaining = timeUntilExpiry ? Math.floor(timeUntilExpiry / 1000) : null;

  return {
    quote: data,
    error: error as Error | null,
    isLoading,
    refetch,
    secondsRemaining,
    isExpired: timeUntilExpiry !== null && timeUntilExpiry <= 0,
  };
}


