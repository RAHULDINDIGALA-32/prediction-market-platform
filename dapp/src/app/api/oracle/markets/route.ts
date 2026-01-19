/**
 * @description Fetch markets filtered by oracle status (CLOSED, DISPUTED, RESOLVED)
 * Determines status based on OracleEvent table and current market state
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status"); // CLOSED, DISPUTED, RESOLVED
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    // Fetch markets with their oracle events
    const markets = await prisma.market.findMany({
      where: {
        AND: [
          // Only include markets in CLOSED, RESOLVED, or SETTLED state (no trading)
          {
            status: {
              in: ["CLOSED", "RESOLVED", "SETTLED"],
            },
          },
          category ? { category: category } : {},
          search
            ? {
                OR: [
                  { id: { contains: search, mode: "insensitive" } },
                  { title: { contains: search, mode: "insensitive" } },
                  { contractAddress: { contains: search, mode: "insensitive" } },
                ],
              }
            : {},
        ],
      },
      include: {
        oracleEvents: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1, // Get the latest oracle event
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Determine oracle status (off-chain convenience)
    const enrichedMarkets = markets.map((market) => {
      const latestEvent = market.oracleEvents[0];
      let oracleStatus: "CLOSED" | "DISPUTED" | "RESOLVED" = "CLOSED";

      if (latestEvent) {
        if (latestEvent.finalized) {
          oracleStatus = "RESOLVED";
        } else if (latestEvent.disputed) {
          oracleStatus = "DISPUTED";
        }
      }

      return {
        ...market,
        oracleStatus,
        latestOracleEvent: latestEvent || null,
      };
    });

    // Filter by oracle status if specified
    const filtered =
      status && ["CLOSED", "DISPUTED", "RESOLVED"].includes(status)
        ? enrichedMarkets.filter((m) => m.oracleStatus === status)
        : enrichedMarkets;

    return NextResponse.json(filtered);
  } catch (error) {
    console.error("Error fetching oracle markets:", error);
    return NextResponse.json(
      { error: "Failed to fetch markets" },
      { status: 500 }
    );
  }
}
