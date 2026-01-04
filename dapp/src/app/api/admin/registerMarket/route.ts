import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  const secret = req.headers.get('x-admin-secret');
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  const body = await req.json();
  const { marketId, contractAddress } = body;
  if (!marketId || !contractAddress) {
    return new Response('invalid payload', { status: 400 });
  }

  try {
    await prisma.market.update({ where: { id: marketId }, data: { contractAddress } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500 });
  }
}
