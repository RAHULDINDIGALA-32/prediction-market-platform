const fetch = require('node-fetch');

// Simple integration test script. Assumes your Next dev server is running at http://localhost:3000
// and environment variables QUOTE_SIGNER_KEY and QUOTE_VERIFIER_ADDRESS are configured for the server.

async function requestQuote(payload) {
  const res = await fetch('http://localhost:3000/api/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function executeTrade(payload) {
  const res = await fetch('http://localhost:3000/api/test/executeTrade', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function main() {
  console.log('Starting integration test. Make sure Next dev is running at http://localhost:3000');

  const marketId = process.env.TEST_MARKET_ID || 'test-market-1';
  const trader = process.env.TEST_TRADER || '0x0000000000000000000000000000000000000001';

  const payload = { marketId, trader, side: 'YES', amount: '1000000000000000000' };

  // Concurrently request two quotes
  console.log('Requesting quotes concurrently (2 requests)');
  const [q1, q2] = await Promise.all([requestQuote(payload), requestQuote(payload)]);
  console.log('Quote responses:', q1, q2);

  // Use first quote to execute trade via test endpoint
  if (!q1.quote) {
    console.error('First quote failed:', q1);
    process.exit(1);
  }

  const executePayload = {
    marketId: payload.marketId,
    side: payload.side,
    amount: q1.quote.amount,
    expectedCost: q1.quote.cost,
    expectedVersion: q1.quote.marketVersion,
    trader: q1.quote.trader,
  };

  console.log('Executing trade with first quote');
  const execRes1 = await executeTrade(executePayload);
  console.log('Execution result 1:', execRes1);

  // Attempt to execute second quote (should fail due to stale version or nonce)
  const executePayload2 = {
    marketId: payload.marketId,
    side: payload.side,
    amount: q2.quote.amount,
    expectedCost: q2.quote.cost,
    expectedVersion: q2.quote.marketVersion,
    trader: q2.quote.trader,
  };

  console.log('Executing trade with second quote (expected to fail)');
  const execRes2 = await executeTrade(executePayload2);
  console.log('Execution result 2:', execRes2);

  if (execRes1.ok && !execRes2.ok) {
    console.log('Integration test passed: concurrent quotes and stale-quote rejection behaved as expected.');
    process.exit(0);
  } else {
    console.error('Integration test unexpected results.');
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
