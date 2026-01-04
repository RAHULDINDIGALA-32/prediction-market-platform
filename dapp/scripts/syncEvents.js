#!/usr/bin/env node
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

      // Find signed quote by hash
      const signed = await prisma.signedQuote.findUnique({ where: { quoteHash: qh } });
      if (!signed) {
        console.log("No matching signed quote found for hash", qh);
        return;
      }

      // Update signed quote status and trader nonce
      await prisma.$transaction(async (tx) => {
        await tx.signedQuote.update({ where: { quoteHash: qh }, data: { status: "COMMITTED" } });

        // update server-side nonce to the nonce used
        await tx.traderNonce.upsert({
          where: { trader_marketId: { trader: signed.trader, marketId: signed.marketId } },
          create: { trader: signed.trader, marketId: signed.marketId, lastNonce: signed.nonce },
          update: { lastNonce: signed.nonce },
        });
      });

      console.log("Reconciled signed quote and updated nonce for", signed.trader);
    } catch (err) {
      console.error("Error handling event:", err);
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
