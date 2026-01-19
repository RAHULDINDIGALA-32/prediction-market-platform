import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";


export interface UnsignedQuote {
  quote: {
    trader: string;
    market: string;
    outcome: 0 | 1;  // Frontend format: YES=0, NO=1
    amount: string;
    cost: string;
    deadline: bigint;
    nonce: string;
    isSell: boolean;
    minAmountOut?: string;
    minReturn?: string;
    marketVersion: number;
  };
}


export interface SignedQuote {
  quote: {
    trader: string;
    market: string;
    marketId: string;
    outcome: 1 | 2;  // Contract format: YES=1, NO=2 (converted during signing)
    amount: string;
    cost: string;
    deadline: bigint;
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

/**
 * Hook to fetch unsigned quotes (preview only, no signature)
 * Called when user enters amount
 */
export function useUnsignedQuote(request: QuoteRequest | null) {
  const { address } = useAccount();
  const [expiryTime, setExpiryTime] = useState<number | null>(null);

  const { data, error, isLoading, refetch } = useQuery<UnsignedQuote>({
    queryKey: ["unsigned-quote", request],
    queryFn: async () => {
      if (!request || !address) throw new Error("Missing request or address");

      const res = await fetch("/api/quote/unsigned", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...request,
          trader: address,
          outcome: request.side === "YES" ? 0 : 1,
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
    staleTime: 0,
    gcTime: 0,
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

/**
 * Hook to sign an unsigned quote
 * Called when user confirms trade in modal
 * Returns a signed quote ready for on-chain execution
 */
export async function signQuote(unsignedQuote: UnsignedQuote, marketId: string): Promise<SignedQuote> {
  const res = await fetch("/api/quote/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      marketId,
      trader: unsignedQuote.quote.trader,
      outcome: unsignedQuote.quote.outcome,
      amount: unsignedQuote.quote.amount,
      cost: unsignedQuote.quote.cost,
      deadline: unsignedQuote.quote.deadline,
      nonce: unsignedQuote.quote.nonce,
      isSell: unsignedQuote.quote.isSell,
      minAmountOut: unsignedQuote.quote.minAmountOut || "0",
      minReturn: unsignedQuote.quote.minReturn || "0",
      marketVersion: unsignedQuote.quote.marketVersion,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to sign quote");
  }

  const signedData = await res.json();
  return {
    quote: {
      ...signedData.quote,
      marketId,
    },
    signature: signedData.quote.signature,
  };
}

/**
 * @deprecated Use useUnsignedQuote instead
 * This was the old hook that signed immediately
 */
export function useQuote(request: QuoteRequest | null) {
  const { address } = useAccount();
  const [expiryTime, setExpiryTime] = useState<number | null>(null);

  const { data, error, isLoading, refetch } = useQuery<SignedQuote>({
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
