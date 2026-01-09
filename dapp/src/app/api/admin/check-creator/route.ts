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
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to check authorization", details: error.message },
      { status: 500 }
    );
  }
}

