/**
 * Settlement Sync API Endpoint
 * Handles synchronization of settlement events (redemptions, withdrawals) with the database
 * Triggered by client after transaction confirmation
 *
 * @author Platform Team
 * @version 1.0.0
 * @date January 19, 2026
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/settlement/sync
 *
 * Synchronizes settlement events with the database after on-chain transaction confirmation
 *
 * Request body:
 * {
 *   action: "redeem" | "withdraw"
 *   marketId: string
 *   marketAddress: string (for audit trail)
 *   user/creator: string (user address)
 *   amount: string (in wei for redemption)
 *   transactionHash: string (for audit trail)
 *   blockNumber: number
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, marketId, transactionHash, blockNumber, ...data } = body;

    // Validate required fields
    if (!action || !marketId || !transactionHash || blockNumber === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: action, marketId, transactionHash, blockNumber",
        },
        { status: 400 }
      );
    }

    // Verify market exists and is in settlement phase
    const market = await prisma.market.findUnique({
      where: { id: marketId },
      select: {
        id: true,
        status: true,
        creator: true,
        contractAddress: true,
      },
    });

    if (!market) {
      return NextResponse.json(
        {
          success: false,
          error: `Market not found: ${marketId}`,
        },
        { status: 404 }
      );
    }

    // Verify market is in settlement phase (RESOLVED or SETTLED)
    if (market.status !== "RESOLVED" && market.status !== "SETTLED") {
      return NextResponse.json(
        {
          success: false,
          error: `Market must be RESOLVED or SETTLED for settlement operations. Current status: ${market.status}`,
        },
        { status: 400 }
      );
    }

    console.log(
      `[SETTLEMENT SYNC] Action: ${action}, Market: ${marketId}, TxHash: ${transactionHash}, Block: ${blockNumber}`
    );

    let result;

    switch (action) {
      case "redeem":
        result = await handleRedeem(marketId, transactionHash, blockNumber, data);
        break;

      case "withdraw":
        result = await handleWithdraw(marketId, transactionHash, blockNumber, data);
        break;

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unknown action: ${action}. Expected: redeem or withdraw`,
          },
          { status: 400 }
        );
    }

    console.log(
      `[SETTLEMENT SYNC SUCCESS] Action: ${action}, Market: ${marketId}, Status: Success`
    );

    return NextResponse.json({
      success: true,
      action,
      marketId,
      ...result,
    });
  } catch (error: any) {
    console.error(
      `[SETTLEMENT SYNC ERROR] Error type: ${error.name}, Message: ${error.message}, Stack: ${error.stack}`
    );

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Sync operation failed",
        action: "sync",
      },
      { status: 500 }
    );
  }
}

/**
 * Handle token redemption sync
 * ISSUE #5 RESOLUTION: Creates audit trail for token redemptions
 *
 * Updates:
 * 1. Create RedemptionEvent for audit trail
 * 2. Store user address and amount redeemed
 * 3. Record transaction hash and block number
 * 4. Prevent double-spending by checking transaction hash uniqueness
 */
async function handleRedeem(
  marketId: string,
  transactionHash: string,
  blockNumber: number,
  data: any
) {
  const { user, amount } = data;

  if (!user || !amount) {
    throw new Error("Missing required fields: user, amount");
  }

  // Check for duplicate redemption (same tx hash)
  const existingRedemption = await prisma.redemptionEvent.findUnique({
    where: { transactionHash },
    select: { id: true, marketId: true, user: true },
  });

  if (existingRedemption) {
    console.log(
      `[SETTLEMENT SYNC] Duplicate redemption detected for tx ${transactionHash}, skipping`
    );
    return {
      redemptionEvent: existingRedemption,
      isDuplicate: true,
    };
  }

  // Create RedemptionEvent for audit trail
  const redemptionEvent = await prisma.redemptionEvent.create({
    data: {
      marketId,
      user,
      amount: BigInt(amount),
      transactionHash,
      blockNumber: BigInt(blockNumber),
      createdAt: new Date(),
    },
    select: {
      id: true,
      marketId: true,
      user: true,
      amount: true,
      transactionHash: true,
      blockNumber: true,
      createdAt: true,
    },
  });

  return {
    redemptionEvent,
    message: "Redemption recorded - tokens burned and ETH transferred",
  };
}

/**
 * Handle creator withdrawal sync
 * ISSUE #6 RESOLUTION: Updates market to SETTLED after creator withdrawal
 *
 * Updates:
 * 1. Update Market status to SETTLED
 * 2. Create SettlementEvent for audit trail
 * 3. Store withdrawal transaction and block information
 * 4. Update market timestamp
 */
async function handleWithdraw(
  marketId: string,
  transactionHash: string,
  blockNumber: number,
  data: any
) {
  const { creator, amountWithdrawn } = data;

  if (!creator) {
    throw new Error("Missing required field: creator");
  }

  // Check for duplicate withdrawal
  const existingSettlement = await prisma.settlementEvent.findUnique({
    where: { transactionHash },
    select: { id: true, marketId: true },
  });

  if (existingSettlement) {
    console.log(
      `[SETTLEMENT SYNC] Duplicate withdrawal detected for tx ${transactionHash}, skipping`
    );
    return {
      settlementEvent: existingSettlement,
      isDuplicate: true,
    };
  }

  // Create SettlementEvent for audit trail
  const settlementEvent = await prisma.settlementEvent.create({
    data: {
      marketId,
      creator,
      amountWithdrawn: amountWithdrawn ? BigInt(amountWithdrawn) : 0n,
      transactionHash,
      blockNumber: BigInt(blockNumber),
      createdAt: new Date(),
    },
    select: {
      id: true,
      marketId: true,
      creator: true,
      amountWithdrawn: true,
      transactionHash: true,
      blockNumber: true,
      createdAt: true,
    },
  });

  // Update Market status to SETTLED (final state)
  const updatedMarket = await prisma.market.update({
    where: { id: marketId },
    data: {
      status: "SETTLED",
      updatedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      updatedAt: true,
    },
  });

  return {
    settlementEvent,
    market: updatedMarket,
    message: "Creator withdrawal finalized - market transitioned to SETTLED",
  };
}
