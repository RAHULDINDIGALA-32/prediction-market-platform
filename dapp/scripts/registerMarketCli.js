#!/usr/bin/env node
const fetch = require('node-fetch');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: registerMarketCli.js <marketId> <contractAddress>');
    process.exit(1);
  }
  const [marketId, contractAddress] = args;
  const apiUrl = process.env.SERVER_URL || 'http://localhost:3000/api/admin/registerMarket';
  const adminSecret = process.env.ADMIN_SECRET || '';

  const fetchFn = globalThis.fetch || (await import('node-fetch')).default;
  const res = await fetchFn(apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-secret': adminSecret },
    body: JSON.stringify({ marketId, contractAddress }),
  });
  const text = await res.text();
  console.log('status', res.status, text);
}

main().catch((e) => { console.error(e); process.exit(1); });
