import { useReadContract, useReadContracts, useBalance } from "wagmi";
import { calculateProbability } from "@/lib/utils";

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
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

export function useMarketInfo(marketAddress?: `0x${string}`) {
  const result = useReadContract({
    address: marketAddress,
    abi: MARKET_ABI,
    functionName: "getMarketInfo",
    query: {
      enabled: !!marketAddress,
    },
  });

  console.log("Market Info Data (utility):", result);

  return result;
}

export function useMarketProbabilities(
  marketAddress?: `0x${string}`,
  yesToken?: `0x${string}`,
  noToken?: `0x${string}`
) {
  const contracts = [
    {
      address: yesToken,
      abi: ERC20_ABI,
      functionName: "totalSupply" as const,
    },
    {
      address: noToken,
      abi: ERC20_ABI,
      functionName: "totalSupply" as const,
    },
  ].filter((c) => c.address) as Array<{
    address: `0x${string}`;
    abi: typeof ERC20_ABI;
    functionName: "totalSupply";
  }>;

  const { data, refetch, ...rest } = useReadContracts({
    contracts,
    query: {
      enabled: !!marketAddress && !!yesToken && !!noToken,
      refetchInterval: 10000, // Refetch every 10 seconds
      staleTime: 5000, // Consider data stale after 5 seconds
    },
  });

  console.log("Market Probabilities Data (utility):", data);
  
  const yesSupply = data?.[0]?.result ?? 0n;
  const noSupply = data?.[1]?.result ?? 0n;

  const probabilities = calculateProbability(yesSupply, noSupply);

  return {
    data: probabilities,
    yesSupply,
    noSupply,
    refetch,
    ...rest,
  };
}

export function useUserPositions(
  userAddress?: `0x${string}`,
  yesToken?: `0x${string}`,
  noToken?: `0x${string}`
) {
  const contracts = [
    {
      address: yesToken,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: [userAddress!],
    },
    {
      address: noToken,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: [userAddress!],
    },
  ].filter((c) => c.address && userAddress) as Array<{
    address: `0x${string}`;
    abi: typeof ERC20_ABI;
    functionName: "balanceOf";
    args: [`0x${string}`];
  }>;

  const { data, refetch, ...rest } = useReadContracts({
    contracts,
    query: {
      enabled: !!userAddress && !!yesToken && !!noToken,
      refetchInterval: 10000, // Refetch every 10 seconds
      staleTime: 5000, // Consider data stale after 5 seconds
    },
  });

  console.log("User Positions Data (utility):", data);

  const yesBalance = data?.[0]?.result ?? 0n;
  const noBalance = data?.[1]?.result ?? 0n;

  return {
    yesBalance,
    noBalance,
    refetch,
    ...rest,
  };
}

/**
 * Hook to fetch ETH balance for a wallet address
 * Returns balance in wei
 */
export function useEthBalance(userAddress?: `0x${string}`) {
  const { data, refetch, ...rest } = useBalance({
    address: userAddress,
    query: {
      enabled: !!userAddress,
      refetchInterval: 10000, // Refetch every 10 seconds
      staleTime: 5000, // Consider data stale after 5 seconds
    },
  });

  return {
    balance: data?.value ?? 0n,
    refetch,
    ...rest,
  };
}