import { prisma } from "@/lib/db";
import { applyTrade } from "./stateMachine";
import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * Convert Prisma Decimal to BigInt, scaling by 10^18 for wei precision
 * This handles decimal values from the database like 0.721348
 * and converts them to proper wei-scale integers
 */
const toBigInt = (value: Decimal): bigint => {
    const str = value.toString();
    
    // If value is a decimal (e.g., 0.721348), scale it by 10^18
    if (str.includes('.')) {
        const parts = str.split('.');
        const integerPart = parts[0];
        const decimalPart = parts[1];
        
        // Pad decimal part to 18 places (wei precision)
        const paddedDecimal = decimalPart.padEnd(18, '0').slice(0, 18);
        const scaledString = integerPart + paddedDecimal;
        
        return BigInt(scaledString);
    }
    
    // If already an integer, scale it by 10^18
    return BigInt(str) * BigInt(10) ** BigInt(18);
};

export async function executeTrade({
    marketId,
    side,
    amount,
    expectedCost,
    expectedVersion,
    trader,
    isSell = false,
    transactionHash,
    blockNumber,
} : {
    marketId: string;
    side: "YES" | "NO";
    amount: Decimal;
    expectedCost: Decimal;
    expectedVersion: number;
    trader: string;
    isSell?: boolean;
    transactionHash: string;
    blockNumber: bigint;
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
            b: toBigInt(market.lmsrB), // Use creator-specified lmsrB
            collateral: toBigInt(market.collateral),
            version: market.version,
        };

        const { newState, cost } = applyTrade(
            marketState,
            side,
            toBigInt(amount),
            isSell
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

        const trade = await tx.trade.create({
            data: {
                marketId,
                side,
                amount: new Decimal(amount.toString()),
                cost: new Decimal(cost.toString()),
                trader,
                marketVer: market.version,
                transactionHash,
                blockNumber,
            },
        });

        // Fetch updated market state for response
        const updatedMarket = await tx.market.findUnique({
            where: { id: marketId },
            select: {
                id: true,
                qYes: true,
                qNo: true,
                collateral: true,
                version: true,
                updatedAt: true,
            },
        });

        return { cost, trade, market: updatedMarket };
    });
}