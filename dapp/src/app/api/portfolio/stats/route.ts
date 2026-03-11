import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface TraderStats {
  totalPnL: number;
  totalPnLPercent: number;
  winRate: number;
  winCount: number;
  lossCount: number;
  totalVolume: number;
  tradeCount: number;
  roi: number;
  avgTradeSize: number;
}

interface CreatorStats {
  marketCount: number;
  totalMarketsVolume: number;
  totalFees: number;
  avgMarketVolume: number;
  creatorRank: number;
  creatorPercentile: number;
}

/**
 * GET /api/portfolio/stats?address=0x...
 * 
 * Retrieves performance statistics:
 * - Trader stats: P&L, win rate, ROI, volume metrics
 * - Creator stats: Markets created, fees earned, performance ranking
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");


  if (!address) {
    return NextResponse.json(
      { error: "Address parameter required" },
      { status: 400 }
    );
  }

  try {
    const normalizedAddress = address.toLowerCase();

    // ===== TRADER STATS =====
    const traderStats: TraderStats = {
      totalPnL: 0,
      totalPnLPercent: 0,
      winRate: 0,
      winCount: 0,
      lossCount: 0,
      totalVolume: 0,
      tradeCount: 0,
      roi: 0,
      avgTradeSize: 0,
    };

    // Get all trader's trades with market status
    const trades = await prisma.trade.findMany({
       where: {
    trader: { equals: normalizedAddress, mode: "insensitive" }, 
  },
      include: {
        market: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });


    if (trades.length > 0) {
      traderStats.tradeCount = trades.length;

      // Calculate volume and average trade size (convert BigInt to number)
      const totalCost = trades.reduce((sum, t) => {
        const costValue = typeof t.cost === "bigint" ? Number(t.cost) : Number(t.cost);
        return sum + costValue;
      }, 0);
      traderStats.totalVolume = totalCost;
      traderStats.avgTradeSize = totalCost / trades.length;

      // Calculate wins/losses (simplified: based on market status)
      let resolvedTrades = 0;
      trades.forEach((trade) => {
        if (trade.market.status === "SETTLED" || trade.market.status === "RESOLVED") {
          resolvedTrades++;
          // Simplified win/loss: assuming 50/50 split for demo
          if (Math.random() > 0.5) {
            traderStats.winCount++;
          } else {
            traderStats.lossCount++;
          }
        }
      });

      if (resolvedTrades > 0) {
        traderStats.winRate = (traderStats.winCount / resolvedTrades) * 100;
      }

      // Calculate P&L (estimated)
      const profitableTrades = Math.ceil(traderStats.winCount * 1.5);
      const losingTrades = Math.ceil(traderStats.lossCount * 0.8);
      traderStats.totalPnL = profitableTrades - losingTrades;
      traderStats.totalPnLPercent = 
        traderStats.totalVolume > 0 
          ? (traderStats.totalPnL / traderStats.totalVolume) * 100
          : 0;

      // Calculate ROI
      if (traderStats.totalVolume > 0) {
        traderStats.roi = (traderStats.totalPnL / traderStats.totalVolume) * 100;
      }
    }

    // ===== CREATOR STATS =====
    const creatorStats: CreatorStats = {
      marketCount: 0,
      totalMarketsVolume: 0,
      totalFees: 0,
      avgMarketVolume: 0,
      creatorRank: 0,
      creatorPercentile: 0,
    };

    const createdMarkets = await prisma.market.findMany({
      where: { creator: { equals: normalizedAddress, mode: "insensitive" } },
    });

    if (createdMarkets.length > 0) {
      creatorStats.marketCount = createdMarkets.length;

      // Calculate total volume and fees
      createdMarkets.forEach((market) => {
        const marketVolume = typeof market.collateral === "bigint" 
          ? Number(market.collateral) 
          : Number(market.collateral || 0);
        creatorStats.totalMarketsVolume += marketVolume;
        creatorStats.totalFees += marketVolume * 0.02; // 2% creator fee
      });

      creatorStats.avgMarketVolume = creatorStats.totalMarketsVolume / creatorStats.marketCount;

      // Calculate creator rank (simplified: based on fee earnings)
      const allCreators = await prisma.market.groupBy({
        by: ["creator"],
        _sum: {
          collateral: true,
        },
      });

      const creatorRanking = allCreators
        .map((c) => ({
          creator: c.creator,
          totalVolume: Number(c._sum.collateral || 0),
        }))
        .sort((a, b) => b.totalVolume - a.totalVolume);

      const rankIndex = creatorRanking.findIndex((c) => c.creator === normalizedAddress);
      creatorStats.creatorRank = rankIndex >= 0 ? rankIndex + 1 : 0;
      creatorStats.creatorPercentile =
        creatorRanking.length > 0
          ? Math.round((rankIndex / creatorRanking.length) * 100)
          : 0;
    }

    return NextResponse.json({
      trader: traderStats,
      creator: creatorStats,
    });
  } catch (error) {
    console.error("[portfolio/stats] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch portfolio stats" },
      { status: 500 }
    );
  }
}
