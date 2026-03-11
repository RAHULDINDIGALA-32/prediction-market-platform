"use client";

import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEth, calculateProbability } from "@/lib/utils";
import { useReadContracts } from "wagmi";
import { 
  Loader2, 
  TrendingUp, 
  Percent,
  Award,
  Target,
  Calendar,
  Zap,
  DollarSign,
  Users,
  Activity,
  ChartNoAxesCombined,
  Clock
} from "lucide-react";
import Link from "next/link";
import { formatUnits } from "ethers";

// Type definitions for portfolio data
interface TraderPosition {
  id: string;
  contractAddress?: string;
  title?: string;
  category: string;
  status: string;
  amount: bigint;
  cost: bigint;
  collateral: bigint;
  subsidyAmount?: bigint;
  endTime?: bigint;
  qYes: number;
  qNo: number;
}

interface CreatorMarket {
  id: string;
  title?: string;
  category: string;
  status: string;
  collateral: bigint;
  subsidyAmount?: bigint;
  createdAt: string;
  endTime?: bigint;
  qYes: number;
  qNo: number;
}

interface TraderStats {
  totalPnL: number;
  totalPnLPercent: number;
  winRate: number;
  totalVolume: number;
  roi: number;
  avgTradeSize: number;
  winCount?: number;
  lossCount?: number;
  tradeCount?: number;
}

interface CreatorStats {
  marketCount?: number;
  totalMarketsVolume: number;
  totalFees: number;
  avgMarketVolume: number;
  creatorRank?: number;
  creatorPercentile?: number;
}

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const MARKET_ABI = [
  {
    type: "function",
    name: "getMarketInfo",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "state_", type: "uint8" },
      { name: "endTime_", type: "uint256" },
      { name: "yesToken_", type: "address" },
      { name: "noToken_", type: "address" },
      { name: "vault_", type: "address" },
      { name: "lmsrB_", type: "uint256" },
      { name: "isClosed_", type: "bool" },
    ],
  },
] as const;

async function getUserPortfolio(address: string): Promise<{ trader: TraderPosition[]; creator: CreatorMarket[] }> {
  try {
    const res = await fetch(`/api/portfolio?address=${address}`);
    if (!res.ok) {
      console.error("[getUserPortfolio] Failed to fetch portfolio:", res.status);
      return { trader: [], creator: [] };
    }
    const data = await res.json();

    const parseResult = {
      trader: data.trader ? parseTraderMarkets(data.trader) : [],
      creator: data.creator ? parseCreatorMarkets(data.creator) : [],
    };
    
    return parseResult;
  } catch (error) {
    console.error("[getUserPortfolio] Error parsing portfolio data:", error);
    return { trader: [], creator: [] };
  }
}


const decimalToBigInt = (val: unknown): bigint => {
  if (val === null || val === undefined) return 0n;
  const num = Math.floor(Number(String(val)));
  return BigInt(num);
};

const parseTraderMarkets = (markets: Array<Record<string, unknown>>): TraderPosition[] =>
  markets.map((m) => {
    // Handle subsidyAmount - convert decimal to wei
    let subsidyAmountBigInt: bigint | undefined;
    if (m.subsidyAmount) {
      const subsidyVal = typeof m.subsidyAmount === "string" ? parseFloat(m.subsidyAmount) : Number(m.subsidyAmount);
      subsidyAmountBigInt = BigInt(Math.floor(subsidyVal * 1e18));
    }

    return {
      id: String(m.id || ''),
      contractAddress: m.contractAddress ? String(m.contractAddress) : undefined,
      title: m.title ? String(m.title) : undefined,
      category: String(m.category || ''),
      status: String(m.status || ''),
      amount: decimalToBigInt(m.amount),        
      cost: decimalToBigInt(m.cost),          
      collateral: decimalToBigInt(m.collateral),
      subsidyAmount: subsidyAmountBigInt,
      endTime: m.endTime ? BigInt(String(m.endTime)) : undefined,
      qYes: Number(m.qYes || 0),
      qNo: Number(m.qNo || 0),
    };
  });

  const parseCreatorMarkets = (markets: Array<Record<string, unknown>>): CreatorMarket[] => {
   // console.log("[parseCreatorMarkets] Parsing markets:", markets);
    const parsed = markets.map((m: Record<string, unknown>) => {
      try {
        // Handle subsidyAmount - convert to integer by multiplying by 1e18 if it's decimal
        let subsidyAmountBigInt: bigint | undefined;
        if (m.subsidyAmount) {
          const subsidyVal = typeof m.subsidyAmount === "string" ? parseFloat(m.subsidyAmount) : Number(m.subsidyAmount);
          // Convert to wei (multiply by 1e18)
          subsidyAmountBigInt = BigInt(Math.floor(subsidyVal * 1e18));
        }

        return {
          id: String(m.id || ''),
          title: m.title ? String(m.title) : undefined,
          category: String(m.category || ''),
          status: String(m.status || ''),
          collateral: typeof m.collateral === "string" ? BigInt(m.collateral) : BigInt(m.collateral as number || 0),
          subsidyAmount: subsidyAmountBigInt,
          createdAt: String(m.createdAt || ''),
          endTime: m.endTime ? (typeof m.endTime === "string" ? BigInt(m.endTime) : BigInt(m.endTime as number)) : undefined,
          qYes: Number(m.qYes || 0),
          qNo: Number(m.qNo || 0),
        };
      } catch (error) {
        console.error("[parseCreatorMarkets] Error parsing market:", m, error);
        throw error;
      }
    });
    // console.log("[parseCreatorMarkets] Parsed result:", parsed);
    return parsed;
  };

  

async function getUserStats(address: string) {
  const res = await fetch(`/api/portfolio/stats?address=${address}`);
  if (!res.ok) return null;
  const data = await res.json();
  
  // Ensure numeric values are properly typed
  return {
    trader: data.trader ? {
      ...data.trader,
      totalPnL: Number(data.trader.totalPnL),
      totalPnLPercent: Number(data.trader.totalPnLPercent),
      winRate: Number(data.trader.winRate),
      totalVolume: Number(data.trader.totalVolume),
      roi: Number(data.trader.roi),
      avgTradeSize: Number(data.trader.avgTradeSize),
    } : null,
    creator: data.creator ? {
      ...data.creator,
      totalMarketsVolume: Number(data.creator.totalMarketsVolume),
      totalFees: Number(data.creator.totalFees),
      avgMarketVolume: Number(data.creator.avgMarketVolume),
    } : null,
  };
}

/**
 * TRADER PORTFOLIO SECTION
 */
function TraderPortfolioSection({
  positions,
  stats,
  userAddress
}: {
  positions: TraderPosition[];
  stats: TraderStats | null;
  userAddress: string;
}) {
  if (!positions || positions.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-200 dark:border-zinc-800 pb-4">
        <h2 className="text-2xl font-bold tracking-tight mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-blue-500" />
          Trader Portfolio
        </h2>

        {/* Key Metrics Row */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Total P&L */}
            <MetricCard
              label="Total P&L"
              value={stats.totalPnL ? `${stats.totalPnL.toFixed(2)} ETH` : "$0.00"}
              icon={<DollarSign className="h-4 w-4" />}
              trend={stats.totalPnL > 0 ? "up" : "down"}
              subtext={stats.totalPnLPercent ? `${stats.totalPnLPercent.toFixed(1)}%` : "0%"}
            />

            {/* Win Rate */}
            <MetricCard
              label="Win Rate"
              value={stats.winRate ? `${stats.winRate.toFixed(1)}%` : "0%"}
              icon={<Percent className="h-4 w-4" />}
              subtext={`${stats.winCount || 0}W/${stats.lossCount || 0}L`}
            />

            {/* Total Volume */}
            <MetricCard
              label="Total Volume"
              value={stats.totalVolume ? formatEth(BigInt(Math.floor(stats.totalVolume)), 4) : "0 ETH"}
              icon={<ChartNoAxesCombined className="h-4 w-4" />}
              subtext={`${stats.tradeCount || 0} trades`}
            />

            {/* ROI */}
            <MetricCard
              label="ROI"
              value={stats.roi ? `${stats.roi.toFixed(1)}%` : "0%"}
              icon={<Target className="h-4 w-4" />}
              subtext={stats.avgTradeSize ? `${formatEth(BigInt(Math.floor(stats.avgTradeSize)), 4)} avg` : "N/A"}
            />
          </div>
        )}
      </div>

      {/* Active Positions */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Active Positions</h3>
        <div className="space-y-3">
          {positions.map((market: TraderPosition) => (
            <TraderPositionCard key={market.id} market={market} userAddress={userAddress} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * CREATOR PORTFOLIO SECTION
 */
function CreatorPortfolioSection({
  markets,
  stats
}: {
  markets: CreatorMarket[];
  stats: CreatorStats | null;
}) {
  if (!markets || markets.length === 0) return null;

  return (
    <div className="space-y-6 mb-8 pb-8 border-b border-zinc-200 dark:border-zinc-800">
      <div>
        <h2 className="text-2xl font-bold tracking-tight mb-4 flex items-center gap-2">
          <Award className="h-5 w-5 text-amber-500" />
          Creator Dashboard
        </h2>

        {/* Creator Metrics Row */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {/* Markets Created */}
            <MetricCard
              label="Markets Created"
              value={stats.marketCount?.toString() || "0"}
              icon={<Zap className="h-4 w-4" />}
              subtext={stats.totalMarketsVolume ? formatEth(BigInt(Math.floor(stats.totalMarketsVolume)), 4) : "0 ETH"}
            />

            {/* Total Fees */}
            <MetricCard
              label="Fees Earned"
              value={stats.totalFees ? formatEth(BigInt(Math.floor(stats.totalFees)), 4) : "0 ETH"}
              icon={<DollarSign className="h-4 w-4" />}
              trend="up"
              subtext="2% of volume"
            />

            {/* Avg Market Volume */}
            <MetricCard
              label="Avg Market Volume"
              value={stats.avgMarketVolume ? formatEth(BigInt(Math.floor(stats.avgMarketVolume)), 4) : "0 ETH"}
              icon={<ChartNoAxesCombined className="h-4 w-4" />}
            />

            {/* Creator Rank */}
            <MetricCard
              label="Creator Rank"
              value={stats.creatorRank?.toString() || "N/A"}
              icon={<Users className="h-4 w-4" />}
              subtext={stats.creatorPercentile ? `Top ${stats.creatorPercentile}%` : "Unranked"}
            />
          </div>
        )}
      </div>

      {/* Created Markets */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Markets You Created</h3>
        <div className="space-y-3">
          {markets.map((market: CreatorMarket) => (
            <CreatorMarketCard key={market.id} market={market} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable Metric Card Component
 */
function MetricCard({ 
  label, 
  value, 
  icon, 
  trend, 
  subtext 
}: { 
  label: string; 
  value: string; 
  icon: React.ReactNode; 
  trend?: "up" | "down"; 
  subtext?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">{label}</span>
        <div className="text-zinc-400">{icon}</div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold">{value}</span>
        {trend && (
          <span className={`text-xs font-medium ${trend === "up" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {trend === "up" ? "↑" : "↓"}
          </span>
        )}
      </div>
      {subtext && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{subtext}</p>}
    </div>
  );
}

/**
 * Trader Position Card - Individual position display
 * Shows: Market title, position (YES/NO), amount, entry price, current price, P&L
 */
function TraderPositionCard({ market, userAddress }: { market: TraderPosition; userAddress: string }) {
  const marketAddress = market.contractAddress as `0x${string}` | undefined;

  const { data: marketInfo } = useReadContracts({
    contracts: marketAddress
      ? [
          {
            address: marketAddress,
            abi: MARKET_ABI,
            functionName: "getMarketInfo" as const,
          },
        ]
      : [],
  });

  const marketInfoResult = marketInfo?.[0]?.result;
  const yesToken = marketInfoResult?.[2] as `0x${string}` | undefined;
  const noToken = marketInfoResult?.[3] as `0x${string}` | undefined;

  const { data: balances } = useReadContracts({
    contracts: [
      {
        address: yesToken!,
        abi: ERC20_ABI,
        functionName: "balanceOf" as const,
        args: [userAddress as `0x${string}`],
      },
      {
        address: noToken!,
        abi: ERC20_ABI,
        functionName: "balanceOf" as const,
        args: [userAddress as `0x${string}`],
      },
    ].filter((c) => c.address),
  });

  const yesBalance = balances?.[0]?.result ?? 0n;
  const noBalance = balances?.[1]?.result ?? 0n;

  const hasYesPosition = yesBalance > 0n;
  const hasNoPosition = noBalance > 0n;

  if (!hasYesPosition && !hasNoPosition) return null;

  const probabilities = calculateProbability(BigInt(market.qYes), BigInt(market.qNo));
  const positionBalance = hasYesPosition ? yesBalance : noBalance;
  const positionSide = hasYesPosition ? "YES" : "NO";
  const entryPrice = hasYesPosition ? probabilities.yes : probabilities.no;
  
  // Calculate estimated current value and P&L
  const positionValue = (Number(positionBalance) / 1e18) * 1; // Simplified: 1 token = 1 ETH at resolution
  const estimatedPnL = positionValue - (Number(positionBalance) / 1e18) * entryPrice;

  return (
    <Link href={`/markets/${market.id}`}>
      <Card className="hover:shadow-md transition-all cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={positionSide === "YES" ? "default" : "secondary"}>
                  {positionSide}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {market.category}
                </Badge>
              </div>
              <p className="font-semibold mb-1 line-clamp-2">{market.title || `Market ${market.id.slice(0, 8)}`}</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">Amount</span>
                  <p className="font-mono font-medium">{formatUnits(positionBalance, 18)} {positionSide} Tokens</p>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">Entry Price</span>
                  <p className="font-mono font-medium">{(entryPrice * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400">Est. P&L</span>
                  <p className={`font-mono font-medium ${estimatedPnL > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {estimatedPnL > 0 ? "+" : ""}{estimatedPnL.toFixed(4)} ETH
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant="outline" className="text-xs">
                {market.status}
              </Badge>
              {market.endTime && (
                <div className="flex items-center gap-1 text-xs text-zinc-500">
                  <Clock className="h-3 w-3" />
                  {new Date(Number(market.endTime) * 1000).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Creator Market Card - Shows market created by user
 * Shows: Market title, status, volume, participants, fees
 */
function CreatorMarketCard({ market }: { market: CreatorMarket }) {
  const probabilities = calculateProbability(BigInt(market.qYes), BigInt(market.qNo));
  const totalVolume = Number(market.collateral) || 0;
  const creatorFees = totalVolume * 0.02; // 2% fee

  return (
    <Link href={`/markets/${market.id}`}>
      <Card className="hover:shadow-md transition-all cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-xs">
                  {market.category}
                </Badge>
                <Badge variant={market.status === "OPEN" ? "default" : "secondary"}>
                  {market.status}
                </Badge>
              </div>
              <p className="font-semibold mb-3 line-clamp-2">{market.title || `Market ${market.id.slice(0, 8)}`}</p>
              
              {/* Market Stats Grid */}
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400 text-xs">Volume</span>
                  <p className="font-mono font-medium">{formatEth(BigInt(Math.floor(totalVolume)), 4)}</p>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400 text-xs">Fees Earned</span>
                  <p className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                    +{formatEth(BigInt(Math.floor(creatorFees)), 4)}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400 text-xs">YES Prob</span>
                  <p className="font-mono font-medium">{(probabilities.yes * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400 text-xs">Subsidy Amount</span>
                  <p className="font-mono font-medium">{formatEth(market.subsidyAmount || 0n, 4)}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-1 text-xs text-zinc-500">
                <Calendar className="h-3 w-3" />
                {new Date(market.createdAt).toLocaleDateString()}
              </div>
              <Button size="sm" variant="outline">
                Manage
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * Main Portfolio Client Component
 */
export default function PortfolioClient() {
  const { address, isConnected } = useAccount();

  const { data: portfolioData, isLoading: portfolioLoading } = useQuery({
    queryKey: ["portfolio", address],
    queryFn: () => getUserPortfolio(address!),
    enabled: !!address && isConnected,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["portfolio-stats", address],
    queryFn: () => getUserStats(address!),
    enabled: !!address && isConnected,
  });

  const isLoading = portfolioLoading || statsLoading;

  if (!isConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Portfolio</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            View your trading positions, performance metrics, and created markets
          </p>
        </div>
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Activity className="h-8 w-8 mx-auto text-zinc-400 mb-3" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
              Connect your wallet to view your portfolio
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Portfolio</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Fetching your portfolio data...
          </p>
        </div>
        <Card>
          <CardContent className="p-12 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-zinc-400" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasTraderPositions = portfolioData?.trader && Array.isArray(portfolioData.trader) && portfolioData.trader.length > 0;
  const hasCreatorMarkets = portfolioData?.creator && Array.isArray(portfolioData.creator) && portfolioData.creator.length > 0;


  if (!hasTraderPositions && !hasCreatorMarkets) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Portfolio</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            View your trading positions, performance metrics, and created markets
          </p>
        </div>
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Activity className="h-8 w-8 mx-auto text-zinc-400 mb-3" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
              No trading positions or created markets yet. Start trading or creating markets!
            </p>
            <div className="flex gap-3 justify-center ">
              <Link href="/">
                <Button>Browse Markets</Button>
              </Link>
  
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Portfolio</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {hasCreatorMarkets 
            ? "View your trading positions and created markets"
            : "View your trading positions and performance metrics"
          }
        </p>
      </div>

      {/* Show Creator Section if applicable */}
      {hasCreatorMarkets && (
        <CreatorPortfolioSection
          markets={portfolioData.creator}
          stats={stats?.creator}
        />
      )}

      {/* Show Trader Section */}
      {hasTraderPositions && (
        <TraderPortfolioSection 
          positions={portfolioData.trader}
          stats={stats?.trader}
          userAddress={address!}
        />
      )}
    </div>
  );
}
