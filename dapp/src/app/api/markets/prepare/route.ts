import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCreator } from "@/lib/permissions";
import { uploadToIPFS, computeMetadataHash, type MarketMetadata } from "@/lib/ipfs";
import { validateMarketCreation } from "@/lib/marketValidation";

/**
 * Prepare market creation: validate, upload to IPFS, return metadata hash
 * The actual on-chain creation is done by the user's wallet
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { creatorAddress, ...marketInput } = body;

    if (!creatorAddress) {
      return NextResponse.json(
        { error: "Creator address is required" },
        { status: 400 }
      );
    }

    // Permission check
    const authorized = await isAuthorizedCreator(creatorAddress);
    if (!authorized) {
      return NextResponse.json(
        { error: "Unauthorized: Only approved creators can create markets" },
        { status: 403 }
      );
    }

    // Validate input
    const validation = validateMarketCreation(marketInput);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", errors: validation.errors },
        { status: 400 }
      );
    }

    // Prepare metadata
    const metadata: MarketMetadata = {
      title: marketInput.title.trim(),
      description: marketInput.description.trim(),
      category: marketInput.category,
      resolutionSource: marketInput.resolutionSource.trim(),
      resolutionRules: marketInput.resolutionRules.map((r: string) => r.trim()),
      outcomes: ["YES", "NO"],
      endTime: marketInput.endTime,
      createdBy: creatorAddress.toLowerCase(),
      createdAt: Math.floor(Date.now() / 1000),
    };

    // Upload to IPFS
    let ipfsCid: string;
    try {
      ipfsCid = await uploadToIPFS(metadata);
    } catch (error: any) {
      return NextResponse.json(
        { error: "Failed to upload to IPFS", details: error.message },
        { status: 500 }
      );
    }

    // Compute metadata hash
    const metadataHash = computeMetadataHash(metadata);

    // Check if market with this hash already exists
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Market" WHERE "metadataHash" = ${metadataHash} LIMIT 1
    `.catch(() => []);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Market with this metadata already exists" },
        { status: 409 }
      );
    }

    // Return prepared data for frontend to use in transaction
    return NextResponse.json({
      success: true,
      metadataHash,
      ipfsCid,
      endTime: marketInput.endTime,
      metadata,
    });
  } catch (error: any) {
    console.error("Market preparation error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

