import { getPublicClient } from '@wagmi/core';
import { config } from '@/components/WalletProviders';
import { keccak256, AbiCoder, recoverAddress } from "ethers";
import { TypedDataEncoder } from "ethers";


const abi = AbiCoder.defaultAbiCoder();

const TRADE_QUOTE_TYPEHASH = keccak256(
  new TextEncoder().encode(
    "TradeQuote(address trader,address market,Outcome outcome,uint256 amount,uint256 cost,uint256 deadline,uint256 nonce,bool isSell,uint256 minAmountOut,uint256 minReturn)"
  )
);

const MARKET_ABI = [
  {
    type: "function",
    name: "executeTrade",
    stateMutability: "payable",
    inputs: [
      {
        name: "quote",
        type: "tuple",
        components: [
          { name: "trader", type: "address" },
          { name: "market", type: "address" },
          { name: "outcome", type: "uint8" },
          { name: "amount", type: "uint256" },
          { name: "cost", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "isSell", type: "bool" },
          { name: "minAmountOut", type: "uint256" },
          { name: "minReturn", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
      { name: "minAmountOut", type: "uint256" },
      { name: "minReturn", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export async function simulateExecuteTrade(
  marketAddress: `0x${string}`,
  quote: {
    trader: `0x${string}`;
    market: `0x${string}`;
    outcome: number;
    amount: bigint;
    cost: bigint;
    deadline: bigint;
    nonce: bigint;
    isSell: boolean;
    minAmountOut: bigint;
    minReturn: bigint;
  },
  signature: `0x${string}`,
  minAmountOut: bigint,
  minReturn: bigint,
  value: bigint = 0n
) {
  try {
    const publicClient = getPublicClient(config);

    console.log('🔍 Simulating executeTrade call...');
    console.log('Market Address:', marketAddress);
    console.log('Quote:', {
      trader: quote.trader,
      market: quote.market,
      outcome: quote.outcome,
      amount: quote.amount.toString(),
      cost: quote.cost.toString(),
      deadline: quote.deadline.toString(),
      nonce: quote.nonce.toString(),
      isSell: quote.isSell,
      minAmountOut: quote.minAmountOut.toString(),
      minReturn: quote.minReturn.toString(),
    });
    console.log('Signature:', signature);
    console.log('Min Amount Out:', minAmountOut.toString());
    console.log('Min Return:', minReturn.toString());
    console.log('Value (ETH):', value.toString());

    const result = await publicClient.simulateContract({
      address: marketAddress,
      abi: MARKET_ABI,
      functionName: 'executeTrade',
      args: [quote, signature, minAmountOut, minReturn],
      value,

      account: quote.trader,
    });

    console.log('✅ Simulation successful!');
    console.log('Result:', result);

    return result;
  } catch (error: unknown) {
    console.error('❌ Simulation failed with error:');

    if (error instanceof Error) {
      console.error('Error message:', error.message);

      if (error.message.includes('reverted')) {
        console.error('🚨 Contract reverted!');

        const revertMatch =
          error.message.match(/reverted with reason string ['"](.*)['"]/);
        if (revertMatch) {
          console.error('Revert reason:', revertMatch[1]);
        } else {
          const customRevertMatch =
            error.message.match(/execution reverted: (.*)/);
          if (customRevertMatch) {
            console.error('Revert details:', customRevertMatch[1]);
          }
        }
      }
    } else if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error
    ) {
      console.error('Error message:', String((error as { message: unknown }).message));
    } else {
      console.error('Unknown error:', error);
    }

    // Optional: handle viem-specific errors
    if (
      typeof error === 'object' &&
      error !== null &&
      'cause' in error
    ) {
      console.error('Caused by:', (error as { cause?: unknown }).cause);
    }

    throw error;
  }

}

const domain = {
  name: "PredictionMarket-QuoteVerifier",
  version: "1",
  chainId: BigInt(process.env.NEXT_PUBLIC_CHAIN_ID as string),
  verifyingContract: process.env.NEXT_PUBLIC_QUOTE_VERIFIER_ADDRESS as `0x${string}`,
};

export interface TradeQuoteData {
  trader: `0x${string}`;
  market: `0x${string}`;
  outcome: 1 | 2;              // Solidity enum Outcome: 1 = YES, 2 = NO
  amount: bigint;              // uint256
  cost: bigint;                // uint256
  deadline: bigint;            // uint256 (unix timestamp)
  nonce: bigint;               // uint256
  isSell: boolean;             // bool
  minAmountOut: bigint;        // uint256
  minReturn: bigint;           // uint256
}

export function recoverSigner(
  quote: TradeQuoteData,
  signature: string
): string {
  const structHash = keccak256(
    abi.encode(
      [
        "bytes32",
        "address",
        "address",
        "uint8",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "bool",
        "uint256",
        "uint256",
      ],
      [
        TRADE_QUOTE_TYPEHASH,
        quote.trader,
        quote.market,
        quote.outcome,
        quote.amount,
        quote.cost,
        quote.deadline,
        quote.nonce,
        quote.isSell,
        quote.minAmountOut,
        quote.minReturn,
      ]
    )
  );

  const domainSeparator = TypedDataEncoder.hashDomain(domain);

  const digest = keccak256(
    abi.encode(
      ["bytes2", "bytes32", "bytes32"],
      ["0x1901", domainSeparator, structHash]
    )
  );

  return recoverAddress(digest, signature);
}

