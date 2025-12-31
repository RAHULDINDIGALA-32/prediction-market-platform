import { prisma } from "@/lib/db";
import { applyTrade } from "./stateMachine";
import { Decimal } from "@prisma/client/runtime/library";

export async function lmsrQuote(input: {
  marketId: string;
  trader: string;
  side: "YES" | "NO";
  amount: string | number | Decimal;
}) {
  const market = await prisma.market.findUnique({ where: { id: input.marketId } });

  if (!market) throw new Error("Market not found");
  if (market.status !== "OPEN") throw new Error("Market closed");

  const toBigInt = (v: string | number | Decimal) => BigInt(v.toString());

  const state = {
    qYes: toBigInt(market.qYes),
    qNo: toBigInt(market.qNo),
    b: toBigInt(market.b),
    collateral: toBigInt(market.collateral),
    version: market.version,
  };

  const amountBig = toBigInt(input.amount);

  // Simulate the trade (no DB write) to compute cost
  const { newState, cost } = applyTrade(state, input.side, amountBig);

  const deadline = Math.floor(Date.now() / 1000) + 60; // 1 minute validity

  // Use market.version + 1 as a monotonic nonce (must be > on-chain last nonce)
  const nonce = BigInt(market.version + 1);

  return {
    trader: input.trader,
    market: market.id,
    outcome: input.side === "YES" ? 0 : 1,
    amount: amountBig.toString(),
    cost: cost.toString(),
    deadline,
    nonce: nonce.toString(),
    marketVersion: market.version,
  };
}
  