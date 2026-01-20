#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { ethers } = require("ethers");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const RPC = process.env.RPC_URL || "http://localhost:8545";
const provider = new ethers.JsonRpcProvider(RPC);

// Minimal ABI for TradeExecuted event
const ABI = [
  "event TradeExecuted(address indexed trader, uint8 indexed outcome, uint256 indexed amount, uint256 cost, bytes32 quoteHash)"
];

async function main() {
  console.log("Listening for TradeExecuted events on provider:", RPC);
  const iface = new ethers.Interface(ABI);
  const topic = iface.getEventTopic("TradeExecuted");

  provider.on(topic, async (log) => {
    try {
      const parsed = iface.parseLog(log);
      const { trader, outcome, amount, cost, quoteHash } = parsed.args;
      const qh = quoteHash.toString();
      console.log("TradeExecuted event:", { trader, outcome: Number(outcome), amount: amount.toString(), cost: cost.toString(), quoteHash: qh });

      // Post to reconcile endpoint for server-side processing
      const apiUrl = process.env.SERVER_URL || 'http://localhost:3000/api/admin/reconcile';
      const adminSecret = process.env.ADMIN_SECRET || '';

      const payload = {
        quoteHash: qh,
        event: {
          trader: trader.toString(),
          outcome: Number(outcome),
          amount: amount.toString(),
          cost: cost.toString(),
          marketId: parsed.address, // fallback: event emitter address (market)
          isSell: false,
          marketVersion: 0
        }
      };

      // Try to guess DB marketId by looking up SignedQuote first
      const signed = await prisma.signedQuote.findUnique({ where: { quoteHash: qh } });
      if (signed) payload.event.marketId = signed.marketId;

      // Optionally include marketVersion from signed quote
      if (signed && signed.marketVersion) payload.event.marketVersion = signed.marketVersion;

      const fetchFn = globalThis.fetch || (await import('node-fetch')).default;
      const res = await fetchFn(apiUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-secret': adminSecret },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('Reconcile failed:', res.status, text);
      } else {
        console.log('Reconcile succeeded for', qh);
      }
    } catch (err) {
      console.error("Error handling event:", err);
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
