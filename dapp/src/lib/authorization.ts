/**
 * @description Authorization checks for dApp actions
 * Multi-tier caching strategy:
 * - L1 Cache: In-memory 
 * - L2 Cache: Database 
 * - L3 Fallback: Contract calls 
 * 
 * Pattern: Event Indexing + Database Cache + In-Memory Cache
 */

import { prisma } from "./db";
import { authorizationCache } from "./authorizationCache";
import { ethers } from "ethers";

/**
 * Check if an address is a whitelisted market creator
 * 
 * @param address - Address to check
 * @returns true if creator is whitelisted, false otherwise
 */
export async function isWhitelistedCreator(address: string): Promise<boolean> {
  if (!ethers.isAddress(address)) {
    console.warn(`Invalid address format: ${address}`);
    return false;
  }

  const normalizedAddress = address.toLowerCase();

  // L1: Check in-memory cache first (FAST)
  const cachedValue = authorizationCache.getCreator(normalizedAddress);
  if (cachedValue !== undefined) {
    return cachedValue;
  }

  // L2: Check database cache (MEDIUM)
  try {
    const creator = await prisma.whitelistedCreator.findUnique({
      where: { address: normalizedAddress },
    });

    const isWhitelisted = creator?.isWhitelisted ?? false;
    
    // Update L1 cache for future queries
    authorizationCache.setCreator(normalizedAddress, isWhitelisted);
    
    return isWhitelisted;
  } catch (error) {
    console.error(`Database query failed for creator ${address}:`, error);
    return false;
  }
}

/**
 * Check if an address is an authorized quote signer
 * 
 * @param address - Address to check
 * @returns true if signer is authorized, false otherwise
 */
export async function isAuthorizedSigner(address: string): Promise<boolean> {
  if (!ethers.isAddress(address)) {
    console.warn(`Invalid address format: ${address}`);
    return false;
  }

  const normalizedAddress = address.toLowerCase();

  // L1: Check in-memory cache first (FAST)
  const cachedValue = authorizationCache.getSigner(normalizedAddress);
  if (cachedValue !== undefined) {
    return cachedValue;
  }

  // L2: Check database cache (MEDIUM)
  try {
    const signer = await prisma.authorizedSigner.findUnique({
      where: { address: normalizedAddress },
    });

    const isAllowed = signer?.isAllowed ?? false;
    
    // Update L1 cache
    authorizationCache.setSigner(normalizedAddress, isAllowed);
    
    return isAllowed;
  } catch (error) {
    console.error(`Database query failed for signer ${address}:`, error);
    return false;
  }
}

/**
 * Check if an address is an authorized oracle resolver
 * 
 * Three-tier lookup with cache synchronization
 * Cache synced via:
 * - Local: triggerAuthorizationSync() or API endpoint
 * - Serverless Deployed: Cron Functions (configured in vercel.json)
 * 
 * @param address - Address to check
 * @returns true if resolver is authorized, false otherwise
 */
export async function isOracleResolver(address: string): Promise<boolean> {
  if (!ethers.isAddress(address)) {
    console.warn(`Invalid address format: ${address}`);
    return false;
  }

  const normalizedAddress = address.toLowerCase();

  // L1: Check in-memory cache first
  const cachedValue = authorizationCache.getResolver(normalizedAddress);
  if (cachedValue !== undefined) {
    return cachedValue;
  }

  // L2: Check database cache
  try {
    const resolver = await prisma.oracleResolver.findUnique({
      where: { address: normalizedAddress },
    });

    const isAllowed = resolver?.isAllowed ?? false;
    
    // Update L1 cache
    authorizationCache.setResolver(normalizedAddress, isAllowed);
    
    return isAllowed;
  } catch (error) {
    console.error(`Database query failed for resolver ${address}:`, error);
    return false;
  }
}

/**
 * DEFENSIVE: Verify authorization against smart contract
 * Use for critical operations before submitting transactions
 * Protects against stale cache / sync lag
 * 
 * @param address - Address to verify
 * @param provider - Ethers provider for contract calls
 * @param checkType - Type of authorization (creator, signer, resolver)
 * @returns true if verified on-chain, false otherwise
 */
export async function verifyWithContract(
  address: string,
  provider: ethers.Provider,
  checkType: "creator" | "signer" | "resolver"
): Promise<boolean> {
  if (!ethers.isAddress(address)) {
    console.warn(`Invalid address format: ${address}`);
    return false;
  }

  try {
    switch (checkType) {
      case "creator": {
        const marketFactoryAddress = process.env.NEXT_PUBLIC_MARKET_FACTORY_ADDRESS;
        if (!marketFactoryAddress) {
          console.warn("MARKET_FACTORY_ADDRESS not configured");
          return false;
        }

        const factory = new ethers.Contract(
          marketFactoryAddress,
          ["function whitelistedCreators(address) view returns (bool)"],
          provider
        );

        return await factory.whitelistedCreators(address);
      }

      case "signer": {
        const quoteVerifierAddress = process.env.NEXT_PUBLIC_QUOTE_VERIFIER_ADDRESS;
        if (!quoteVerifierAddress) {
          console.warn("QUOTE_VERIFIER_ADDRESS not configured");
          return false;
        }

        const verifier = new ethers.Contract(
          quoteVerifierAddress,
          ["function isSigner(address) view returns (bool)"],
          provider
        );

        return await verifier.isSigner(address);
      }

      case "resolver": {
        const oracleAdapterAddress = process.env.NEXT_PUBLIC_ORACLE_ADAPTER_ADDRESS;
        if (!oracleAdapterAddress) {
          console.warn("ORACLE_ADAPTER_ADDRESS not configured");
          return false;
        }

        const oracle = new ethers.Contract(
          oracleAdapterAddress,
          ["function resolvers(address) view returns (bool)"],
          provider
        );

        return await oracle.resolvers(address);
      }
    }
  } catch (error) {
    console.error(
      `Contract verification failed for ${address} (${checkType}):`,
      error
    );
    return false;
  }
}

/**
 * Safe authorization check with fallback
 * 1. Check database cache first
 * 2. If not found, verify against contract
 * 3. If verification succeeds, update database for future queries
 * 
 * Use for user-facing authorization decisions
 */
export async function isAuthorizedSafe(
  address: string,
  provider: ethers.Provider,
  checkType: "creator" | "signer" | "resolver"
): Promise<boolean> {
  if (!ethers.isAddress(address)) {
    return false;
  }

  // Try cache first
  const isInCache =
    checkType === "creator"
      ? await isWhitelistedCreator(address)
      : checkType === "signer"
        ? await isAuthorizedSigner(address)
        : await isOracleResolver(address);

  if (isInCache) {
    return true;
  }

  // Not in cache, verify against contract
  const isOnChain = await verifyWithContract(address, provider, checkType);

  if (isOnChain) {
    // Update cache for future queries
    const lowerAddress = address.toLowerCase();

    if (checkType === "creator") {
      await prisma.whitelistedCreator
        .upsert({
          where: { address: lowerAddress },
          update: { isWhitelisted: true },
          create: { address: lowerAddress, isWhitelisted: true },
        })
        .catch((err: unknown) =>
          console.error("Failed to update creator cache:", err)
        );
    } else if (checkType === "signer") {
      await prisma.authorizedSigner
        .upsert({
          where: { address: lowerAddress },
          update: { isAllowed: true },
          create: { address: lowerAddress, isAllowed: true, privateKey: "" },
        })
        .catch((err: unknown) => console.error("Failed to update signer cache:", err));
    } else {
      await prisma.oracleResolver
        .upsert({
          where: { address: lowerAddress },
          update: { isAllowed: true },
          create: { address: lowerAddress, isAllowed: true },
        })
        .catch((err: unknown) =>
          console.error("Failed to update resolver cache:", err)
        );
    }
  }

  return isOnChain;
}
