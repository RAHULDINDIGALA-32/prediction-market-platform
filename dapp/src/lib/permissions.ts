import { prisma } from "@/lib/db";

export type CreatorRole = "ADMIN" | "EDITOR";

/**
 * Check if an address is authorized to create markets
 */
export async function isAuthorizedCreator(address: string): Promise<boolean> {
  if (!address) return false;

  const creator = await prisma.creator.findUnique({
    where: { address: address.toLowerCase() },
  });

  return !!creator;
}

/**
 * Check if an address is an admin
 */
export async function isAdmin(address: string): Promise<boolean> {
  if (!address) return false;

  const creator = await prisma.creator.findUnique({
    where: { address: address.toLowerCase() },
  });

  return creator?.role === "ADMIN";
}

/**
 * Add a new creator
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
 * Remove a creator
 */
export async function removeCreator(address: string) {
  return prisma.creator.delete({
    where: { address: address.toLowerCase() },
  });
}

