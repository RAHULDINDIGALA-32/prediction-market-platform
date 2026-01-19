
/**
 * Get Oracle configuration from environment variables
 * These values are in wei and seconds as stored in the smart contract
 */
export function getOracleConfig() {
  return {
    // Bond amounts (in wei, convert to ETH for display)
    proposerBondWei: process.env.NEXT_PUBLIC_PROPOSER_BOND_WEI || "10000000000000000", // 0.01 ETH default
    disputerBondWei: process.env.NEXT_PUBLIC_DISPUTER_BOND_WEI || "20000000000000000", // 0.02 ETH default

    // Time windows (in seconds)
    disputeWindowSeconds: parseInt(
      process.env.NEXT_PUBLIC_DISPUTE_WINDOW_SECONDS || "604800"
    ), // 7 days default
    resolutionDeadlineSeconds: parseInt(
      process.env.NEXT_PUBLIC_RESOLUTION_DEADLINE_SECONDS || "259200"
    ), // 3 days default

    // Contract addresses
    oracleAdapterAddress: process.env.NEXT_PUBLIC_ORACLE_ADAPTER_ADDRESS || "0x0000000000000000000000000000000000000000",

    // Bounty amounts
    proposerBountyWei: process.env.NEXT_PUBLIC_PROPOSER_BOUNTY_WEI || "20000000000000000", // 0.02 ETH default
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
