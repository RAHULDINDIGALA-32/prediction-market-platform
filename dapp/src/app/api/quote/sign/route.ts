/**
 * @description Quote signing endpoint (called on trade confirmation)
 * Signs pre-generated quotes using authorized signers from database
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signTradeQuote } from "@/lib/quoteGeneration";
import { getSignerWallet, listAuthorizedSigners } from "@/lib/signerManagement";
import { ethers } from "ethers";
import { Decimal } from "@prisma/client/runtime/library";

interface SignQuoteRequest {
    marketId: `0x${string}`;
    trader: `0x${string}`;
    outcome: 0 | 1;
    amount: string; // Wei as string
    cost: string; // Wei as string
    deadline: string;
    nonce: string;
    isSell: boolean;
    minAmountOut: string;
    minReturn: string;
    marketVersion: number;
}

interface SignedQuoteResponse {
    success: boolean;
    quoteHash?: string;
    quote?: {
        trader: `0x${string}`;
        market: `0x${string}`;
        outcome: 1 | 2;  // Contract enum: YES=1, NO=2
        amount: string;
        cost: string;
        isSell: boolean;
        deadline: string;
        nonce: string;
        minAmountOut: string;
        minReturn: string;
        marketVersion: number;
        signature: string;
    };
    error?: string;
}

/**
 * POST /api/quote/sign
 * Sign a pre-generated LMSR quote using an authorized backend signer
 *
 * This endpoint is called when the user confirms a trade.
 * It takes an unsigned quote structure and signs it using a random
 * authorized signer from the database.
 *
 * Required body: Complete unsigned quote data (from /api/quote/unsigned)
 *
 * Returns: Signed quote ready for on-chain execution
 */
export async function POST(request: NextRequest): Promise<NextResponse<SignedQuoteResponse>> {
    try {
        const QUOTE_VERIFIER_ADDRESS = process.env.NEXT_PUBLIC_QUOTE_VERIFIER_ADDRESS as `0x${string}`;

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

        const body: SignQuoteRequest = await request.json();

        // Validate required fields
        if (
            !body.marketId ||
            !body.trader ||
            body.outcome === undefined ||
            !body.amount ||
            !body.cost ||
            !body.nonce
        ) {
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

        // Validate numeric values
        let amount: bigint, cost: bigint, nonce: bigint;
        try {
            amount = BigInt(body.amount);
            cost = BigInt(body.cost);
            nonce = BigInt(body.nonce);

            if (amount <= 0n || cost < 0n) {
                throw new Error("Amount must be positive, cost must be non-negative");
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Invalid numeric values";
            return NextResponse.json(
                { success: false, error: message },
                { status: 400 }
            );
        }

        // Fetch market to verify it exists and is open
        const market = await prisma.market.findUnique({
            where: { id: body.marketId },
            select: {
                contractAddress: true,
                status: true,
                endTime: true,
                version: true,
            },
        });

        if (!market) {
            return NextResponse.json(
                { success: false, error: "Market not found" },
                { status: 404 }
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

        // Verify market version matches (prevents stale quote exploitation)
        if (body.marketVersion !== market.version) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Quote uses stale market version (market state has changed)",
                },
                { status: 400 }
            );
        }

        // Verify quote is still valid (deadline hasn't passed)
        if (BigInt(body.deadline) * 1000n < BigInt(Date.now())) {
            return NextResponse.json(
                { success: false, error: "Quote has expired" },
                { status: 400 }
            );
        }

        // Get list of authorized signers from database
        const authorizedSigners = await listAuthorizedSigners();

        if (!authorizedSigners || authorizedSigners.length === 0) {
            console.error(
                "CRITICAL: No authorized signers configured in database. " +
                "Add signers via /api/admin/signers endpoint."
            );
            return NextResponse.json(
                {
                    success: false,
                    error: "Quote service unavailable: No authorized signers",
                },
                { status: 503 }
            );
        }

        // Choose random signer from authorized signers
        const randomSignerIndex = Math.floor(Math.random() * authorizedSigners.length);
        const selectedSigner = authorizedSigners[randomSignerIndex];

        // Get decrypted signer wallet
        const wallet = await getSignerWallet(selectedSigner.address);

        if (!wallet) {
            console.error(
                `CRITICAL: Failed to get wallet for authorized signer ${selectedSigner.address}. ` +
                "Check encryption key and private key storage."
            );
            return NextResponse.json(
                {
                    success: false,
                    error: "Quote service unavailable: Signer access failed",
                },
                { status: 503 }
            );
        }

        // Outcome conversion: frontend uses 0/1, contract enum uses 1/2
        // Frontend: 0 = YES, 1 = NO
        // Contract: 1 = YES, 2 = NO
        // Convert immediately, then use contract values throughout
        const contractOutcome = (body.outcome as 0 | 1) + 1 as 1 | 2;

        // Build quote structure for signing using CONTRACT ENUM VALUES
        // The signature MUST be computed over the contract enum value (1 or 2)
        // to match what the on-chain contract verifies
        const quoteData = {
            trader: body.trader,
            market: market.contractAddress! as `0x${string}`,
            outcome: contractOutcome,  // Contract enum: 1 or 2
            amount,
            cost,
            deadline: BigInt(body.deadline),
            nonce,
            isSell: body.isSell,
            minAmountOut: BigInt(body.minAmountOut),
            minReturn: BigInt(body.minReturn),
        };

        // Sign quote with selected signer from database
        // Signature is computed over contract enum value (1 or 2)
        const signedQuote = await signTradeQuote(quoteData, QUOTE_VERIFIER_ADDRESS, wallet);

        // Store signed quote for tracking and later reconciliation
        const quoteHash = ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
                [
                    "address", "address", "uint8", "uint256", "uint256",
                    "uint256", "uint256", "bool", "uint256", "uint256"
                ],
                [
                    body.trader,
                    market.contractAddress!,
                    contractOutcome,  // Use contract enum value for hash
                    amount,
                    cost,
                    body.deadline,
                    nonce,
                    body.isSell,
                    BigInt(body.minAmountOut),
                    BigInt(body.minReturn),
                ]
            )
        );

        await prisma.signedQuote.create({
            data: {
                trader: body.trader,
                marketId: body.marketId,
                quoteHash,
                signature: signedQuote.signature,
                amount: new Decimal(amount.toString()),
                cost: new Decimal(cost.toString()),
                nonce,
                isSell: body.isSell,
                marketVersion: body.marketVersion,
                minAmountOut: new Decimal(body.minAmountOut),
                minReturn: new Decimal(body.minReturn),
            },
        });

        return NextResponse.json(
            {
                success: true,
                quoteHash,
                quote: {
                    trader: signedQuote.trader,
                    market: signedQuote.market,
                    outcome: signedQuote.outcome,
                    amount: signedQuote.amount.toString(),
                    cost: signedQuote.cost.toString(),
                    isSell: signedQuote.isSell,
                    deadline: signedQuote.deadline.toString(),
                    nonce: signedQuote.nonce.toString(),
                    minAmountOut: signedQuote.minAmountOut.toString(),
                    minReturn: signedQuote.minReturn.toString(),
                    marketVersion: body.marketVersion,
                    signature: signedQuote.signature,
                },
            },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error) {
        console.error("Quote signing error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Internal server error",
            },
            { status: 500 }
        );
    }
}
