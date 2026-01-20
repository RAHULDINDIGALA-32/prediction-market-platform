/**
 * @description Execute a trade with on-chain confirmation before database update
 * Ensures database consistency: trades update only after successful on-chain execution
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { executeTrade } from '@/lib/lmsr/executeTrade';
import { Decimal } from '@prisma/client/runtime/library';
import { ethers } from 'ethers';

interface TradeExecutionRequest {
  // On-chain transaction confirmation
  txHash: string;
  txBlockNumber: number;
  
  // Quote data for verification
  marketId: string;
  trader: string;
  outcome: 0 | 1; // YES=0, NO=1
  amount: string; // wei as string
  cost: string; // wei as string
  isSell: boolean;
  nonce: string;
  marketVersion: number;
  signature: string;
}

interface TradeExecutionResponse {
  success: boolean;
  txHash?: string;
  error?: string;
  message?: string;
}

/**
 * POST /api/trades/execute
 * 
 * Execute a trade after on-chain confirmation
 * Database updates only proceed if on-chain transaction is confirmed
 * 
 * Request body:
 * - txHash: Confirmed transaction hash from Market.executeTrade()
 * - txBlockNumber: Block number where transaction was confirmed
 * - marketId: Market identifier
 * - trader: Trader address
 * - outcome: 0 (YES) or 1 (NO)
 * - amount: Token amount in wei
 * - cost: ETH cost in wei
 * - isSell: Whether this is a sell trade
 * - nonce: Trader's nonce for replay prevention
 * - marketVersion: Expected market version
 * - signature: EIP-712 signature
 */
export async function POST(req: NextRequest): Promise<NextResponse<TradeExecutionResponse>> {
  try {
    const body: TradeExecutionRequest = await req.json();
    const {
      txHash,
      txBlockNumber,
      marketId,
      trader,
      outcome,
      amount,
      cost,
      isSell,
      nonce,
      marketVersion,
      signature,
    } = body;

    // Validate all required fields
    if (
      !txHash ||
      txBlockNumber === undefined ||
      !marketId ||
      !trader ||
      outcome === undefined ||
      !amount ||
      !cost ||
      isSell === undefined ||
      !nonce ||
      marketVersion === undefined ||
      !signature
    ) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate address format
    if (!ethers.isAddress(trader)) {
      return NextResponse.json(
        { success: false, error: 'Invalid trader address' },
        { status: 400 }
      );
    }

    // Validate outcome
    if (outcome !== 0 && outcome !== 1) {
      return NextResponse.json(
        { success: false, error: 'Invalid outcome (must be 0 or 1)' },
        { status: 400 }
      );
    }

    // Validate numeric fields
    let amountBigInt: bigint;
    let costBigInt: bigint;
    let nonceBigInt: bigint;

    try {
      amountBigInt = BigInt(amount);
      costBigInt = BigInt(cost);
      nonceBigInt = BigInt(nonce);

      if (amountBigInt <= 0n || costBigInt < 0n) {
        throw new Error('Amount and cost must be non-negative');
      }
    } catch (_err) {
      return NextResponse.json(
        { success: false, error: `Invalid numeric values: ${_err}` },
        { status: 400 }
      );
    }

    // Check that market exists
    const market = await prisma.market.findUnique({
      where: { id: marketId },
      select: {
        id: true,
        version: true,
        status: true,
        qYes: true,
        qNo: true,
        lmsrB: true,
      },
    });

    if (!market) {
      return NextResponse.json(
        { success: false, error: 'Market not found' },
        { status: 404 }
      );
    }

    if (market.status !== 'OPEN') {
      return NextResponse.json(
        { success: false, error: 'Market is not open' },
        { status: 400 }
      );
    }

    if (market.version !== marketVersion) {
      return NextResponse.json(
        { success: false, error: 'Market version mismatch - quote is stale' },
        { status: 400 }
      );
    }

    // Check if quote was already executed
    const existingQuote = await prisma.signedQuote.findUnique({
      where: {
        quoteHash: ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            [
              'address',
              'address',
              'uint8',
              'uint256',
              'uint256',
              'uint256',
              'uint256',
              'bool',
              'uint256',
              'uint256',
            ],
            [trader, market.id, outcome, amountBigInt, costBigInt, 0, nonceBigInt, isSell, 0, 0]
          )
        ),
      },
    });

    if (existingQuote && existingQuote.status === 'COMMITTED') {
      return NextResponse.json(
        {
          success: true,
          message: 'Trade already executed',
          txHash: txHash,
        },
        { status: 200 }
      );
    }

    // Execute trade in database (only after on-chain confirmation)
    // Market state is updated atomically
    try {
      await executeTrade({
        marketId,
        side: outcome === 0 ? 'YES' : 'NO',
        amount: new Decimal(amountBigInt.toString()),
        expectedCost: new Decimal(costBigInt.toString()),
        expectedVersion: marketVersion,
        trader,
        isSell,
      });

      // Mark signed quote as committed
      await prisma.signedQuote.upsert({
        where: { quoteHash: ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'address', 'uint8', 'uint256', 'uint256', 'uint256', 'uint256', 'bool', 'uint256', 'uint256'],
            [trader, market.id, outcome, amountBigInt, costBigInt, 0, nonceBigInt, isSell, 0, 0]
          )
        ) },
        update: { status: 'COMMITTED' },
        create: {
          trader,
          marketId,
          quoteHash: ethers.keccak256(
            ethers.AbiCoder.defaultAbiCoder().encode(
              ['address', 'address', 'uint8', 'uint256', 'uint256', 'uint256', 'uint256', 'bool', 'uint256', 'uint256'],
              [trader, market.id, outcome, amountBigInt, costBigInt, 0, nonceBigInt, isSell, 0, 0]
            )
          ),
          signature,
          amount: new Decimal(amountBigInt.toString()),
          cost: new Decimal(costBigInt.toString()),
          nonce: nonceBigInt,
          isSell,
          marketVersion,
          status: 'COMMITTED',
        },
      });

      // Update trader nonce
      await prisma.traderNonce.upsert({
        where: { trader_marketId: { trader, marketId } },
        update: { lastNonce: nonceBigInt },
        create: { trader, marketId, lastNonce: nonceBigInt },
      });

      return NextResponse.json(
        {
          success: true,
          message: 'Trade executed successfully',
          txHash,
        },
        { status: 201 }
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Trade execution failed";
      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
        },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    console.error('Trade execution error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
