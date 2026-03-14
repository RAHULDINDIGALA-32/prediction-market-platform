import { prisma } from "@/lib/db";
import { applyTrade } from "./stateMachine";
import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const WEI_SCALE = new Decimal("1000000000000000000");

/**
 * Convert token-unit decimals from the database into wei-scale integers.
 * Example: 4 -> 4e18, 0.5 -> 5e17
 */
const toTokenWei = (value: Decimal): bigint => {
    const str = value.toString();
    
    if (str.includes('.')) {
        const parts = str.split('.');
        const integerPart = parts[0];
        const decimalPart = parts[1];
        
        const paddedDecimal = decimalPart.padEnd(18, '0').slice(0, 18);
        const scaledString = integerPart + paddedDecimal;
        
        return BigInt(scaledString);
    }
    
    return BigInt(str) * BigInt(10) ** BigInt(18);
};

/**
 * Convert values that may already be stored in wei integers, or as decimal ETH/token values,
 * into a wei-scale bigint.
 */
const toWeiAmount = (value: Decimal): bigint => {
    const str = value.toString();

    if (str.includes('.')) {
        const parts = str.split('.');
        const integerPart = parts[0];
        const decimalPart = parts[1];
        const paddedDecimal = decimalPart.padEnd(18, '0').slice(0, 18);

        return BigInt(integerPart + paddedDecimal);
    }

    return BigInt(str);
};

const fromTokenWei = (value: bigint): Decimal => {
    return new Decimal(value.toString()).div(WEI_SCALE);
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
            qYes: toTokenWei(market.qYes),
            qNo: toTokenWei(market.qNo),
            b: toTokenWei(market.lmsrB), // Use creator-specified lmsrB
            collateral: toWeiAmount(market.collateral),
            version: market.version,
        };

        const { newState, cost } = applyTrade(
            marketState,
            side,
            toWeiAmount(amount),
            isSell
        );

        if (cost !== toWeiAmount(expectedCost)) {
            throw new Error("Quote mismatch");
        }

        await tx.market.update({
            where: { id: marketId },
            data: {
                qYes: fromTokenWei(newState.qYes),
                qNo: fromTokenWei(newState.qNo),
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
