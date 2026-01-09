import { useQuery } from "@tanstack/react-query";
import { useReadContract, useReadContracts } from "wagmi";
import { formatEther } from "viem";
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
  return useReadContract({
    address: marketAddress,
    abi: MARKET_ABI,
    functionName: "getMarketInfo",
    query: {
      enabled: !!marketAddress,
    },
  });
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

  const { data, ...rest } = useReadContracts({
    contracts,
    query: {
      enabled: !!marketAddress && !!yesToken && !!noToken,
    },
  });

  const probabilities = data
    ? calculateProbability(
        data[0]?.result ?? 0n,
        data[1]?.result ?? 0n
      )
    : { yes: 0.5, no: 0.5 };

  return {
    ...rest,
    data: probabilities,
    yesSupply: data?.[0]?.result ?? 0n,
    noSupply: data?.[1]?.result ?? 0n,
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

  const { data, ...rest } = useReadContracts({
    contracts,
    query: {
      enabled: !!userAddress && !!yesToken && !!noToken,
    },
  });

  return {
    ...rest,
    yesBalance: data?.[0]?.result ?? 0n,
    noBalance: data?.[1]?.result ?? 0n,
  };
}


