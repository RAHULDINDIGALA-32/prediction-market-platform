/**
 * Oracle Sync API Endpoint
 * Handles synchronization of oracle events (proposals, disputes, resolutions) with the database
 * Triggered by client after transaction confirmation
 *
 * @author Platform Team
 * @version 1.0.0
 * @date January 19, 2026
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/oracle/sync
 *
 * Synchronizes oracle events with the database after on-chain transaction confirmation
 *
 * Request body:
 * {
 *   action: "propose" | "dispute" | "resolve" | "finalize"
 *   marketId: string
 *   marketAddress: string (for audit trail)
 *   proposer/disputer/resolver: string (user address)
 *   proposedOutcome/finalOutcome: "YES" | "NO"
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

    // Verify market exists
    const market = await prisma.market.findUnique({
      where: { id: marketId },
      select: { id: true, status: true, contractAddress: true },
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

    // Log the sync request
    console.log(
      `[ORACLE SYNC] Action: ${action}, Market: ${marketId}, TxHash: ${transactionHash}, Block: ${blockNumber}`
    );

    let result;

    switch (action) {
      case "propose":
        result = await handlePropose(marketId, transactionHash, blockNumber, data);
        break;

      case "dispute":
        result = await handleDispute(marketId, transactionHash, blockNumber, data);
        break;

      case "resolve":
        result = await handleResolve(marketId, transactionHash, blockNumber, data);
        break;

      case "finalize":
        result = await handleFinalize(marketId, transactionHash, blockNumber, data);
        break;

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unknown action: ${action}. Expected: propose, dispute, resolve, or finalize`,
          },
          { status: 400 }
        );
    }

    console.log(
      `[ORACLE SYNC SUCCESS] Action: ${action}, Market: ${marketId}, Status: Success`
    );

    return NextResponse.json({
      success: true,
      action,
      marketId,
      ...result,
    });
  } catch (error: any) {
    console.error(
      `[ORACLE SYNC ERROR] Error type: ${error.name}, Message: ${error.message}, Stack: ${error.stack}`
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
 * Handle oracle proposal sync
 */
async function handlePropose(
  marketId: string,
  transactionHash: string,
  blockNumber: number,
  data: any
) {
  const { proposer, proposedOutcome } = data;

  if (!proposer || !proposedOutcome) {
    throw new Error("Missing required fields: proposer, proposedOutcome");
  }

  // Check if oracle event already exists for this market (prevent duplicates)
  const existingEvent = await prisma.oracleEvent.findFirst({
    where: { marketId },
    select: { id: true, proposalTxHash: true },
  });

  if (existingEvent?.proposalTxHash === transactionHash) {
    console.log(`[ORACLE SYNC] Duplicate proposal sync detected for ${marketId}, skipping`);
    return {
      oracleEvent: existingEvent,
      isDuplicate: true,
    };
  }

  // Create OracleEvent for the proposal
  const oracleEvent = await prisma.oracleEvent.create({
    data: {
      marketId,
      proposer,
      proposed: proposedOutcome === "YES" ? "YES" : "NO",
      proposalTxHash: transactionHash,
      proposalBlock: BigInt(blockNumber),
      disputed: false,
      createdAt: new Date(),
    },
    select: {
      id: true,
      marketId: true,
      proposer: true,
      proposed: true,
      proposalTxHash: true,
      proposalBlock: true,
      createdAt: true,
    },
  });

  // Update Market status to CLOSED (trading window closed)
  const updatedMarket = await prisma.market.update({
    where: { id: marketId },
    data: {
      status: "CLOSED",
      updatedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      updatedAt: true,
    },
  });

  return {
    oracleEvent,
    market: updatedMarket,
    message: "Proposal synced successfully - market closed for trading",
  };
}

/**
 * Handle oracle dispute sync
 */
async function handleDispute(
  marketId: string,
  transactionHash: string,
  blockNumber: number,
  data: any
) {
  const { disputer } = data;

  if (!disputer) {
    throw new Error("Missing required field: disputer");
  }

  // Get the latest oracle event for this market
  const latestEvent = await prisma.oracleEvent.findFirst({
    where: { marketId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      disputed: true,
      disputeTxHash: true,
    },
  });

  if (!latestEvent) {
    throw new Error(`No oracle event found for market ${marketId} to dispute`);
  }

  // Prevent duplicate disputes
  if (latestEvent.disputed && latestEvent.disputeTxHash === transactionHash) {
    console.log(`[ORACLE SYNC] Duplicate dispute detected for ${marketId}, skipping`);
    return {
      oracleEvent: latestEvent,
      isDuplicate: true,
    };
  }

  // Update OracleEvent to mark as disputed
  const updatedEvent = await prisma.oracleEvent.update({
    where: { id: latestEvent.id },
    data: {
      disputed: true,
      disputer,
      disputedAt: new Date(),
      disputeTxHash: transactionHash,
      disputeBlock: BigInt(blockNumber),
    },
    select: {
      id: true,
      marketId: true,
      proposer: true,
      disputer: true,
      disputed: true,
      disputedAt: true,
      disputeTxHash: true,
      disputeBlock: true,
    },
  });

  // Note: Market status stays CLOSED - DISPUTED is off-chain state
  // Settlement logic must check OracleEvent.disputed field

  return {
    oracleEvent: updatedEvent,
    message: "Dispute recorded - market now in dispute resolution phase",
  };
}

/**
 * Handle oracle resolution sync
 */
async function handleResolve(
  marketId: string,
  transactionHash: string,
  blockNumber: number,
  data: any
) {
  const { finalOutcome } = data;

  if (!finalOutcome) {
    throw new Error("Missing required field: finalOutcome");
  }

  // Get the latest oracle event for this market
  const latestEvent = await prisma.oracleEvent.findFirst({
    where: { marketId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      finalized: true,
      resolutionTxHash: true,
    },
  });

  if (!latestEvent) {
    throw new Error(`No oracle event found for market ${marketId} to resolve`);
  }

  // Prevent duplicate resolutions
  if (latestEvent.finalized && latestEvent.resolutionTxHash === transactionHash) {
    console.log(`[ORACLE SYNC] Duplicate resolution detected for ${marketId}, skipping`);
    return {
      oracleEvent: latestEvent,
      isDuplicate: true,
    };
  }

  // Update OracleEvent with finalized outcome
  const updatedEvent = await prisma.oracleEvent.update({
    where: { id: latestEvent.id },
    data: {
      finalized: finalOutcome === "YES" ? "YES" : "NO",
      finalizedAt: new Date(),
      resolutionTxHash: transactionHash,
      resolutionBlock: BigInt(blockNumber),
    },
    select: {
      id: true,
      marketId: true,
      proposed: true,
      finalized: true,
      finalizedAt: true,
      resolutionTxHash: true,
      resolutionBlock: true,
    },
  });

  // Update Market status to RESOLVED (enables settlement phase)
  const updatedMarket = await prisma.market.update({
    where: { id: marketId },
    data: {
      status: "RESOLVED",
      updatedAt: new Date(),
    },
    select: {
      id: true,
      status: true,
      updatedAt: true,
    },
  });

  return {
    oracleEvent: updatedEvent,
    market: updatedMarket,
    message: "Outcome finalized - market transitioned to RESOLVED for settlement",
  };
}

/**
 * Handle oracle finalization sync (undisputed outcomes)
 */
async function handleFinalize(
  marketId: string,
  transactionHash: string,
  blockNumber: number,
  data: any
) {
  // For undisputed outcomes, finalize uses same logic as resolve
  // The difference is on-chain: finalize is called after dispute window expires
  return handleResolve(marketId, transactionHash, blockNumber, data);
}
