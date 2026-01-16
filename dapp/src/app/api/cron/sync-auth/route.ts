import { NextRequest, NextResponse } from 'next/server';
import { triggerAuthorizationSync } from '@/lib/authorizationSyncService';

/**
 * Vercel Cron Function - Syncs authorization state from blockchain
 * 
 * Triggered automatically by Vercel based on schedule in vercel.json
 */
export async function GET(request: NextRequest) {
  // Verify request is from Vercel (CRON_SECRET header)
  const authHeader = request.headers.get('authorization');
  const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedSecret) {
    console.warn('❌ Unauthorized cron request');
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    console.log('🔄 Starting authorization sync via Vercel Cron...');
    const startTime = Date.now();

    // Trigger the sync
    const metrics = await triggerAuthorizationSync();
    
    const duration = Date.now() - startTime;

    console.log(`✅ Sync completed in ${duration}ms`);
    console.log(`   Events processed: ${metrics.eventsProcessed}`);
    console.log(`   Success count: ${metrics.successCount}`);
    console.log(`   Failure count: ${metrics.failureCount}`);

    return NextResponse.json(
      {
        success: true,
        message: 'Authorization sync completed',
        duration,
        metrics,
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Sync failed:', errorMessage);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
