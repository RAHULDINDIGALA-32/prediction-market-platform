import { signTypedData } from "viem/accounts";
import { lmsrQuote } from "@/lib/lmsr/pricing";
import type { Hex } from "viem";
import { ethers } from "ethers";
import { prisma } from "@/lib/db";

// Domain must match QuoteVerifier EIP-712 domain
const DOMAIN = {
  name: "PredictionMarket-QuoteVerifier",
  version: "1",
  chainId: Number(process.env.CHAIN_ID ?? 1),
  verifyingContract: (process.env.QUOTE_VERIFIER_ADDRESS ?? "") as Hex,
};

const TYPES = {
  TradeQuote: [
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
};

export async function POST(req: Request) {
  const body = await req.json();

  if (!process.env.QUOTE_SIGNER_KEY) {
    return new Response(JSON.stringify({ error: "QUOTE_SIGNER_KEY not set" }), { status: 500 });
  }
  if (!process.env.QUOTE_VERIFIER_ADDRESS) {
    return new Response(JSON.stringify({ error: "QUOTE_VERIFIER_ADDRESS not set" }), { status: 500 });
  }

  const quote = await lmsrQuote(body);

  // Ensure numeric fields are BigInt when signing
  const message = {
    trader: quote.trader,
    market: quote.market,
    outcome: Number(quote.outcome),
    amount: BigInt(quote.amount),
    cost: BigInt(quote.cost),
    deadline: BigInt(quote.deadline),
    nonce: BigInt(quote.nonce),
    isSell: Boolean(quote.isSell),
    minAmountOut: BigInt(quote.minAmountOut ?? "0"),
    minReturn: BigInt(quote.minReturn ?? "0"),
  };

  const signature = await signTypedData({
    privateKey: process.env.QUOTE_SIGNER_KEY! as Hex,
    domain: DOMAIN,
    types: TYPES,
    primaryType: "TradeQuote",
    message,
  });

  // Compute EIP-712 quote hash to store and reconcile later (same as on-chain _hashTypedDataV4)
  // Use ethers TypedDataEncoder to compute the struct hash
  const domain = {
    name: DOMAIN.name,
    version: DOMAIN.version,
    chainId: DOMAIN.chainId,
    verifyingContract: DOMAIN.verifyingContract,
  };

  const types = {
    TradeQuote: [
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
  };

  const typedDataMessage = {
    trader: message.trader,
    market: message.market,
    outcome: message.outcome,
    amount: message.amount.toString(),
    cost: message.cost.toString(),
    deadline: message.deadline.toString(),
    nonce: message.nonce.toString(),
    isSell: message.isSell,
    minAmountOut: message.minAmountOut.toString(),
    minReturn: message.minReturn.toString(),
  };

  const quoteHash = ethers.TypedDataEncoder.hash(domain, types, typedDataMessage);

  // persist the signed quote so we can reconcile when it's executed on-chain
  try {
    await prisma.signedQuote.create({
      data: {
        trader: quote.trader,
        marketId: quote.marketId,
        quoteHash: quoteHash,
        signature: signature,
        amount: quote.amount,
        cost: quote.cost,
        nonce: BigInt(quote.nonce) as any,
        isSell: Boolean(quote.isSell),
        marketVersion: quote.marketVersion,
        minAmountOut: quote.minAmountOut ?? undefined,
        minReturn: quote.minReturn ?? undefined,
      },
    });
  } catch (err) {
    // ignore unique constraint errors (quote already stored)
  }

  return Response.json({ quote, signature, quoteHash });
}
