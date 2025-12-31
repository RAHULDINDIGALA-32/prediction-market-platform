import { signTypedData } from "viem/accounts";
import { lmsrQuote } from "@/lib/lmsr/pricing";
import type { Hex } from "viem";

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
  };

  const signature = await signTypedData({
    privateKey: process.env.QUOTE_SIGNER_KEY! as Hex,
    domain: DOMAIN,
    types: TYPES,
    primaryType: "TradeQuote",
    message,
  });

  return Response.json({ quote, signature });
}
