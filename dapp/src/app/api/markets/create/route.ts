import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCreator } from "@/lib/permissions";
import { uploadToIPFS, computeMetadataHash, type MarketMetadata } from "@/lib/ipfs";
import { validateMarketCreation } from "@/lib/marketValidation";
import { ethers } from "ethers";

const MARKET_FACTORY_ADDRESS = process.env.MARKET_FACTORY_ADDRESS;
const PRIVATE_KEY = process.env.MARKET_CREATOR_PRIVATE_KEY;

if (!MARKET_FACTORY_ADDRESS) {
  throw new Error("MARKET_FACTORY_ADDRESS must be set");
}

if (!PRIVATE_KEY) {
  throw new Error("MARKET_CREATOR_PRIVATE_KEY must be set");
}

const MARKET_FACTORY_ABI = [
  "function createMarket(bytes32 metadataHash, uint256 endTime) external returns (address market)",
];

export async function POST(req: NextRequest) {
  try {
    // Get creator address from request
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
    // Note: After running `prisma generate`, this will work with findFirst
    // For now, we check on-chain via the factory contract's metadataHashToMarket mapping
    // This is actually more reliable as it checks the source of truth
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Market" WHERE "metadataHash" = ${metadataHash} LIMIT 1
    `.catch(() => []);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Market with this metadata already exists" },
        { status: 409 }
      );
    }

    // Deploy market on-chain
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY as string, provider);
    const factory = new ethers.Contract(MARKET_FACTORY_ADDRESS as string, MARKET_FACTORY_ABI, wallet);

    let marketAddress: string;
    try {
      const tx = await factory.createMarket(metadataHash, marketInput.endTime);
      const receipt = await tx.wait();
      
      // Extract market address from event
      const event = receipt.logs.find((log: any) => {
        try {
          const parsed = factory.interface.parseLog(log);
          return parsed?.name === "MarketCreated";
        } catch {
          return false;
        }
      });

      if (!event) {
        throw new Error("MarketCreated event not found");
      }

      const parsed = factory.interface.parseLog(event);
      marketAddress = parsed?.args[0]; // First indexed arg is market address
    } catch (error: any) {
      console.error("Market deployment failed:", error);
      return NextResponse.json(
        { error: "Failed to deploy market on-chain", details: error.message },
        { status: 500 }
      );
    }

    // Create market record in database
    // Note: After running `prisma generate`, you can use the typed create method
    // For now, using raw SQL to insert with all fields
    const marketId = marketAddress.toLowerCase();
    await prisma.$executeRaw`
      INSERT INTO "Market" (
        id, "contractAddress", status, "qYes", "qNo", b, collateral, version,
        "metadataHash", "ipfsCid", title, description, category, "resolutionSource", "endTime",
        "createdAt", "updatedAt"
      ) VALUES (
        ${marketId}::text,
        ${marketAddress}::text,
        'OPEN'::"MarketStatus",
        ${"0"}::decimal,
        ${"0"}::decimal,
        ${process.env.LMSR_B || "1000000000000000000"}::decimal,
        ${"0"}::decimal,
        ${0}::integer,
        ${metadataHash}::text,
        ${ipfsCid}::text,
        ${metadata.title}::text,
        ${metadata.description}::text,
        ${metadata.category}::text,
        ${metadata.resolutionSource}::text,
        ${marketInput.endTime}::bigint,
        NOW(),
        NOW()
      )
    `;

    const market = await prisma.market.findUnique({
      where: { id: marketId },
    });

    if (!market) {
      return NextResponse.json(
        { error: "Failed to create market record" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      market: {
        id: market.id,
        address: marketAddress,
        metadataHash,
        ipfsCid,
        title: metadata.title,
      },
    });
  } catch (error: any) {
    console.error("Market creation error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

