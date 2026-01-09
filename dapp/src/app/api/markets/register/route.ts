import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCreator } from "@/lib/permissions";
import { createPublicClient, http, parseEventLogs } from "viem";
import { mainnet, sepolia, base } from "viem/chains";

/**
 * Register a market after it's been created on-chain
 * Called by frontend after successful transaction
 * Extracts market address from transaction receipt
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { creatorAddress, txHash, metadataHash, ipfsCid, metadata, chainId } = body;

    if (!creatorAddress || !txHash || !metadataHash || !ipfsCid || !metadata) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Permission check
    const authorized = await isAuthorizedCreator(creatorAddress);
    if (!authorized) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Get market address from transaction receipt
    const chain = chainId === 1 ? mainnet : chainId === 11155111 ? sepolia : base;
    const client = createPublicClient({
      chain,
      transport: http(process.env.RPC_URL),
    });

    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    
    // Parse MarketCreated event
    const MARKET_FACTORY_ABI = [
      {
        type: "event",
        name: "MarketCreated",
        inputs: [
          { name: "market", type: "address", indexed: true },
          { name: "metadataHash", type: "bytes32", indexed: true },
          { name: "endTime", type: "uint256", indexed: true },
          { name: "creator", type: "address", indexed: false },
        ],
      },
    ] as const;

    const logs = parseEventLogs({
      abi: MARKET_FACTORY_ABI,
      logs: receipt.logs,
    });

    const marketCreatedEvent = logs.find((log) => log.eventName === "MarketCreated");
    if (!marketCreatedEvent) {
      return NextResponse.json(
        { error: "MarketCreated event not found in transaction" },
        { status: 400 }
      );
    }

    const marketAddress = marketCreatedEvent.args.market;

    // Check if market already registered
    const marketId = marketAddress.toLowerCase();
    const existing = await prisma.market.findUnique({
      where: { id: marketId },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        market: existing,
        message: "Market already registered",
      });
    }

    // Create market record in database
    const market = await prisma.market.create({
      data: {
        id: marketId,
        contractAddress: marketAddress,
        status: "OPEN",
        qYes: "0",
        qNo: "0",
        b: process.env.LMSR_B || "1000000000000000000",
        collateral: "0",
        version: 0,
        metadataHash,
        ipfsCid,
        title: metadata.title,
        description: metadata.description,
        category: metadata.category,
        resolutionSource: metadata.resolutionSource,
        endTime: BigInt(metadata.endTime),
      },
    });

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
    console.error("Market registration error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
