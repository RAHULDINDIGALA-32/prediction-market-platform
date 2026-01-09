import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Address required" }, { status: 400 });
  }

  try {
    // Get markets where user has traded
    const trades = await prisma.trade.findMany({
      where: {
        trader: address.toLowerCase(),
      },
      select: {
        marketId: true,
      },
      distinct: ["marketId"],
    });

    const marketIds = trades.map((t) => t.marketId);

    if (marketIds.length === 0) {
      return NextResponse.json([]);
    }

    const markets = await prisma.market.findMany({
      where: {
        id: {
          in: marketIds,
        },
      },
    });

    return NextResponse.json(markets);
  } catch (error) {
    console.error("Portfolio fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch portfolio" }, { status: 500 });
  }
}


