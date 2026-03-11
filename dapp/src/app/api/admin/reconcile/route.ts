import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { executeTrade } from '@/lib/lmsr/executeTrade';
import { Decimal } from '@prisma/client/runtime/library';

export async function POST(req: Request) {
  const secret = req.headers.get('x-admin-secret');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  const body = await req.json();
  const { quoteHash } = body;
  if (!quoteHash) return new Response('missing quoteHash', { status: 400 });

  const signed = await prisma.signedQuote.findUnique({ where: { quoteHash } });
  if (!signed) return new Response('signed quote not found', { status: 404 });
  if (signed.status === 'COMMITTED') return NextResponse.json({ ok: true, already: true });

  // Build executeTrade payload from signed quote
  //const side = signed.isSell ? (signed.minReturn && BigInt(signed.minReturn.toString()) > 0n ? 'YES' : 'YES') : 'YES';
  // Determine side from stored amount? We need to infer side from scope: signedQuote doesn't store outcome; look up trade by quoteHash is not available.
  // For now, require the event payload to be passed for reconciliation.

  const event = body.event;
  if (!event) return new Response('missing event payload (outcome/amount)', { status: 400 });

  const { trader, marketId, outcome, amount, cost, isSell, marketVersion } = event;

  try {
    // Call the server-side executeTrade to apply DB changes atomically
    // For reconciliation, use placeholder txHash and blockNumber (actual on-chain values)
    const txHash = body.txHash || `reconcile-${quoteHash}`;
    const blockNumber = body.blockNumber || 0n;

    await executeTrade({
      marketId,
      side: outcome === 0 ? 'YES' : 'NO',
      amount: new Decimal(amount),
      expectedCost: new Decimal(cost),
      expectedVersion: marketVersion,
      trader,
      isSell: Boolean(isSell),
      transactionHash: txHash,
      blockNumber: BigInt(blockNumber),
    });


    // Mark signed quote committed and update trader nonce
    await prisma.$transaction(async (tx) => {
      await tx.signedQuote.update({
        where: { quoteHash },
        data: { status: 'COMMITTED' },
      });

      await tx.traderNonce.upsert({
        where: {
          trader_marketId: {
            trader: signed.trader,
            marketId: signed.marketId,
          },
        },
        create: {
          trader: signed.trader,
          marketId: signed.marketId,
          lastNonce: signed.nonce,
        },
        update: { lastNonce: signed.nonce },
      });
    });
    ;


    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Internal server error';

    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500 }
    );
  }

}
