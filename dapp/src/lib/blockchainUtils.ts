/**
 * Blockchain Utility Functions
 * Provides helper functions for blockchain interactions and transaction handling
 *
 * @author Platform Team
 * @version 1.0.0
 * @date January 19, 2026
 */

import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";



/**
 * Get block number from transaction hash
 * @param txHash - Transaction hash
 * @returns Block number of the transaction
 */
export async function getBlockNumberFromTx(
  txHash: `0x${string}`
): Promise<number> {
  try {
    const client = createPublicClient({
      chain: sepolia,
      transport: http(process.env.RPC_URL as string),
    });

    const receipt = await client.getTransactionReceipt({
      hash: txHash,
    });

    if (!receipt) {
      throw new Error(`Transaction receipt not found for hash: ${txHash}`);
    }

    return Number(receipt.blockNumber);
  } catch (error: unknown) {
    console.error(`[BLOCKCHAIN UTIL] Failed to get block number from tx ${txHash}:`, error);
    throw error;
  }
}

/**
 * Wait for transaction confirmation and extract block number
 * @param txHash - Transaction hash
 * @returns Block number after confirmation
 */
export async function waitForTxConfirmation(
  txHash: `0x${string}`
): Promise<number> {
  try {
    // Poll for transaction receipt
    let attempts = 0;
    const maxAttempts = 30; // 30 attempts * 1 second = 30 second timeout

    while (attempts < maxAttempts) {
      try {
        const blockNumber = await getBlockNumberFromTx(txHash);
        console.log(
          `[BLOCKCHAIN UTIL] Transaction ${txHash} confirmed at block ${blockNumber}`
        );
        return blockNumber;
  } catch (_error: unknown) {
    attempts++;
    if (attempts >= maxAttempts) {
      throw new Error(
        `Transaction confirmation timeout after ${maxAttempts} attempts. Error ${_error}`
      );
    }
    // Wait 1 second before retrying
    await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    throw new Error("Failed to confirm transaction");
  } catch (error: unknown) {
    console.error(`[BLOCKCHAIN UTIL] Transaction confirmation failed:`, error);
    throw error;
  }
}

/**
 * Sync oracle action to database with retry logic
 * @param action - Oracle action (propose, dispute, resolve, finalize)
 * @param marketId - Market ID
 * @param txHash - Transaction hash
 * @param data - Additional data for the sync
 * @returns Success boolean
 */
export async function syncOracleToDatabase(
  action: "propose" | "dispute" | "resolve" | "finalize",
  marketId: string,
  txHash: `0x${string}`,
  data: Record<string, unknown>
): Promise<boolean> {
  const maxRetries = 3;
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      attempts++;
      console.log(
        `[ORACLE SYNC HELPER] Attempting sync - Action: ${action}, Attempt: ${attempts}/${maxRetries}`
      );

      // Get block number from transaction
      const blockNumber = await getBlockNumberFromTx(txHash);

      // Call sync endpoint
      const response = await fetch("/api/oracle/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          marketId,
          transactionHash: txHash,
          blockNumber,
          ...data,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `Sync failed with status ${response.status}: ${error.error}`
        );
      }

      const result = await response.json();

      if (result.success) {
        console.log(
          `[ORACLE SYNC HELPER] Success - Action: ${action}, Market: ${marketId}`
        );
        return true;
      }

      throw new Error(result.error || "Unknown sync error");
    } catch (error) {
      console.error(
        `[ORACLE SYNC HELPER] Attempt ${attempts} failed:`,
        error
      );

      if (attempts >= maxRetries) {
        console.error(
          `[ORACLE SYNC HELPER] Max retries exceeded for action ${action}`
        );
        return false;
      }

      // Wait before retry (exponential backoff)
      const delayMs = 1000 * attempts;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return false;
}

/**
 * Sync settlement action to database with retry logic
 * @param action - Settlement action (redeem, withdraw)
 * @param marketId - Market ID
 * @param txHash - Transaction hash
 * @param data - Additional data for the sync
 * @returns Success boolean
 */
export async function syncSettlementToDatabase(
  action: "redeem" | "withdraw",
  marketId: string,
  txHash: `0x${string}`,
  data: Record<string, unknown>
): Promise<boolean> {
  const maxRetries = 3;
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      attempts++;
      console.log(
        `[SETTLEMENT SYNC HELPER] Attempting sync - Action: ${action}, Attempt: ${attempts}/${maxRetries}`
      );

      // Get block number from transaction
      const blockNumber = await getBlockNumberFromTx(txHash);

      // Call sync endpoint
      const response = await fetch("/api/settlement/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          marketId,
          transactionHash: txHash,
          blockNumber,
          ...data,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          `Sync failed with status ${response.status}: ${error.error}`
        );
      }

      const result = await response.json();

      if (result.success) {
        console.log(
          `[SETTLEMENT SYNC HELPER] Success - Action: ${action}, Market: ${marketId}`
        );
        return true;
      }

      throw new Error(result.error || "Unknown sync error");
    } catch (error) {
      console.error(
        `[SETTLEMENT SYNC HELPER] Attempt ${attempts} failed:`,
        error
      );

      if (attempts >= maxRetries) {
        console.error(
          `[SETTLEMENT SYNC HELPER] Max retries exceeded for action ${action}`
        );
        return false;
      }

      // Wait before retry (exponential backoff)
      const delayMs = 1000 * attempts;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return false;
}

/**
 * Check if transaction hash is unique (not already synced)
 * @param txHash - Transaction hash
 * @param type - Type of event (oracle or settlement)
 * @returns Boolean indicating uniqueness
 */
export async function isTxHashUnique(
  txHash: string,
  type: "oracle" | "settlement"
): Promise<boolean> {
  try {
    if (type === "oracle") {
      // Check in OracleEvent using any tx hash field
      const existingEvent = await (
        await import("@/lib/db")
      ).prisma.$queryRaw`
        SELECT id FROM "OracleEvent"
        WHERE "proposalTxHash" = ${txHash}
           OR "disputeTxHash" = ${txHash}
           OR "resolutionTxHash" = ${txHash}
        LIMIT 1
      `;

      return (existingEvent as string[]).length === 0;
    } else {
      // Check in RedemptionEvent and SettlementEvent
      const { prisma } = await import("@/lib/db");
      const redemption = await prisma.redemptionEvent.findUnique({
        where: { transactionHash: txHash },
      });
      const settlement = await prisma.settlementEvent.findUnique({
        where: { transactionHash: txHash },
      });

      return !redemption && !settlement;
    }
  } catch (error) {
    console.error(
      `[BLOCKCHAIN UTIL] Error checking tx hash uniqueness:`,
      error
    );
    // Assume not unique if we can't check (safer)
    return false;
  }
}

/**
 * Format transaction hash for display
 * @param hash - Full transaction hash
 * @param length - Number of characters to show from start and end
 * @returns Formatted hash (e.g., "0x1234...5678")
 */
export function formatTxHash(hash: string, length: number = 4): string {
  if (hash.length <= length * 2 + 2) {
    return hash;
  }
  return `${hash.slice(0, length + 2)}...${hash.slice(-length)}`;
}

/**
 * Convert wei to ETH
 * @param wei - Amount in wei
 * @returns Amount in ETH as string
 */
export function weiToEth(wei: bigint): string {
  const eth = Number(wei) / 1e18;
  return eth.toFixed(6);
}

/**
 * Convert ETH to wei
 * @param eth - Amount in ETH
 * @returns Amount in wei as bigint
 */
export function ethToWei(eth: number): bigint {
  return BigInt(Math.floor(eth * 1e18));
}
