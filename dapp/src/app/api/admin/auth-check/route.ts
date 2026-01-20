/**
 * @description Fast authorization check API endpoint
 * 
 * Queries include:
 * - GET /api/admin/auth-check?address=0x...&type=creator
 * - GET /api/admin/auth-check?address=0x...&type=signer
 * - GET /api/admin/auth-check?address=0x...&type=resolver
 * 
 * Response times:
 * - Cache hit: ~1-5ms
 * - DB hit: ~10-50ms
 * - Cache miss: negligible fallback latency
 * 
 * No RPC calls in normal operation!
 */

import { NextRequest, NextResponse } from "next/server";
import {
  isWhitelistedCreator,
  isAuthorizedSigner,
  isOracleResolver,
} from "@/lib/authorization";
import { ethers } from "ethers";

interface AuthCheckResponse {
  success: boolean;
  address: string;
  type: "creator" | "signer" | "resolver";
  isAuthorized: boolean;
  cached: boolean;
  error?: string;
}

export async function GET(req: NextRequest): Promise<NextResponse<AuthCheckResponse>> {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");
    const type = searchParams.get("type") as "creator" | "signer" | "resolver" ;

    // Validate inputs
    if (!address || !type) {
      return NextResponse.json(
        {
          success: false,
          address: address || "0x0000000000000000000000000000000000000000",
          type: type,
          isAuthorized: false,
          cached: false,
          error: "Missing required parameters: address, type",
        },
        { status: 400 }
      );
    }

    if (!ethers.isAddress(address)) {
      return NextResponse.json(
        {
          success: false,
          address,
          type,
          isAuthorized: false,
          cached: false,
          error: "Invalid Ethereum address format",
        },
        { status: 400 }
      );
    }

    if (!["creator", "signer", "resolver"].includes(type)) {
      return NextResponse.json(
        {
          success: false,
          address,
          type,
          isAuthorized: false,
          cached: false,
          error: "Invalid type. Must be: creator, signer, or resolver",
        },
        { status: 400 }
      );
    }

    // Check authorization (uses cached values)
    let isAuthorized: boolean;

    switch (type) {
      case "creator":
        isAuthorized = await isWhitelistedCreator(address);
        break;
      case "signer":
        isAuthorized = await isAuthorizedSigner(address);
        break;
      case "resolver":
        isAuthorized = await isOracleResolver(address);
        break;
      default:
        throw new Error(`Unknown type: ${type}`);
    }

    return NextResponse.json({
      success: true,
      address: address.toLowerCase(),
      type,
      isAuthorized,
      cached: true, // All lookups use cache-first strategy
    });
  } catch (error: unknown) {
    console.error("Authorization check error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";

    return NextResponse.json(
      {
        success: false,
        address: "unknown",
        type: "creator",
        isAuthorized: false,
        cached: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
