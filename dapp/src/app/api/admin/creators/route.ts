import { NextRequest, NextResponse } from "next/server";
import { isAdmin, addCreator, removeCreator, getAllCreators } from "@/lib/permissions";

/**
 * GET: List all whitelisted creators
 * POST: Add a creator to whitelist
 * DELETE: Remove a creator from whitelist
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

    // Check if requester is admin
    const admin = await isAdmin(address);
    if (!admin) {
      return NextResponse.json(
        { error: "Unauthorized: Admin access required" },
        { status: 403 }
      );
    }

    const creators = await getAllCreators();
    return NextResponse.json({ creators });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { adminAddress, creatorAddress, role = "EDITOR" } = body;

    if (!adminAddress || !creatorAddress) {
      return NextResponse.json(
        { error: "Admin address and creator address required" },
        { status: 400 }
      );
    }

    // Check if requester is admin
    const admin = await isAdmin(adminAddress);
    if (!admin) {
      return NextResponse.json(
        { error: "Unauthorized: Admin access required" },
        { status: 403 }
      );
    }

    const creator = await addCreator(creatorAddress, role);
    return NextResponse.json({ success: true, creator });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

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

    // Check if requester is admin
    const admin = await isAdmin(adminAddress);
    if (!admin) {
      return NextResponse.json(
        { error: "Unauthorized: Admin access required" },
        { status: 403 }
      );
    }

    await removeCreator(creatorAddress);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

