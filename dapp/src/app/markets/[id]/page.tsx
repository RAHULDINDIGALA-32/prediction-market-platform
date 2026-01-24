import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import NavBar from "@/components/NavBar";
import MarketDetailClient from "@/components/MarketDetailClient";
//import { Decimal } from "@prisma/client/runtime/library";

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
    
    if (!market) return null;
    
    // Convert Decimal fields to strings for client component serialization
    return {
      ...market,
      qYes: market.qYes.toString(),
      qNo: market.qNo.toString(),
      lmsrB: market.lmsrB.toString(),
      collateral: market.collateral.toString(),
      subsidyAmount: market.subsidyAmount ? market.subsidyAmount.toString() : null,
      trades: market.trades.map(trade => ({
        ...trade,
        //priceYes: trade.priceYes.toString(),
        //priceNo: trade.priceNo.toString(),
        amount: trade.amount.toString(),
        cost: trade.cost.toString(),
      })),
    };
  } catch {
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


