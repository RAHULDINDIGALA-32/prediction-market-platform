/**
 * @file scripts/syncAuthorizationEvents.ts
 * @description Syncs authorization state from smart contracts to database
 * 
 * This script listens for authorization events:
 * - MarketFactory: CreatorWhitelisted events
 * - QuoteVerifier: SignerAdded/SignerRemoved events
 * - OracleAdapter: ResolverAdded/ResolverRemoved events
 * 
 * Runs periodically (via cron/background job) to keep database in sync
 * 
 * Usage:
 *   npx ts-node scripts/syncAuthorizationEvents.ts
 * 
 * Or schedule via cron:
 *   */1 * * * * cd /app && npm run sync:auth
 */

import { ethers } from "ethers";
import { prisma } from "../src/lib/db";

// Configuration from environment
const MARKET_FACTORY_ADDRESS = process.env.MARKET_FACTORY_ADDRESS!;
const QUOTE_VERIFIER_ADDRESS = process.env.QUOTE_VERIFIER_ADDRESS!;
const ORACLE_ADAPTER_ADDRESS = process.env.ORACLE_ADAPTER_ADDRESS!;
const RPC_ENDPOINT = process.env.CHAINID === "11155111" ? process.env.SEPOLIA_RPC_URL : "http://localhost:8545";

if (!MARKET_FACTORY_ADDRESS || !QUOTE_VERIFIER_ADDRESS || !ORACLE_ADAPTER_ADDRESS) {
  console.error(
    "❌ Missing required environment variables: MARKET_FACTORY_ADDRESS, QUOTE_VERIFIER_ADDRESS, ORACLE_ADAPTER_ADDRESS"
  );
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_ENDPOINT);

// Event ABIs
const MARKET_FACTORY_ABI = [
  "event CreatorWhitelisted(address indexed creator, bool isWhitelisted)",
];

const QUOTE_VERIFIER_ABI = [
  "event SignerAdded(address indexed signer)",
  "event SignerRemoved(address indexed signer)",
];

const ORACLE_ADAPTER_ABI = [
  "event ResolverAdded(address indexed resolver)",
  "event ResolverRemoved(address indexed resolver)",
];

/**
 * Sync MarketFactory creator whitelist events
 */
async function syncMarketFactoryEvents() {
  console.log("🔄 Syncing MarketFactory whitelist events...");

  try {
    const factory = new ethers.Contract(
      MARKET_FACTORY_ADDRESS,
      MARKET_FACTORY_ABI,
      provider
    );

    // Get last synced block
    const lastSync = await prisma.syncLog
      .findUnique({
        where: { service: "marketFactory" },
      })
      .then((log) => log?.lastBlockScanned ?? 0);

    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(lastSync + 1, currentBlock - 5000); // Max 5000 block range

    if (fromBlock > currentBlock) {
      console.log("  ✓ Already synced to latest block");
      return;
    }

    const events = await factory.queryFilter(
      factory.filters.CreatorWhitelisted(),
      fromBlock,
      currentBlock
    );

    for (const event of events) {
      const [creator, isWhitelisted] = event.args;
      const creatorAddr = creator.toLowerCase();

      await prisma.whitelistedCreator.upsert({
        where: { address: creatorAddr },
        update: { isWhitelisted, updatedAt: new Date() },
        create: { address: creatorAddr, isWhitelisted },
      });

      console.log(
        `  ${isWhitelisted ? "✓ Added" : "✗ Removed"} creator: ${creator}`
      );
    }

    // Update sync log
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

    console.log(
      `  ✓ Synced ${events.length} events (blocks ${fromBlock}-${currentBlock})`
    );
  } catch (error) {
    console.error("  ❌ MarketFactory sync failed:", error);
    throw error;
  }
}

/**
 * Sync QuoteVerifier signer authorization events
 */
async function syncQuoteVerifierEvents() {
  console.log("🔄 Syncing QuoteVerifier signer events...");

  try {
    const verifier = new ethers.Contract(
      QUOTE_VERIFIER_ADDRESS,
      QUOTE_VERIFIER_ABI,
      provider
    );

    const lastSync = await prisma.syncLog
      .findUnique({
        where: { service: "quoteVerifier" },
      })
      .then((log) => log?.lastBlockScanned ?? 0);

    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(lastSync + 1, currentBlock - 5000);

    if (fromBlock > currentBlock) {
      console.log("  ✓ Already synced to latest block");
      return;
    }

    // SignerAdded events
    const addedEvents = await verifier.queryFilter(
      verifier.filters.SignerAdded(),
      fromBlock,
      currentBlock
    );

    for (const event of addedEvents) {
      const [signer] = event.args;
      const signerAddr = signer.toLowerCase();

      await prisma.authorizedSigner.upsert({
        where: { address: signerAddr },
        update: { isAllowed: true, updatedAt: new Date() },
        create: { address: signerAddr, isAllowed: true },
      });

      console.log(`  ✓ Added signer: ${signer}`);
    }

    // SignerRemoved events
    const removedEvents = await verifier.queryFilter(
      verifier.filters.SignerRemoved(),
      fromBlock,
      currentBlock
    );

    for (const event of removedEvents) {
      const [signer] = event.args;
      const signerAddr = signer.toLowerCase();

      await prisma.authorizedSigner.update({
        where: { address: signerAddr },
        data: { isAllowed: false, updatedAt: new Date() },
      });

      console.log(`  ✗ Removed signer: ${signer}`);
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

    console.log(
      `  ✓ Synced ${addedEvents.length + removedEvents.length} events`
    );
  } catch (error) {
    console.error("  ❌ QuoteVerifier sync failed:", error);
    throw error;
  }
}

/**
 * Sync OracleAdapter resolver authorization events
 */
async function syncOracleAdapterEvents() {
  console.log("🔄 Syncing OracleAdapter resolver events...");

  try {
    const oracle = new ethers.Contract(
      ORACLE_ADAPTER_ADDRESS,
      ORACLE_ADAPTER_ABI,
      provider
    );

    const lastSync = await prisma.syncLog
      .findUnique({
        where: { service: "oracleAdapter" },
      })
      .then((log) => log?.lastBlockScanned ?? 0);

    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(lastSync + 1, currentBlock - 5000);

    if (fromBlock > currentBlock) {
      console.log("  ✓ Already synced to latest block");
      return;
    }

    // ResolverAdded events
    const addedEvents = await oracle.queryFilter(
      oracle.filters.ResolverAdded(),
      fromBlock,
      currentBlock
    );

    for (const event of addedEvents) {
      const [resolver] = event.args;
      const resolverAddr = resolver.toLowerCase();

      await prisma.oracleResolver.upsert({
        where: { address: resolverAddr },
        update: { isAllowed: true, updatedAt: new Date() },
        create: { address: resolverAddr, isAllowed: true },
      });

      console.log(`  ✓ Added resolver: ${resolver}`);
    }

    // ResolverRemoved events
    const removedEvents = await oracle.queryFilter(
      oracle.filters.ResolverRemoved(),
      fromBlock,
      currentBlock
    );

    for (const event of removedEvents) {
      const [resolver] = event.args;
      const resolverAddr = resolver.toLowerCase();

      await prisma.oracleResolver.update({
        where: { address: resolverAddr },
        data: { isAllowed: false, updatedAt: new Date() },
      });

      console.log(`  ✗ Removed resolver: ${resolver}`);
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

    console.log(
      `  ✓ Synced ${addedEvents.length + removedEvents.length} events`
    );
  } catch (error) {
    console.error("  ❌ OracleAdapter sync failed:", error);
    throw error;
  }
}

/**
 * Main sync function - runs all syncs sequentially
 */
async function main() {
  console.log("================================================");
  console.log("🚀 Starting Authorization State Sync");
  console.log("================================================\n");

  const startTime = Date.now();

  try {
    await syncMarketFactoryEvents();
    console.log();

    await syncQuoteVerifierEvents();
    console.log();

    await syncOracleAdapterEvents();
    console.log();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("================================================");
    console.log(`✅ Sync complete in ${duration}s`);
    console.log("================================================\n");

    process.exit(0);
  } catch (error) {
    console.error("\n================================================");
    console.error("❌ Sync failed:", error);
    console.error("================================================\n");
    process.exit(1);
  }
}

// Run sync
main();
