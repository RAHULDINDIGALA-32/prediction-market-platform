import { prisma } from "@/lib/db";
import MarketCard from "@/components/MarketCard";
import AppShell from "@/components/AppShell";

async function getMarkets() {
  try {
    const markets = await prisma.market.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return markets;
  } catch (error) {
    // Silently return empty array if database is not available
    // This allows the app to run even if DB credentials are not set up yet
    if (process.env.NODE_ENV === "development") {
      console.warn("Database query failed:", error instanceof Error ? error.message : "Unknown error");
    }
    return [];
  }
}

export default async function Home() {
  const markets = await getMarkets();

  return (
    <AppShell>
      <section className="mb-8 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Markets
        </h1>
        <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Browse active binary markets, inspect pricing, and trade using signed
          off-chain quotes executed on-chain through the LMSR engine.
        </p>
      </section>

      <div className="grid gap-4">
        {markets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
            No markets found in the database yet. Once markets are created and
            synced, they will appear here for trading.
          </div>
        ) : (
          markets.map((m: any) => {
            return (
              <MarketCard
                key={m.id}
                market={{
                  id: m.id,
                  status: m.status,
                  collateral: m.collateral,
                  contractAddress: m.contractAddress ?? undefined,
                  createdAt: m.createdAt,
                }}
              />
            );
          })
        )}
      </div>
    </AppShell>
  );
}
