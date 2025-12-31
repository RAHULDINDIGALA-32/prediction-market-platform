import { prisma } from "@/lib/db";
import { applyTrade } from "./stateMachine";
import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const toBigInt = (value: Decimal) => BigInt(value.toString());

export async function executeTrade({
    marketId,
    side,
    amount,
    expectedCost,
    expectedVersion,
    trader,
} : {
    marketId: string;
    side: "YES" | "NO";
    amount: Decimal;
    expectedCost: Decimal;
    expectedVersion: number;
    trader: string;
}) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const market = await tx.market.findUnique({
            where: { id: marketId },
        });

        if (!market) throw new Error("Market Not Found!!");
        if(market.status !== "OPEN") throw new Error("Market Closed!!");
        if(market.version !== expectedVersion) throw new Error("Stale Quote!!");

        const marketState = {
            qYes: toBigInt(market.qYes),
            qNo: toBigInt(market.qNo),
            b: toBigInt(market.b),
            collateral: toBigInt(market.collateral),
            version: market.version,
        };

        const { newState, cost } = applyTrade(
            marketState,
            side,
            toBigInt(amount)
        );

        if (cost !== toBigInt(expectedCost)) {
            throw new Error("Quote mismatch");
        }

        await tx.market.update({
            where: { id: marketId },
            data: {
                qYes: new Decimal(newState.qYes.toString()),
                qNo: new Decimal(newState.qNo.toString()),
                collateral: new Decimal(newState.collateral.toString()),
                version: newState.version, 
            },
        });

        await tx.trade.create({
            data: {
                marketId,
                side,
                amount: new Decimal(amount.toString()),
                cost: new Decimal(cost.toString()),
                trader,
                marketVersion: market.version,
            },
        });

        return { cost };
    });
}