import { prisma } from "@/lib/db";
import NavBar from "@/components/NavBar";
import MarketsListClient from "@/components/MarketsListClient";

async function getMarkets() {
  try {
    const markets = await prisma.market.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    
    // Convert Decimal fields to strings and bigint to number for client component serialization
    return markets.map(market => ({
      ...market,
      qYes: market.qYes.toString(),
      qNo: market.qNo.toString(),
      lmsrB: market.lmsrB.toString(),
      collateral: market.collateral.toString(),
      subsidyAmount: market.subsidyAmount ? market.subsidyAmount.toString() : null,
      endTime: market.endTime ? Number(market.endTime) : null,
    }));
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("Database query failed:", error instanceof Error ? error.message : "Unknown error");
    }
    return [];
  }
}

export default async function Home() {
  const markets = await getMarkets();

  return (
    <NavBar>
      <section className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
            Prediction Markets
          </h1>
          <p className="max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Discover and trade on binary prediction markets. View probabilities, volume, and time remaining at a glance.
          </p>
      </section>

      <MarketsListClient initialMarkets={markets} />
    </NavBar>
  );
}
