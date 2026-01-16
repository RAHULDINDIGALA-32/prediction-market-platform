/**
 * @file api/admin/creators/route.ts
 * @description Admin endpoint for managing whitelisted market creators
 * Provides functionality to whitelist/revoke creators with proper authorization
 */

import { NextRequest, NextResponse } from "next/server";
import { isAdmin, addCreator, removeCreator, getAllCreators } from "@/lib/permissions";
import { ethers } from "ethers";

interface CreatorWhitelistRequest {
    adminAddress: string;
    creatorAddress: string;
    isWhitelisted: boolean;
    txHash: string;
}

/**
 * GET /api/admin/creators
 * List all whitelisted creators
 */
export async function GET(req: NextRequest) {
    try {
        const creators = await getAllCreators();
        return NextResponse.json({
            success: true,
            creators: creators.map(c => ({
                id: c.id,
                address: c.address,
                isWhitelisted: c.isWhitelisted,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
            })),
        });
    } catch (error: any) {
        console.error("Failed to fetch creators:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error", details: error.message },
            { status: 500 }
        );
    }
}

/**
 * POST /api/admin/creators
 * Whitelist or remove a market creator
 * 
 * Required body:
 * - adminAddress: Admin wallet address
 * - creatorAddress: Creator address to whitelist/remove
 * - isWhitelisted: true to whitelist, false to remove
 * - txHash: Transaction hash from on-chain contract call
 */
export async function POST(req: NextRequest) {
    try {
        const body: CreatorWhitelistRequest = await req.json();
        const { adminAddress, creatorAddress, isWhitelisted, txHash } = body;

        if (!adminAddress || !creatorAddress || txHash === undefined) {
            return NextResponse.json(
                { error: "Admin address, creator address, and txHash required" },
                { status: 400 }
            );
        }

        // Validate address formats
        if (!ethers.isAddress(adminAddress) || !ethers.isAddress(creatorAddress)) {
            return NextResponse.json(
                { error: "Invalid address format" },
                { status: 400 }
            );
        }

        // Check admin authorization
        const admin = await isAdmin(adminAddress);
        if (!admin) {
            return NextResponse.json(
                { error: "Unauthorized: Admin access required" },
                { status: 403 }
            );
        }

        // Add or remove creator
        if (isWhitelisted) {
            await addCreator(creatorAddress);
            return NextResponse.json(
                {
                    success: true,
                    message: "Creator whitelisted successfully",
                    creator: {
                        address: ethers.getAddress(creatorAddress),
                        isWhitelisted: true,
                        txHash,
                    },
                },
                { status: 201 }
            );
        } else {
            await removeCreator(creatorAddress);
            return NextResponse.json(
                {
                    success: true,
                    message: "Creator removed from whitelist",
                    creator: {
                        address: ethers.getAddress(creatorAddress),
                        isWhitelisted: false,
                        txHash,
                    },
                },
                { status: 200 }
            );
        }
    } catch (error: any) {
        console.error("Creator whitelist error:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error", details: error.message },
            { status: 500 }
        );
    }
}

