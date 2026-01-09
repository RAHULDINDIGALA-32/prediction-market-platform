import { prisma } from "@/lib/db";
import NavBar from "@/components/NavBar";
import SettlementClient from "@/components/SettlementClient";
import { notFound } from "next/navigation";

async function getMarket(id: string) {
  try {
    const market = await prisma.market.findUnique({
      where: { id },
    });
    return market;
  } catch (error) {
    return null;
  }
}

export default async function SettlementPage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string }>;
}) {
  const params = await searchParams;
  const marketId = params.market;

  if (!marketId) {
    return (
      <NavBar>
        <SettlementClient />
      </NavBar>
    );
  }

  const market = await getMarket(marketId);

  if (!market) {
    notFound();
  }

  return (
    <NavBar>
      <SettlementClient market={market} />
    </NavBar>
  );
}
