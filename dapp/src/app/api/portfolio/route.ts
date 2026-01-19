import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Market, Trade, RedemptionEvent } from "@prisma/client";

// Extended market type to include relations
type MarketWithRelations = Market & {
  trades: Trade[];
  redemptionEvents: RedemptionEvent[];
};

/**
 * GET /api/portfolio?address=0x...
 * 
 * Retrieves comprehensive portfolio data:
 * - trader: Markets where user has active positions (shows with status regardless of resolution)
 * - creator: Markets created by user (shows with status regardless of resolution)
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Address required" }, { status: 400 });
  }

  try {
    const normalizedAddress = address.toLowerCase();

    // Fetch trader positions: Get markets where user has trades
    // Shows all market statuses (OPEN, CLOSED, RESOLVED, SETTLED)
    const traderTrades = await prisma.trade.findMany({
      where: {
        trader: normalizedAddress,
      },
      select: {
        marketId: true,
      },
      distinct: ["marketId"],
    });

    const traderMarketIds = traderTrades.map((t) => t.marketId);

    const traderMarkets: MarketWithRelations[] = [];
    if (traderMarketIds.length > 0) {
      const fetchedMarkets = await prisma.market.findMany({
        where: {
          id: {
            in: traderMarketIds,
          },
        },
        include: {
          trades: {
            where: { trader: normalizedAddress },
            select: {
              id: true,
              side: true,
              amount: true,
              cost: true,
              createdAt: true,
            },
          },
          redemptionEvents: {
            where: { user: normalizedAddress },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
      
      // Cast to proper type - includes all market statuses
      traderMarkets.push(...(fetchedMarkets as MarketWithRelations[]));
    }

    // Fetch creator markets: Markets created by user
    // Shows all market statuses (OPEN, CLOSED, RESOLVED, SETTLED)
    const creatorMarkets: MarketWithRelations[] = await prisma.market.findMany({
      where: {
        creator: normalizedAddress,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }) as MarketWithRelations[];

    // Helper to serialize BigInt values to strings
    const serializeData = (data: any) => {
      return JSON.parse(
        JSON.stringify(data, (key, value) =>
          typeof value === "bigint" ? value.toString() : value
        )
      );
    };

    return NextResponse.json({
      trader: serializeData(traderMarkets),
      creator: serializeData(creatorMarkets),
    });
  } catch (error) {
    console.error("Portfolio fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch portfolio" },
      { status: 500 }
    );
  }
}


