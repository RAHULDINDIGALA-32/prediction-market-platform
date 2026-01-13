/**
 * @file api/quote.ts
 * @description Trade quote generation endpoint
 * Generates LMSR-based quotes signed by the backend oracle
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateTradeQuote, signTradeQuote, isQuoteValid } from "@/lib/quoteGeneration";
import { ethers } from "ethers";
import { Decimal } from "@prisma/client/runtime/library";

interface QuoteRequest {
    marketId: string;
    trader: string;
    outcome: 0 | 1; // 0 = YES, 1 = NO
    amount: string; // Wei as string
    isSell: boolean;
}

interface QuoteResponse {
    success: boolean;
    quote?: {
        trader: string;
        market: string;
        outcome: 0 | 1;
        amount: string;
        cost: string;
        isSell: boolean;
        deadline: number;
        nonce: string;
        marketVersion: number;
        signature: string;
    };
    error?: string;
}

const toBigInt = (value: Decimal) => BigInt(value.toString());

/**
 * POST /api/quote
 * Generate a signed LMSR quote for a trade
 * 
 * Required body:
 * - marketId: ID of the market
 * - trader: Trader's wallet address
 * - outcome: 0 (YES) or 1 (NO)
 * - amount: Token amount in wei (string)
 * - isSell: Buy (false) or sell (true)
 * 
 * Returns: Signed trade quote for on-chain execution
 */
export async function POST(request: NextRequest): Promise<NextResponse<QuoteResponse>> {
    try {
        const body: QuoteRequest = await request.json();

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

        // Parse amount
        let amount: bigint;
        try {
            amount = BigInt(body.amount);
            if (amount <= 0n) {
                throw new Error("Invalid amount");
            }
        } catch {
            return NextResponse.json(
                { success: false, error: "Invalid amount value" },
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
                b: true,
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

        // Generate unsigned quote
        const quoteData = generateTradeQuote(
            market.contractAddress,
            body.trader,
            body.outcome,
            amount,
            body.isSell,
            toBigInt(market.qYes),
            toBigInt(market.qNo),
            toBigInt(market.b),
            traderNonce.lastNonce,
            market.version
        );

        // Validate quote is still fresh
        if (!isQuoteValid(quoteData)) {
            return NextResponse.json(
                { success: false, error: "Generated quote already expired" },
                { status: 500 }
            );
        }

        // Sign quote with backend oracle key
        const privateKey = process.env.ORACLE_PRIVATE_KEY;
        if (!privateKey) {
            console.error("ORACLE_PRIVATE_KEY not configured");
            return NextResponse.json(
                { success: false, error: "Oracle not configured" },
                { status: 500 }
            );
        }

        const signer = new ethers.Wallet(privateKey);
        const signedQuote = await signTradeQuote(quoteData, signer);

        // Store signed quote for tracking
        await prisma.signedQuote.create({
            data: {
                trader: body.trader,
                marketId: body.marketId,
                quoteHash: ethers.keccak256(
                    ethers.AbiCoder.defaultAbiCoder().encode(
                        ["address", "address", "uint8", "uint256", "uint256", "bool", "uint256", "uint256", "uint256"],
                        [
                            body.trader,
                            market.contractAddress,
                            body.outcome,
                            amount,
                            quoteData.cost,
                            body.isSell,
                            quoteData.deadline,
                            quoteData.nonce,
                            quoteData.marketVersion,
                        ]
                    )
                ),
                signature: signedQuote.signature,
                amount: new Decimal(amount.toString()),
                cost: new Decimal(quoteData.cost.toString()),
                nonce: quoteData.nonce,
                isSell: body.isSell,
                marketVersion: market.version,
            },
        });

        return NextResponse.json({
            success: true,
            quote: {
                trader: signedQuote.trader,
                market: signedQuote.market,
                outcome: signedQuote.outcome,
                amount: signedQuote.amount.toString(),
                cost: signedQuote.cost.toString(),
                isSell: signedQuote.isSell,
                deadline: signedQuote.deadline,
                nonce: signedQuote.nonce.toString(),
                marketVersion: signedQuote.marketVersion,
                signature: signedQuote.signature,
            },
        });
    } catch (error) {
        console.error("Quote generation error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Internal server error",
            },
            { status: 500 }
        );
    }
}
