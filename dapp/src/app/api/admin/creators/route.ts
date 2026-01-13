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
    role?: "ADMIN" | "EDITOR";
}

/**
 * GET /api/admin/creators?adminAddress=0x...
 * List all whitelisted creators (admin only)
 */
export async function GET(req: NextRequest) {
    try {
        const address = req.nextUrl.searchParams.get("adminAddress");

        if (!address) {
            return NextResponse.json(
                { error: "Admin address required" },
                { status: 400 }
            );
        }

        // Validate address format
        if (!ethers.isAddress(address)) {
            return NextResponse.json(
                { error: "Invalid admin address" },
                { status: 400 }
            );
        }

        // Check if requester is admin
        const admin = await isAdmin(address);
        if (!admin) {
            return NextResponse.json(
                { error: "Unauthorized: Admin access required" },
                { status: 403 }
            );
        }

        const creators = await getAllCreators();
        return NextResponse.json({
            success: true,
            creators: creators.map(c => ({
                address: c.address,
                isWhitelisted: c.isWhitelisted,
                role: c.role,
                createdAt: c.createdAt,
            })),
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: "Internal server error", details: error.message },
            { status: 500 }
        );
    }
}

/**
 * POST /api/admin/creators
 * Whitelist a new market creator (admin only)
 * 
 * Required body:
 * - adminAddress: Admin wallet address
 * - creatorAddress: Creator address to whitelist
 * - role: "EDITOR" or "ADMIN" (optional, defaults to EDITOR)
 */
export async function POST(req: NextRequest) {
    try {
        const body: CreatorWhitelistRequest = await req.json();
        const { adminAddress, creatorAddress, role = "EDITOR" } = body;

        if (!adminAddress || !creatorAddress) {
            return NextResponse.json(
                { error: "Admin address and creator address required" },
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

        // Add creator to whitelist
        await addCreator(creatorAddress, role);

        return NextResponse.json(
            {
                success: true,
                message: "Creator whitelisted successfully",
                creator: {
                    address: ethers.getAddress(creatorAddress),
                    role,
                },
            },
            { status: 201 }
        );
    } catch (error: any) {
        console.error("Creator whitelist error:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error", details: error.message },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/admin/creators
 * Revoke creator whitelist status (admin only)
 * 
 * Required body:
 * - adminAddress: Admin wallet address
 * - creatorAddress: Creator address to revoke
 */
export async function DELETE(req: NextRequest) {
    try {
        const body = await req.json();
        const { adminAddress, creatorAddress } = body;

        if (!adminAddress || !creatorAddress) {
            return NextResponse.json(
                { error: "Admin address and creator address required" },
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

        // Remove creator from whitelist
        await removeCreator(creatorAddress);

        return NextResponse.json({
            success: true,
            message: "Creator whitelist revoked successfully",
            creator: {
                address: ethers.getAddress(creatorAddress),
            },
        });
    } catch (error: any) {
        console.error("Creator revoke error:", error);
        return NextResponse.json(
            { success: false, error: "Internal server error", details: error.message },
            { status: 500 }
        );
    }
}

