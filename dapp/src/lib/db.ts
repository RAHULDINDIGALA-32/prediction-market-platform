import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient instance in dev to avoid exhausting DB connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Test database connection on startup (optional, helps catch connection issues early)
if (process.env.NODE_ENV === "development") {
  prisma.$connect().catch((err) => {
    console.warn(
      "⚠️  Database connection warning:",
      err instanceof Error ? err.message : "Unknown error"
    );
    console.warn(
      "💡 Make sure DATABASE_URL in .env.local is correctly configured for your Supabase database."
    );
  });
}

