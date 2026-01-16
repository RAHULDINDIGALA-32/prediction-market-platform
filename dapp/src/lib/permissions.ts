import { prisma } from "@/lib/db";
import { ethers } from "ethers";

const ADMIN_ADDRESS = (() => {
  const addr = process.env.ADMIN_ADDRESS?.toLowerCase();
  if (addr && !ethers.isAddress(addr)) {
    console.warn(
      "WARNING: ADMIN_ADDRESS environment variable is not a valid Ethereum address: " +
      addr
    );
  }
  return addr;
})();

/**
 * Check if an address is the system admin (from env)
 */
export function isSystemAdmin(address: string | undefined | null): boolean {
  if (!address || !ADMIN_ADDRESS) return false;
  return address.toLowerCase() === ADMIN_ADDRESS;
}

/**
 * Check if an address is authorized to create markets
 * (Either system admin or whitelisted creator)
 */
export async function isAuthorizedCreator(address: string | undefined | null): Promise<boolean> {
  if (!address) return false;

  // System admin is always authorized
  if (isSystemAdmin(address)) {
    return true;
  }

  // Check whitelist
  const creator = await prisma.whitelistedCreator.findUnique({
    where: { address: address.toLowerCase() },
  });

  return !!creator?.isWhitelisted;
}

/**
 * Check if an address is an admin
 * (Only system admin, since WhitelistedCreator doesn't have roles)
 */
export async function isAdmin(address: string | undefined | null): Promise<boolean> {
  if (!address) return false;

  // Only system admin is considered admin
  return isSystemAdmin(address);
}

/**
 * Add a new creator to whitelist (admin only)
 */
export async function addCreator(address: string) {
  return prisma.whitelistedCreator.upsert({
    where: { address: address.toLowerCase() },
    update: { isWhitelisted: true },
    create: {
      address: address.toLowerCase(),
      isWhitelisted: true,
    },
  });
}

/**
 * Remove a creator from whitelist (admin only)
 */
export async function removeCreator(address: string) {
  return prisma.whitelistedCreator.update({
    where: { address: address.toLowerCase() },
    data: { isWhitelisted: false },
  });
}

/**
 * Get all whitelisted creators
 */
export async function getAllCreators() {
  return prisma.whitelistedCreator.findMany({
    where: { isWhitelisted: true },
    orderBy: { createdAt: "desc" },
  });
}
