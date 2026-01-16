import { prisma } from "@/lib/db";
import { ethers } from "ethers";

export type CreatorRole = "ADMIN" | "EDITOR";


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
  const creator = await prisma.creator.findUnique({
    where: { address: address.toLowerCase() },
  });

  return !!creator;
}

/**
 * Check if an address is an admin
 * (Either system admin or has ADMIN role in whitelist)
 */
export async function isAdmin(address: string | undefined | null): Promise<boolean> {
  if (!address) return false;

  // System admin is always admin
  if (isSystemAdmin(address)) {
    return true;
  }

  // Check whitelist for ADMIN role
  const creator = await prisma.creator.findUnique({
    where: { address: address.toLowerCase() },
  });

  return creator?.role === "ADMIN";
}

/**
 * Add a new creator to whitelist (admin only)
 */
export async function addCreator(address: string, role: CreatorRole = "EDITOR") {
  return prisma.creator.upsert({
    where: { address: address.toLowerCase() },
    update: { role },
    create: {
      address: address.toLowerCase(),
      role,
    },
  });
}

/**
 * Remove a creator from whitelist (admin only)
 */
export async function removeCreator(address: string) {
  return prisma.creator.delete({
    where: { address: address.toLowerCase() },
  });
}

/**
 * Get all whitelisted creators
 */
export async function getAllCreators() {
  return prisma.creator.findMany({
    orderBy: { createdAt: "desc" },
  });
}
