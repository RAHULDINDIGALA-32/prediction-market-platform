/**
 * @description Execute a trade with on-chain confirmation before database update
 * Ensures database consistency: trades update only after successful on-chain execution
 * 
 * All writes (Trade, Market, SignedQuote, TraderNonce) happen atomically in a single transaction.
 * Optimistic versioning prevents race conditions on concurrent trades to the same market.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
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
  message?: string;
  error?: string;
  data?: {
    trade: {
      id: string;
      marketId: string;
      side: string;
      amount: string;
      cost: string;
      trader: string;
      transactionHash: string;
      blockNumber: string;
      createdAt: string;
    };
    market: {
      id: string;
      qYes: string;
      qNo: string;
      collateral: string;
      version: number;
      updatedAt: string;
    };
    txHash: string;
  };
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

    //  Check if trade with this txHash already exists
    const existingTrade = await prisma.trade.findFirst({
      where: { transactionHash: txHash },
      include: { market: true },
    });

    if (existingTrade) {
      // Market is always included, so it's never null
      const market = existingTrade.market;
      
      return NextResponse.json(
        {
          success: true,
          message: 'Trade already executed',
          data: {
            trade: {
              id: existingTrade.id,
              marketId: existingTrade.marketId,
              side: existingTrade.side,
              amount: existingTrade.amount.toString(),
              cost: existingTrade.cost.toString(),
              trader: existingTrade.trader,
              transactionHash: existingTrade.transactionHash,
              blockNumber: existingTrade.blockNumber.toString(),
              createdAt: existingTrade.createdAt.toISOString(),
            },
            market: {
              id: market.id,
              qYes: market.qYes.toString(),
              qNo: market.qNo.toString(),
              collateral: market.collateral.toString(),
              version: market.version,
              updatedAt: market.updatedAt.toISOString(),
            },
            txHash,
          },
        },
        { status: 200 }
      );
    }

    // Check that market exists and fetch current state
    const market = await prisma.market.findUnique({
      where: { id: marketId },
      select: {
        id: true,
        version: true,
        status: true,
        qYes: true,
        qNo: true,
        collateral: true,
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

    //  Detect stale quotes
    if (market.version !== marketVersion) {
      return NextResponse.json(
        { success: false, error: `Market version mismatch - expected ${market.version}, got ${marketVersion}. Quote is stale.` },
        { status: 409 }
      );
    }

    //  YES=0 buys qYes, NO=1 buys qNo
    // LMSR: when you buy YES, qYes supply increases and you pay from collateral
    const isYesBuy = outcome === 0 && !isSell;
    const isYesSell = outcome === 0 && isSell;
    const isNoBuy = outcome === 1 && !isSell;
    const isNoSell = outcome === 1 && isSell;

    const newQYes = isYesBuy
      ? market.qYes.plus(amountBigInt.toString())
      : isYesSell
        ? market.qYes.minus(amountBigInt.toString())
        : market.qYes;

    const newQNo = isNoBuy
      ? market.qNo.plus(amountBigInt.toString())
      : isNoSell
        ? market.qNo.minus(amountBigInt.toString())
        : market.qNo;

    const newCollateral = !isSell
      ? market.collateral.plus(costBigInt.toString())
      : market.collateral.minus(costBigInt.toString());

    // Guard against impossible states
    if (newQYes.isNegative() || newQNo.isNegative() || newCollateral.isNegative()) {
      return NextResponse.json(
        { success: false, error: 'Trade would result in negative market state' },
        { status: 400 }
      );
    }

    // Atomic transaction: All writes happen together or not at all
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Create Trade record with marketVer
        const trade = await tx.trade.create({
          data: {
            marketId,
            side: outcome === 0 ? 'YES' : 'NO',
            amount: new Decimal(amountBigInt.toString()),
            cost: new Decimal(costBigInt.toString()),
            trader,
            marketVer: marketVersion,
            transactionHash: txHash,
            blockNumber: BigInt(txBlockNumber),
          },
        });

        // Update Market atomically with version check (optimistic lock)
        // If another trade updated this market, version won't match and update fails
        const updateResult = await tx.market.updateMany({
          where: { id: marketId, version: marketVersion }, // Optimistic lock
          data: {
            qYes: newQYes,
            qNo: newQNo,
            collateral: newCollateral,
            version: { increment: 1 }, // Increment version for next trade
          },
        });

        if (updateResult.count === 0) {
          throw new Error('OPTIMISTIC_LOCK_FAILED');
        }

        const updatedMarket = await tx.market.findUnique({
          where: { id: marketId },
        });

        if (!updatedMarket) {
          throw new Error('UPDATED_MARKET_NOT_FOUND');
        }

        // Upsert SignedQuote as COMMITTED
        const quoteHash = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'address', 'uint8', 'uint256', 'uint256', 'bool'],
            [trader, marketId, outcome, amountBigInt, costBigInt, isSell]
          )
        );

        await tx.signedQuote.upsert({
          where: { quoteHash },
          update: { status: 'COMMITTED' },
          create: {
            trader,
            marketId,
            quoteHash,
            signature,
            amount: new Decimal(amountBigInt.toString()),
            cost: new Decimal(costBigInt.toString()),
            nonce: nonceBigInt,
            isSell,
            marketVersion,
            status: 'COMMITTED',
          },
        });

        // Update TraderNonce atomically
        await tx.traderNonce.upsert({
          where: { trader_marketId: { trader, marketId } },
          update: { lastNonce: nonceBigInt },
          create: { trader, marketId, lastNonce: nonceBigInt },
        });

        return { trade, updatedMarket };
      });

      const response = {
        success: true,
        message: 'Trade executed successfully',
        data: {
          trade: {
            id: result.trade.id,
            marketId: result.trade.marketId,
            side: result.trade.side,
            amount: result.trade.amount.toString(),
            cost: result.trade.cost.toString(),
            trader: result.trade.trader,
            transactionHash: result.trade.transactionHash,
            blockNumber: result.trade.blockNumber.toString(),
            createdAt: result.trade.createdAt.toISOString(),
          },
          market: {
            id: result.updatedMarket.id,
            qYes: result.updatedMarket.qYes.toString(),
            qNo: result.updatedMarket.qNo.toString(),
            collateral: result.updatedMarket.collateral.toString(),
            version: result.updatedMarket.version,
            updatedAt: result.updatedMarket.updatedAt.toISOString(),
          },
          txHash,
        },
      };

      console.log('Trade execution successful:', {
        marketId,
        txHash,
        trader,
        outcome,
        amount: amountBigInt.toString(),
      });

      return NextResponse.json(response, { status: 201 });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.message.includes('P2025') || error.message === 'OPTIMISTIC_LOCK_FAILED')
      ) {
        console.error('Optimistic lock failure (concurrent trade):', {
          message: error.message,
          marketId,
          txHash,
        });
        return NextResponse.json(
          {
            success: false,
            error: 'Concurrent trade detected - market version changed. Please refresh and try again.',
          },
          { status: 409 }
        );
      }

      // Log detailed error information
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      const errorType = error instanceof Error ? error.constructor.name : typeof error;
      
      console.error('Trade execution transaction error:', {
        message: errorMessage,
        stack: errorStack,
        type: errorType,
        marketId,
        txHash,
        trader,
      });

      return NextResponse.json(
        {
          success: false,
          error: errorMessage || 'Trade execution failed in transaction',
        },
        { status: 400 }
      );
    }
  } catch (error: unknown) {
    // Top-level error handler for request parsing, validation, etc.
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorType = error instanceof Error ? error.constructor.name : typeof error;
    
    console.error('Trade execution request error:', {
      message: errorMessage,
      stack: errorStack,
      type: errorType,
      pathname: req.nextUrl.pathname,
    });

    return NextResponse.json(
      {
        success: false,
        error: errorMessage || 'Internal server error',
      },
      { status: 500 }
    );
  }
}
