import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import NavBar from "@/components/NavBar";
import MarketDetailClient from "@/components/MarketDetailClient";

async function getMarket(id: string) {
  try {
    const market = await prisma.market.findUnique({
      where: { id },
      include: {
        trades: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });
    return market;
  } catch (error) {
    return null;
  }
}

export default async function MarketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const market = await getMarket(id);

  if (!market) {
    notFound();
  }

  return (
    <NavBar>
      <MarketDetailClient market={market} />
    </NavBar>
  );
}


