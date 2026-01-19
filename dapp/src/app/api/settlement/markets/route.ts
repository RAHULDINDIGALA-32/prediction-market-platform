/**
 * @description Fetch markets filtered by settlement status (RESOLVED, SETTLED)
 * RESOLVED: Oracle outcome finalized, redemption period open (30 days)
 * SETTLED: Redemption period closed, creators can withdraw
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status"); // RESOLVED, SETTLED
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    // Fetch markets with their oracle events
    const markets = await prisma.market.findMany({
      where: {
        AND: [
          // Only include markets in RESOLVED or SETTLED state
          {
            status: {
              in: ["RESOLVED", "SETTLED"],
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

    // Return markets enriched with settlement status and resolved time
    const enrichedMarkets = markets.map((market) => {
      const latestEvent = market.oracleEvents[0];
      const resolvedAt = latestEvent?.finalizedAt ? Math.floor(latestEvent.finalizedAt.getTime() / 1000) : 0;
      const redemptionPeriodSeconds = 30 * 24 * 60 * 60; // 30 days
      const redemptionEndsAt = resolvedAt + redemptionPeriodSeconds;
      const currentTime = Math.floor(Date.now() / 1000);

      // Determine settlement status based on redemption window
      let settlementStatus: "RESOLVED" | "SETTLED" = "RESOLVED";
      if (market.status === "SETTLED" || currentTime >= redemptionEndsAt) {
        settlementStatus = "SETTLED";
      }

      return {
        ...market,
        settlementStatus,
        resolvedAt,
        redemptionEndsAt,
        latestOracleEvent: latestEvent || null,
      };
    });

    // Filter by settlement status if specified
    const filtered =
      status && ["RESOLVED", "SETTLED"].includes(status)
        ? enrichedMarkets.filter((m) => m.settlementStatus === status)
        : enrichedMarkets;

    return NextResponse.json(filtered);
  } catch (error) {
    console.error("Error fetching settlement markets:", error);
    return NextResponse.json(
      { error: "Failed to fetch markets" },
      { status: 500 }
    );
  }
}
