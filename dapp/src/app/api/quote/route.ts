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

const QUOTE_VERIFIER_ADDRESS = process.env.QUOTE_VERIFIER_ADDRESS;

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
        minAmountOut: string;    
        minReturn: string;       
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
 * Returns: Signed trade quote for on-chain execution with slippage protection fields
 */
export async function POST(request: NextRequest): Promise<NextResponse<QuoteResponse>> {
    try {
        if (!QUOTE_VERIFIER_ADDRESS) {
            console.error(
                "CRITICAL: QUOTE_VERIFIER_ADDRESS not configured in environment. " +
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

        let amount: bigint;
        try {
            amount = BigInt(body.amount);
            if (amount <= 0n) {
                throw new Error("Amount must be greater than 0");
            }
            // Maximum reasonable trade size (1000 ETH)
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

        // Calculate default slippage protection (1% for buys, 1% for sells)
        const minAmountOut = body.isSell ? 0n : (amount * 99n) / 100n;
        const minReturn = !body.isSell ? 0n : (amount * 99n) / 100n;

        const quoteData = generateTradeQuote(
            market.contractAddress,
            QUOTE_VERIFIER_ADDRESS,      
            body.trader,
            body.outcome,
            amount,
            body.isSell,
            toBigInt(market.qYes),
            toBigInt(market.qNo),
            toBigInt(market.b),
            traderNonce.lastNonce,
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

        // Sign quote with backend oracle key
        const privateKey = process.env.ORACLE_PRIVATE_KEY;
        if (!privateKey) {
            console.error(
                "CRITICAL: ORACLE_PRIVATE_KEY not configured in environment. " +
                "This is the private key of the authorized quote signer."
            );
            return NextResponse.json(
                {
                    success: false,
                    error: "Quote service unavailable: Oracle not configured",
                },
                { status: 503 }
            );
        }

        const signer = new ethers.Wallet(privateKey);
        const signedQuote = await signTradeQuote(quoteData, QUOTE_VERIFIER_ADDRESS, signer);

        // Store signed quote for tracking
        await prisma.signedQuote.create({
            data: {
                trader: body.trader,
                marketId: body.marketId,
                quoteHash: ethers.keccak256(
                    ethers.AbiCoder.defaultAbiCoder().encode(
                        [
                            "address", "address", "uint8", "uint256", "uint256",
                            "uint256", "uint256", "bool", "uint256", "uint256"
                        ],
                        [
                            body.trader,
                            market.contractAddress,
                            body.outcome,
                            amount,
                            quoteData.cost,
                            quoteData.deadline,
                            quoteData.nonce,
                            body.isSell,
                            quoteData.minAmountOut,   
                            quoteData.minReturn       
                        ]
                    )
                ),
                signature: signedQuote.signature,
                amount: new Decimal(amount.toString()),
                cost: new Decimal(quoteData.cost.toString()),
                nonce: quoteData.nonce,
                isSell: body.isSell,
                marketVersion: market.version,
                minAmountOut: new Decimal(quoteData.minAmountOut.toString()),  
                minReturn: new Decimal(quoteData.minReturn.toString()),        
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
                minAmountOut: signedQuote.minAmountOut.toString(),  
                minReturn: signedQuote.minReturn.toString(),        
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
