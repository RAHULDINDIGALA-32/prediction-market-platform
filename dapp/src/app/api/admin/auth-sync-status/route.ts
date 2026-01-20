/**
 * @description Get authorization sync service status and metrics
 * 
 * Endpoint: GET /api/admin/auth-sync-status
 * 
 * Returns:
 * - Last sync time and duration
 * - Success/failure counts
 * - Cache metrics (hits, misses, hit rate)
 * - Events processed
 * - Last error message
 */

import { NextResponse } from "next/server";
import { getSyncService } from "@/lib/authorizationSyncService";
import { authorizationCache } from "@/lib/authorizationCache";

interface SyncStatusResponse {
  success: boolean;
  syncService: {
    lastSyncTime: number | null;
    lastSyncDuration: number;
    successCount: number;
    failureCount: number;
    lastError: string | null;
    eventsProcessed: number;
    isRunning: boolean;
  };
  cache: {
    creators: {
      hits: number;
      misses: number;
      hitRate: number;
      size: number;
    };
    signers: {
      hits: number;
      misses: number;
      hitRate: number;
      size: number;
    };
    resolvers: {
      hits: number;
      misses: number;
      hitRate: number;
      size: number;
    };
    totalSize: number;
  };
  error?: string;
}


export async function GET(): Promise<NextResponse<SyncStatusResponse>> {
  try {
    // Get sync service metrics
    const syncService = getSyncService();
    const syncMetrics = syncService.getMetrics();

    // Get cache metrics
    const cacheStats = authorizationCache.getStats();

    return NextResponse.json({
      success: true,
      syncService: {
        lastSyncTime: syncMetrics.lastSyncTime,
        lastSyncDuration: syncMetrics.lastSyncDuration,
        successCount: syncMetrics.successCount,
        failureCount: syncMetrics.failureCount,
        lastError: syncMetrics.lastError,
        eventsProcessed: syncMetrics.eventsProcessed,
        isRunning: true, // Would need to track actual running state
      },
      cache: {
        creators: {
          hits: cacheStats.creators.hits,
          misses: cacheStats.creators.misses,
          hitRate: Math.round(cacheStats.creators.hitRate * 10000) / 100, // Percentage
          size: 0, // TODO: Get size from cache stats
        },
        signers: {
          hits: cacheStats.signers.hits,
          misses: cacheStats.signers.misses,
          hitRate: Math.round(cacheStats.signers.hitRate * 10000) / 100,
          size: 0,
        },
        resolvers: {
          hits: cacheStats.resolvers.hits,
          misses: cacheStats.resolvers.misses,
          hitRate: Math.round(cacheStats.resolvers.hitRate * 10000) / 100,
          size: 0,
        },
        totalSize: cacheStats.totalSize,
      },
    });
  } catch (error: unknown) {
    console.error("Sync status check error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json(
      {
        success: false,
        syncService: {
          lastSyncTime: null,
          lastSyncDuration: 0,
          successCount: 0,
          failureCount: 0,
          lastError: null,
          eventsProcessed: 0,
          isRunning: false,
        },
        cache: {
          creators: { hits: 0, misses: 0, hitRate: 0, size: 0 },
          signers: { hits: 0, misses: 0, hitRate: 0, size: 0 },
          resolvers: { hits: 0, misses: 0, hitRate: 0, size: 0 },
          totalSize: 0,
        },
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
