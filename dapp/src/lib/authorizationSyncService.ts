/**
 * @description Continuously syncs authorization state from blockchain
 * 
 * Runs as background job with configurable interval (default: every 1 minute)
 * Automatically populates L1 cache on startup
 */

import { ethers } from "ethers";
import { prisma } from "./db";
import { authorizationCache } from "./authorizationCache";

interface ContractEvent {
  args?: readonly unknown[];
}

interface SyncServiceConfig {
  enabled: boolean;
  interval: number; // ms
  maxRetries: number;
  retryDelay: number; // ms
  batchSize: number;
  maxBlockRange: number;
  cacheTTL: number; // ms
}

interface SyncMetrics {
  lastSyncTime: number | null;
  lastSyncDuration: number;
  successCount: number;
  failureCount: number;
  lastError: string | null;
  eventsProcessed: number;
}

export class AuthorizationSyncService {
  private config: SyncServiceConfig;
  private metrics: SyncMetrics = {
    lastSyncTime: null,
    lastSyncDuration: 0,
    successCount: 0,
    failureCount: 0,
    lastError: null,
    eventsProcessed: 0,
  };
  private syncTimer: NodeJS.Timeout | null = null;
  private issyncing = false;
  private provider: ethers.JsonRpcProvider;

  // Contract addresses and ABIs
  private readonly MARKET_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_MARKET_FACTORY_ADDRESS;
  private readonly QUOTE_VERIFIER_ADDRESS = process.env.NEXT_PUBLIC_QUOTE_VERIFIER_ADDRESS;
  private readonly ORACLE_ADAPTER_ADDRESS = process.env.NEXT_PUBLIC_ORACLE_ADAPTER_ADDRESS;
  private readonly RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL;

  private readonly MARKET_FACTORY_ABI = [
    "event CreatorWhitelisted(address indexed creator, bool isWhitelisted)",
  ];

  private readonly QUOTE_VERIFIER_ABI = [
    "event SignerAdded(address indexed signer)",
    "event SignerRemoved(address indexed signer)",
  ];

  private readonly ORACLE_ADAPTER_ABI = [
    "event ResolverAdded(address indexed resolver)",
    "event ResolverRemoved(address indexed resolver)",
  ];

  constructor(config: Partial<SyncServiceConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      interval: config.interval ?? 60 * 1000, // 1 minute default
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      batchSize: config.batchSize ?? 100,
      maxBlockRange: config.maxBlockRange ?? 5000,
      cacheTTL: config.cacheTTL ?? 30 * 60 * 1000, // 30 minutes
    };

    if (!this.RPC_URL) {
      throw new Error("RPC_URL environment variable not set");
    }

    this.provider = new ethers.JsonRpcProvider(this.RPC_URL);
  }

  /**
   * Perform a sync cycle with retry logic
   * Public method - can be called by Vercel Cron Functions or manually
   */
  async performSync(isInitial: boolean = false) {
    if (this.issyncing) {
      console.log("Sync already in progress, skipping...");
      return;
    }

    this.issyncing = true;
    const startTime = Date.now();

    try {
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
        try {
          await Promise.all([
            this.syncMarketFactoryEvents(),
            this.syncQuoteVerifierEvents(),
            this.syncOracleAdapterEvents(),
          ]);

          const duration = Date.now() - startTime;
          this.metrics.lastSyncTime = Date.now();
          this.metrics.lastSyncDuration = duration;
          this.metrics.successCount++;
          this.metrics.lastError = null;

          if (!isInitial) {
            console.log(
              `Authorization sync completed in ${duration}ms (attempt ${attempt})`
            );
          }

          return;
        } catch (error) {
          lastError = error as Error;
          if (attempt < this.config.maxRetries) {
            const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
            console.warn(
              `⚠️  Sync attempt ${attempt} failed, retrying in ${delay}ms:`,
              lastError.message
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      // All retries exhausted
      this.metrics.failureCount++;
      this.metrics.lastError = lastError?.message || "Unknown error";
      console.error(
        "❌ Authorization sync failed after all retries:",
        lastError?.message
      );
    } finally {
      this.issyncing = false;
    }
  }

  /**
   * Sync MarketFactory creator whitelist events
   */
  private async syncMarketFactoryEvents() {
    if (!this.MARKET_FACTORY_ADDRESS) {
      console.warn("⚠️  MARKET_FACTORY_ADDRESS not configured, skipping sync");
      return;
    }

    try {
      const factory = new ethers.Contract(
        this.MARKET_FACTORY_ADDRESS,
        this.MARKET_FACTORY_ABI,
        this.provider
      );

      const syncLog = await prisma.syncLog.findUnique({
        where: { service: "marketFactory" },
      });

      const lastSync = syncLog?.lastBlockScanned ?? 0;

      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(Number(lastSync) + 1, currentBlock - this.config.maxBlockRange);

      if (fromBlock > currentBlock) {
        return;
      }

      const events = await factory.queryFilter(
        factory.filters.CreatorWhitelisted(),
        fromBlock,
        currentBlock
      );

      for (const event of events) {
        const creator = (event as ContractEvent).args?.[0];
        const isWhitelistedRaw = (event as ContractEvent).args?.[1];

        if (!creator || typeof isWhitelistedRaw !== 'boolean') continue;

        const creatorAddr = creator.toString().toLowerCase();
        const isWhitelisted = Boolean(isWhitelistedRaw);

        await prisma.whitelistedCreator.upsert({
          where: { address: creatorAddr },
          update: { isWhitelisted, updatedAt: new Date() },
          create: { address: creatorAddr, isWhitelisted },
        });

        // Update L1 cache
        authorizationCache.setCreator(creatorAddr, isWhitelisted, this.config.cacheTTL);
        this.metrics.eventsProcessed++;
      }

      await prisma.syncLog.upsert({
        where: { service: "marketFactory" },
        update: {
          lastBlockScanned: currentBlock,
          lastSyncedAt: new Date(),
        },
        create: {
          service: "marketFactory",
          lastBlockScanned: currentBlock,
        },
      });
    } catch (error) {
      console.error("❌ MarketFactory sync error:", error);
      throw error;
    }
  }

  /**
   * Sync QuoteVerifier signer authorization events
   */
  private async syncQuoteVerifierEvents() {
    if (!this.QUOTE_VERIFIER_ADDRESS) {
      console.warn(
        "⚠️  QUOTE_VERIFIER_ADDRESS not configured, skipping sync"
      );
      return;
    }

    try {
      const verifier = new ethers.Contract(
        this.QUOTE_VERIFIER_ADDRESS,
        this.QUOTE_VERIFIER_ABI,
        this.provider
      );

      const syncLog = await prisma.syncLog.findUnique({
        where: { service: "marketFactory" },
      });

      const lastSync = syncLog?.lastBlockScanned ?? 0

      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(Number(lastSync) + 1, currentBlock - this.config.maxBlockRange);

      if (fromBlock > currentBlock) {
        return;
      }

      // SignerAdded events
      const addedEvents = await verifier.queryFilter(
        verifier.filters.SignerAdded(),
        fromBlock,
        currentBlock
      );

      for (const event of addedEvents) {
        const signer = (event as ContractEvent).args?.[0];
        if (!signer) continue;

        const signerAddr = signer.toString().toLowerCase();

        await prisma.authorizedSigner.upsert({
          where: { address: signerAddr },
          update: { isAllowed: true, updatedAt: new Date() },
          create: { address: signerAddr, isAllowed: true, },
        });

        authorizationCache.setSigner(signerAddr, true, this.config.cacheTTL);
        this.metrics.eventsProcessed++;
      }

      // SignerRemoved events
      const removedEvents = await verifier.queryFilter(
        verifier.filters.SignerRemoved(),
        fromBlock,
        currentBlock
      );

      for (const event of removedEvents) {
        const signer = (event as ContractEvent).args?.[0];
        if (!signer) continue;

        const signerAddr = signer.toString().toLowerCase();

        await prisma.authorizedSigner.update({
          where: { address: signerAddr },
          data: { isAllowed: false, updatedAt: new Date() },
        });

        authorizationCache.setSigner(signerAddr, false, this.config.cacheTTL);
        this.metrics.eventsProcessed++;
      }

      await prisma.syncLog.upsert({
        where: { service: "quoteVerifier" },
        update: {
          lastBlockScanned: currentBlock,
          lastSyncedAt: new Date(),
        },
        create: {
          service: "quoteVerifier",
          lastBlockScanned: currentBlock,
        },
      });
    } catch (error) {
      console.error("❌ QuoteVerifier sync error:", error);
      throw error;
    }
  }

  /**
   * Sync OracleAdapter resolver authorization events
   */
  private async syncOracleAdapterEvents() {
    if (!this.ORACLE_ADAPTER_ADDRESS) {
      console.warn(
        "⚠️  ORACLE_ADAPTER_ADDRESS not configured, skipping sync"
      );
      return;
    }

    try {
      const oracle = new ethers.Contract(
        this.ORACLE_ADAPTER_ADDRESS,
        this.ORACLE_ADAPTER_ABI,
        this.provider
      );

      const syncLog = await prisma.syncLog.findUnique({
        where: { service: "marketFactory" },
      });

      const lastSync = syncLog?.lastBlockScanned ?? 0
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(Number(lastSync) + 1, currentBlock - this.config.maxBlockRange);

      if (fromBlock > currentBlock) {
        return;
      }

      // ResolverAdded events
      const addedEvents = await oracle.queryFilter(
        oracle.filters.ResolverAdded(),
        fromBlock,
        currentBlock
      );

      for (const event of addedEvents) {
        const resolver = (event as ContractEvent).args?.[0];
        if (!resolver) continue;

        const resolverAddr = resolver.toString().toLowerCase();

        await prisma.oracleResolver.upsert({
          where: { address: resolverAddr },
          update: { isAllowed: true, updatedAt: new Date() },
          create: { address: resolverAddr, isAllowed: true },
        });

        authorizationCache.setResolver(resolverAddr, true, this.config.cacheTTL);
        this.metrics.eventsProcessed++;
      }

      // ResolverRemoved events
      const removedEvents = await oracle.queryFilter(
        oracle.filters.ResolverRemoved(),
        fromBlock,
        currentBlock
      );

      for (const event of removedEvents) {
        const resolver = (event as ContractEvent).args?.[0];
        if (!resolver) continue;

        const resolverAddr = resolver.toString().toLowerCase();

        await prisma.oracleResolver.update({
          where: { address: resolverAddr },
          data: { isAllowed: false, updatedAt: new Date() },
        });

        authorizationCache.setResolver(resolverAddr, false, this.config.cacheTTL);
        this.metrics.eventsProcessed++;
      }

      await prisma.syncLog.upsert({
        where: { service: "oracleAdapter" },
        update: {
          lastBlockScanned: currentBlock,
          lastSyncedAt: new Date(),
        },
        create: {
          service: "oracleAdapter",
          lastBlockScanned: currentBlock,
        },
      });
    } catch (error) {
      console.error("❌ OracleAdapter sync error:", error);
      throw error;
    }
  }

  /**
   * Get sync service metrics
   */
  getMetrics(): SyncMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      lastSyncTime: null,
      lastSyncDuration: 0,
      successCount: 0,
      failureCount: 0,
      lastError: null,
      eventsProcessed: 0,
    };
  }
}

// Singleton instance
let syncService: AuthorizationSyncService | null = null;

export function getSyncService(): AuthorizationSyncService {
  if (!syncService) {
    syncService = new AuthorizationSyncService({
      enabled: process.env.AUTH_SYNC_ENABLED !== "false",
      interval: parseInt(process.env.AUTH_SYNC_INTERVAL || "60000"),
    });
  }
  return syncService;
}

/**
 * Trigger a manual sync cycle (for Vercel Cron Functions or API endpoints)
 * Returns metrics about the sync operation
 */
export async function triggerAuthorizationSync(): Promise<SyncMetrics> {
  const service = getSyncService();
  await service.performSync(false);
  return service.getMetrics();
}
