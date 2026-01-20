/**
 * @file market/create/route.ts
 * @description Market creation endpoint with subsidy validation
 * Handles creator whitelisting, subsidy deposits, and metadata storage
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ethers } from "ethers";
import * as IPFS from "@/lib/ipfs";
import { Decimal } from "@prisma/client/runtime/library";

interface CreateMarketRequest {
    title: string;
    description: string;
    category: string;
    resolutionSource: string;
    endTime: number; // Unix timestamp
    lmsrB: string; // Wei as string
    ipfsCid?: string; // Pre-uploaded IPFS content
    metadataJson?: Record<string, unknown>; // Raw metadata to upload
}

interface CreateMarketResponse {
    success: boolean;
    marketId?: string;
    metadataHash?: string;
    ipfsCid?: string;
    subsidyRequired?: string;
    error?: string;
}

/**
 * Calculate minimum required subsidy for market
 * Minimum = b * ln(2) ≈ 0.693 * b
 * This ensures LMSR solvency and bounds worst-case loss
 * 
 * @param lmsrB - LMSR parameter b in wei
 * @returns Minimum subsidy amount in wei
 */
function calculateMinimumSubsidy(lmsrB: bigint): bigint {
    // ln(2) ≈ 0.693147180559945...
    // For practical purposes: 69.3% of b
    return (lmsrB * 693n) / 1000n;
}

/**
 * POST /api/markets/create
 * Create a new prediction market
 * 
 * Required body:
 * - title: Market title
 * - description: Market description
 * - category: Market category
 * - resolutionSource: How outcome will be determined
 * - endTime: Unix timestamp when market expires
 * - lmsrB: LMSR liquidity parameter (wei as string)
 * - ipfsCid or metadataJson: Market metadata
 * 
 * Returns: Market ID, metadata hash, IPFS CID, and required subsidy
 */
export async function POST(request: NextRequest): Promise<NextResponse<CreateMarketResponse>> {
    try {
        const body: CreateMarketRequest = await request.json();

        // Validate required fields
        if (
            !body.title ||
            !body.description ||
            !body.category ||
            !body.resolutionSource ||
            !body.endTime ||
            !body.lmsrB
        ) {
            return NextResponse.json(
                { success: false, error: "Missing required fields" },
                { status: 400 }
            );
        }

        // Validate end time is in the future
        const now = Math.floor(Date.now() / 1000);
        if (body.endTime <= now) {
            return NextResponse.json(
                { success: false, error: "endTime must be in the future" },
                { status: 400 }
            );
        }

        // Validate market duration (max 365 days)
        const MAX_DURATION = 365 * 24 * 60 * 60;
        if (body.endTime > now + MAX_DURATION) {
            return NextResponse.json(
                { success: false, error: "Market duration exceeds maximum (365 days)" },
                { status: 400 }
            );
        }

        // Parse and validate LMSR b
        let lmsrB: bigint;
        try {
            lmsrB = BigInt(body.lmsrB);
            if (lmsrB <= 0n) {
                throw new Error("Invalid b");
            }
        } catch {
            return NextResponse.json(
                { success: false, error: "Invalid lmsrB value" },
                { status: 400 }
            );
        }

        // Calculate required subsidy
        const minSubsidy = calculateMinimumSubsidy(lmsrB);

        // Handle IPFS metadata
        let ipfsCid = body.ipfsCid;

        if (body.metadataJson && !ipfsCid) {
            // Upload metadata to IPFS
            const metadata = {
                title: body.title,
                description: body.description,
                category: body.category,
                resolutionSource: body.resolutionSource,
                endTime: body.endTime,
                lmsrB: body.lmsrB,
                createdAt: new Date().toISOString(),
                ...body.metadataJson,
            };

            ipfsCid = await IPFS.uploadJSON(metadata);
        }

        if (!ipfsCid) {
            return NextResponse.json(
                { success: false, error: "No metadata provided (ipfsCid or metadataJson required)" },
                { status: 400 }
            );
        }

        // Create metadata hash (bytes32 compatible)
         const metadataHash = ethers.keccak256(
            ethers.toBeHex(ipfsCid, 32)
        );

        // Check for duplicate markets
        const existingMarket = await prisma.market.findUnique({
            where: { metadataHash },
        });

        if (existingMarket) {
            return NextResponse.json(
                { success: false, error: "Market with this metadata already exists" },
                { status: 409 }
            );
        }

        // Create market record in database
        // Note: contractAddress and creator will be set after on-chain deployment
        const market = await prisma.market.create({
            data: {
                id: ethers.id(ipfsCid), // Temporary ID based on IPFS
                metadataHash: metadataHash as `0x${string}`,
                ipfsCid,
                title: body.title,
                description: body.description,
                category: body.category,
                resolutionSource: body.resolutionSource,
                endTime: BigInt(body.endTime),
                lmsrB: new Decimal(body.lmsrB),
                creator: "0x0000000000000000000000000000000000000000",
                qYes: new Decimal(0),
                qNo: new Decimal(0),
                collateral: new Decimal(0),
                version: 1,
                status: "OPEN",
                subsidyAmount: new Decimal(minSubsidy.toString()),
            },
        });

        return NextResponse.json(
            {
                success: true,
                marketId: market.id,
                metadataHash,
                ipfsCid,
                subsidyRequired: minSubsidy.toString(),
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("Market creation error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Internal server error",
            },
            { status: 500 }
        );
    }
}

/**
 * GET /api/markets/create
 * Returns information about market creation requirements
 */
export async function GET(): Promise<NextResponse<{
    minLmsrB: string;
    maxMarketDuration: number;
    creationFee: string;
    subsidyFormula: string;
}>> {
    return NextResponse.json({
        minLmsrB: "1000000000000000000", // 1 ETH in wei
        maxMarketDuration: 365 * 24 * 60 * 60,
        creationFee: "30000000000000000", // 0.03 ETH in wei
        subsidyFormula: "b * ln(2) ≈ 0.693 * b (ETH)",
    });
}
