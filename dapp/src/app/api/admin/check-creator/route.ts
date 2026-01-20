import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCreator, isAdmin } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Address required" }, { status: 400 });
  }

  try {
    const authorized = await isAuthorizedCreator(address);
    const admin = await isAdmin(address);
    return NextResponse.json({ authorized, isAdmin: admin });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to check authorization", details: errorMessage },
      { status: 500 }
    );
  }
}

