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
  // Reserve a server-side nonce for this trader+market atomically
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.traderNonce.findUnique({
      where: {
        trader_marketId: {
          trader: input.trader,
          marketId: input.marketId,
        },
      },
    });

    // If not exists, create with lastNonce = market.version (so newNonce > any past)
    if (!existing) {
      const initial = await tx.traderNonce.create({
        data: {
          trader: input.trader,
          marketId: input.marketId,
          lastNonce: BigInt(market.version),
        },
      });
      return initial;
    }

    // otherwise return existing
    return existing;
  });

  // Now increment lastNonce in a separate transaction to reserve the next nonce
  const reserved = await prisma.$transaction(async (tx) => {
    const current = await tx.traderNonce.findUnique({
      where: {
        trader_marketId: {
          trader: input.trader,
          marketId: input.marketId,
        },
      },
    });
    const last = current?.lastNonce ?? BigInt(market.version);
    const newNonce = BigInt(last) + 1n;
    const updated = await tx.traderNonce.update({
      where: {
        trader_marketId: {
          trader: input.trader,
          marketId: input.marketId,
        },
      },
      data: {
        lastNonce: newNonce,
      },
    });
    return updated;
  });

  return {
    trader: input.trader,
    market: market.id,
    outcome: input.side === "YES" ? 0 : 1,
    amount: amountBig.toString(),
    cost: cost.toString(),
    deadline,
    nonce: reserved.lastNonce.toString(),
    marketVersion: market.version,
    // Sell flag and slippage
    isSell: false,
    minAmountOut: amountBig.toString(),
    minReturn: "0",
  };
}
  