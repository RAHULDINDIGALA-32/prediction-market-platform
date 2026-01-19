/**
 * Get Settlement configuration from environment variables
 * These values are in wei and seconds as stored in the smart contract
 */
export function getSettlementConfig() {
  return {
    // Redemption period (in seconds) - from SettlementEngine.REDEMPTION_PERIOD
    redemptionPeriodSeconds: parseInt(
      process.env.NEXT_PUBLIC_REDEMPTION_PERIOD_SECONDS || "2592000"
    ), // 30 days default (2592000 seconds)

    // Contract addresses
    settlementEngineAddress: process.env.NEXT_PUBLIC_SETTLEMENT_ENGINE_ADDRESS || "0x0000000000000000000000000000000000000000",
    oracleAdapterAddress: process.env.NEXT_PUBLIC_ORACLE_ADAPTER_ADDRESS || "0x0000000000000000000000000000000000000000",
  };
}

/**
 * Convert wei to ETH string for display
 */
export function weiToEth(wei: string | bigint): string {
  const weiNum = typeof wei === "string" ? BigInt(wei) : wei;
  const eth = Number(weiNum) / 1e18;
  return eth.toFixed(4);
}

/**
 * Format time duration in seconds to human-readable format
 */
export function formatSeconds(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days} day${days > 1 ? "s" : ""}`);
  if (hours > 0) parts.push(`${hours} hour${hours > 1 ? "s" : ""}`);
  if (mins > 0) parts.push(`${mins} min${mins > 1 ? "s" : ""}`);

  return parts.join(" ");
}

/**
 * Check if a market is in redemption period
 * Market is RESOLVED when oracle finalizes, and stays redeemable for 30 days
 */
export function isRedemptionOpen(resolvedAt: number, currentTime: number = Date.now()): boolean {
  if (!resolvedAt) return false;
  const resolvedAtMs = resolvedAt * 1000; // Convert from seconds to milliseconds
  const redemptionPeriodMs = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
  return currentTime < resolvedAtMs + redemptionPeriodMs;
}

/**
 * Check if redemption window has closed
 * After 30 days of resolution, creators can withdraw profits
 */
export function isRedemptionClosed(resolvedAt: number, currentTime: number = Date.now()): boolean {
  return !isRedemptionOpen(resolvedAt, currentTime);
}

/**
 * Calculate time remaining in redemption period
 */
export function getRedemptionTimeRemaining(resolvedAt: number, currentTime: number = Date.now()): number {
  if (!resolvedAt) return 0;
  const resolvedAtMs = resolvedAt * 1000;
  const redemptionPeriodMs = 30 * 24 * 60 * 60 * 1000;
  const endTime = resolvedAtMs + redemptionPeriodMs;
  return Math.max(0, endTime - currentTime);
}
