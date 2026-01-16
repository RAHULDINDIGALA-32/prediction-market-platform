import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ethers } from 'ethers';

/**
 * POST /api/admin/resolvers
 * Add or remove an oracle resolver
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminAddress, resolverAddress, isAllowed, txHash } = body;

    // Validate inputs
    if (!ethers.isAddress(adminAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid admin address' },
        { status: 400 }
      );
    }

    if (!ethers.isAddress(resolverAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid resolver address' },
        { status: 400 }
      );
    }

    if (typeof isAllowed !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Invalid status' },
        { status: 400 }
      );
    }

    if (!txHash || typeof txHash !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid transaction hash' },
        { status: 400 }
      );
    }

    const normalizedResolver = resolverAddress.toLowerCase();

    // Store in database
    const resolver = await prisma.oracleResolver.upsert({
      where: { address: normalizedResolver },
      update: {
        isAllowed,
        updatedAt: new Date(),
      },
      create: {
        address: normalizedResolver,
        isAllowed,
      },
    });

    return NextResponse.json(
      {
        success: true,
        resolver,
        message: isAllowed ? 'Resolver added' : 'Resolver removed',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error managing resolver:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/resolvers
 * Fetch all oracle resolvers
 */
export async function GET(request: NextRequest) {
  try {
    const resolvers = await prisma.oracleResolver.findMany({
      where: { isAllowed: true },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(
      {
        success: true,
        resolvers: resolvers.map((r) => ({
          id: r.id,
          address: r.address,
          isAllowed: r.isAllowed,
          createdAt: r.createdAt,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching resolvers:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
