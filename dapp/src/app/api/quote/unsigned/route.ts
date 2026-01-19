/**
 * @description Unsigned quote generation endpoint (query preview)
 * Generates LMSR-based quotes WITHOUT signing - for preview/display only
 * Actual signing happens at trade confirmation time via /api/quote/sign
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateTradeQuote, isQuoteValid } from "@/lib/quoteGeneration";
import { ethers } from "ethers";
import { Decimal } from "@prisma/client/runtime/library";

const QUOTE_VERIFIER_ADDRESS = process.env.NEXT_PUBLIC_QUOTE_VERIFIER_ADDRESS;

interface UnsignedQuoteRequest {
    marketId: string;
    trader: string;
    outcome: 0 | 1; // 0 = YES, 1 = NO
    amount: string; // Wei as string
    isSell: boolean;
}

interface UnsignedQuoteResponse {
    success: boolean;
    quote?: {
        trader: string;
        market: string;
        outcome: 0 | 1;  // Frontend format: YES=0, NO=1 (will be converted to 1|2 during signing)
        amount: string;
        cost: string;
        isSell: boolean;
        deadline: number;
        nonce: string;
        minAmountOut: string;
        minReturn: string;
        marketVersion: number;
    };
    error?: string;
}

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

/**
 * POST /api/quote/unsigned
 * Generate an UNSIGNED LMSR quote for preview/display
 *
 * This endpoint generates a quote structure suitable for EIP-712 signing,
 * but does NOT sign it. The signature is added later via /api/quote/sign
 * when the user confirms the trade.
 *
 * Required body:
 * - marketId: ID of the market
 * - trader: Trader's wallet address
 * - outcome: 0 (YES) or 1 (NO)
 * - amount: Token amount in wei (string)
 * - isSell: Buy (false) or sell (true)
 *
 * Returns: Unsigned trade quote (ready for EIP-712 signing) - NO signature included
 */
export async function POST(request: NextRequest): Promise<NextResponse<UnsignedQuoteResponse>> {
    try {
        if (!QUOTE_VERIFIER_ADDRESS) {
            console.error(
                "CRITICAL: NEXT_PUBLIC_QUOTE_VERIFIER_ADDRESS not configured in environment. " +
                "This is required for correct EIP-712 signature generation."
            );
            return NextResponse.json(
                {
                    success: false,
                    error: "Quote service unavailable: Configuration error",
                },
                { status: 503 }
            );
        }

        const body: UnsignedQuoteRequest = await request.json();

        // Validate required fields
        if (!body.marketId || !body.trader || body.outcome === undefined || !body.amount) {
            return NextResponse.json(
                { success: false, error: "Missing required fields" },
                { status: 400 }
            );
        }

        // Validate outcome
        if (body.outcome !== 0 && body.outcome !== 1) {
            return NextResponse.json(
                { success: false, error: "Invalid outcome (must be 0 or 1)" },
                { status: 400 }
            );
        }

        // Validate trader address
        if (!ethers.isAddress(body.trader)) {
            return NextResponse.json(
                { success: false, error: "Invalid trader address" },
                { status: 400 }
            );
        }

        let amount: bigint;
        try {
            amount = BigInt(body.amount);
            if (amount <= 0n) {
                throw new Error("Amount must be greater than 0");
            }
            // Maximum reasonable trade size (1000 ETH worth)
            const MAX_TRADE_SIZE = BigInt(10) ** BigInt(21);
            if (amount > MAX_TRADE_SIZE) {
                throw new Error("Trade amount exceeds maximum allowed size (1000 ETH)");
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Invalid amount value";
            return NextResponse.json(
                { success: false, error: message },
                { status: 400 }
            );
        }

        // Fetch market
        const market = await prisma.market.findUnique({
            where: { id: body.marketId },
            select: {
                contractAddress: true,
                qYes: true,
                qNo: true,
                lmsrB: true,
                version: true,
                status: true,
                endTime: true,
            },
        });

        if (!market) {
            return NextResponse.json(
                { success: false, error: "Market not found" },
                { status: 404 }
            );
        }

        if (!market.contractAddress) {
            return NextResponse.json(
                { success: false, error: "Market not yet deployed on-chain" },
                { status: 400 }
            );
        }

        if (market.status !== "OPEN") {
            return NextResponse.json(
                { success: false, error: "Market is not open for trading" },
                { status: 400 }
            );
        }

        // Check market hasn't expired
        const now = Math.floor(Date.now() / 1000);
        if (market.endTime && Number(market.endTime) <= now) {
            return NextResponse.json(
                { success: false, error: "Market has expired" },
                { status: 400 }
            );
        }

        // Get or create trader nonce
        let traderNonce = await prisma.traderNonce.findUnique({
            where: {
                trader_marketId: {
                    trader: body.trader,
                    marketId: body.marketId,
                },
            },
        });

        if (!traderNonce) {
            traderNonce = await prisma.traderNonce.create({
                data: {
                    trader: body.trader,
                    marketId: body.marketId,
                    lastNonce: BigInt(0),
                },
            });
        }

        // Calculate default slippage protection (1% for buys, 1% for sells)
        const minAmountOut = body.isSell ? 0n : (amount * 99n) / 100n;
        const minReturn = !body.isSell ? 0n : (amount * 99n) / 100n;

        // QuoteVerifier enforces: quote.nonce > traderNonces[trader][market]
      
        const nextNonce = traderNonce.lastNonce + BigInt(1);

        // Convert frontend outcome (0 | 1) to contract enum (1 | 2)
        // Frontend: 0 = YES, 1 = NO
        // Contract: 1 = YES, 2 = NO
        const contractOutcome = (body.outcome as 0 | 1) + 1 as 1 | 2;

        // Generate UNSIGNED quote using contract enum values
        const quoteData = generateTradeQuote(
            market.contractAddress,
            QUOTE_VERIFIER_ADDRESS,
            body.trader,
            contractOutcome,
            amount,
            body.isSell,
            toBigInt(market.qYes),
            toBigInt(market.qNo),
            toBigInt(market.lmsrB),
            nextNonce,
            minAmountOut,
            minReturn
        );

        // Validate quote is still fresh
        if (!isQuoteValid(quoteData)) {
            return NextResponse.json(
                { success: false, error: "Generated quote already expired" },
                { status: 500 }
            );
        }

        // Return unsigned quote (no signature, no database storage)
        return NextResponse.json(
            {
                success: true,
                quote: {
                    trader: quoteData.trader,
                    market: quoteData.market,
                    outcome: body.outcome,  // Return frontend format (0 | 1) in response for clarity
                    amount: quoteData.amount.toString(),
                    cost: quoteData.cost.toString(),
                    isSell: quoteData.isSell,
                    deadline: quoteData.deadline,
                    nonce: quoteData.nonce.toString(),
                    minAmountOut: quoteData.minAmountOut.toString(),
                    minReturn: quoteData.minReturn.toString(),
                    marketVersion: market.version,
                },
            },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error) {
        console.error("Unsigned quote generation error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Internal server error",
            },
            { status: 500 }
        );
    }
}
