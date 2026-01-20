import { NextResponse } from 'next/server';
import { executeTrade } from '@/lib/lmsr/executeTrade';

export async function POST(req: Request) {
  const body = await req.json();
  try {
    const result = await executeTrade(body);
    return NextResponse.json({ ok: true, result });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ ok: false, error: errorMessage }), { status: 400 });
  }
}
