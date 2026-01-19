"use client";

import { useAccount } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatEth, formatAddress, calculateProbability } from "@/lib/utils";
import { useReadContracts } from "wagmi";
import { 
  Loader2, 
  TrendingUp, 
  Percent,
  BarChart3,
  Award,
  Target,
  Calendar,
  Eye,
  Zap,
  DollarSign,
  Users,
  Activity,
  Volume2,
  Clock
} from "lucide-react";
import Link from "next/link";

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
      { name: "isExpired_", type: "bool" },
      { name: "isClosed_", type: "bool" },
    ],
  },
] as const;

async function getUserPortfolio(address: string) {
  const res = await fetch(`/api/portfolio?address=${address}`);
  if (!res.ok) return { trader: [], creator: [] };
  const data = await res.json();
  
  // Parse string values back to numbers for calculations
  const parseMarkets = (markets: any[]) =>
    markets.map((m: any) => ({
      ...m,
      amount: typeof m.amount === "string" ? BigInt(m.amount) : m.amount,
      cost: typeof m.cost === "string" ? BigInt(m.cost) : m.cost,
      collateral: typeof m.collateral === "string" ? BigInt(m.collateral) : m.collateral,
      subsidyAmount: typeof m.subsidyAmount === "string" ? BigInt(m.subsidyAmount) : m.subsidyAmount,
      endTime: typeof m.endTime === "string" ? BigInt(m.endTime) : m.endTime,
    }));
  
  return {
    trader: data.trader ? parseMarkets(data.trader) : [],
    creator: data.creator ? parseMarkets(data.creator) : [],
  };
}

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
  positions: any[]; 
  stats: any; 
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
              value={stats.totalVolume ? formatEth(BigInt(Math.floor(stats.totalVolume * 1e18)), 2) : "0 ETH"}
              icon={<Volume2 className="h-4 w-4" />}
              subtext={`${stats.tradeCount || 0} trades`}
            />

            {/* ROI */}
            <MetricCard
              label="ROI"
              value={stats.roi ? `${stats.roi.toFixed(1)}%` : "0%"}
              icon={<Target className="h-4 w-4" />}
              subtext={stats.avgTradeSize ? `${formatEth(BigInt(Math.floor(stats.avgTradeSize * 1e18)), 2)} avg` : "N/A"}
            />
          </div>
        )}
      </div>

      {/* Active Positions */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Active Positions</h3>
        <div className="space-y-3">
          {positions.map((market: any) => (
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
  stats, 
  userAddress 
}: { 
  markets: any[]; 
  stats: any; 
  userAddress: string;
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
              subtext={stats.totalMarketsVolume ? formatEth(BigInt(Math.floor(stats.totalMarketsVolume * 1e18)), 2) : "0 ETH"}
            />

            {/* Total Fees */}
            <MetricCard
              label="Fees Earned"
              value={stats.totalFees ? `${stats.totalFees.toFixed(3)} ETH` : "0 ETH"}
              icon={<DollarSign className="h-4 w-4" />}
              trend="up"
              subtext="2% of volume"
            />

            {/* Avg Market Volume */}
            <MetricCard
              label="Avg Market Volume"
              value={stats.avgMarketVolume ? formatEth(BigInt(Math.floor(stats.avgMarketVolume * 1e18)), 2) : "0 ETH"}
              icon={<BarChart3 className="h-4 w-4" />}
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
          {markets.map((market: any) => (
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
function TraderPositionCard({ market, userAddress }: { market: any; userAddress: string }) {
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

  const probabilities = calculateProbability(market.qYes, market.qNo);
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
                  <p className="font-mono font-medium">{formatEth(positionBalance, 4)}</p>
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
function CreatorMarketCard({ market }: { market: any }) {
  const probabilities = calculateProbability(market.qYes, market.qNo);
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
                  <p className="font-mono font-medium">{formatEth(BigInt(Math.floor(totalVolume * 1e18)), 2)}</p>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400 text-xs">Fees Earned</span>
                  <p className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                    +{creatorFees.toFixed(3)} ETH
                  </p>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400 text-xs">YES Prob</span>
                  <p className="font-mono font-medium">{(probabilities.yes * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <span className="text-zinc-600 dark:text-zinc-400 text-xs">Liquidity</span>
                  <p className="font-mono font-medium">{formatEth(BigInt(Math.floor(Number(market.subsidyAmount || 0) * 1e18)), 2)}</p>
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
            <div className="flex gap-3 justify-center">
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
          userAddress={address!}
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
