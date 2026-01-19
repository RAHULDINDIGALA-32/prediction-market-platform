/*
  Warnings:

  - A unique constraint covering the columns `[proposalTxHash]` on the table `OracleEvent` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[disputeTxHash]` on the table `OracleEvent` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[resolutionTxHash]` on the table `OracleEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "OracleEvent" ADD COLUMN     "disputeBlock" BIGINT,
ADD COLUMN     "disputeTxHash" TEXT,
ADD COLUMN     "disputed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "proposalBlock" BIGINT,
ADD COLUMN     "proposalTxHash" TEXT,
ADD COLUMN     "resolutionBlock" BIGINT,
ADD COLUMN     "resolutionTxHash" TEXT,
ALTER COLUMN "finalizedAt" DROP NOT NULL,
ALTER COLUMN "finalizedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "RedemptionEvent" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedemptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementEvent" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "creator" TEXT NOT NULL,
    "amountWithdrawn" BIGINT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RedemptionEvent_transactionHash_key" ON "RedemptionEvent"("transactionHash");

-- CreateIndex
CREATE INDEX "RedemptionEvent_marketId_idx" ON "RedemptionEvent"("marketId");

-- CreateIndex
CREATE INDEX "RedemptionEvent_user_idx" ON "RedemptionEvent"("user");

-- CreateIndex
CREATE INDEX "RedemptionEvent_transactionHash_idx" ON "RedemptionEvent"("transactionHash");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementEvent_transactionHash_key" ON "SettlementEvent"("transactionHash");

-- CreateIndex
CREATE INDEX "SettlementEvent_marketId_idx" ON "SettlementEvent"("marketId");

-- CreateIndex
CREATE INDEX "SettlementEvent_creator_idx" ON "SettlementEvent"("creator");

-- CreateIndex
CREATE INDEX "SettlementEvent_transactionHash_idx" ON "SettlementEvent"("transactionHash");

-- CreateIndex
CREATE UNIQUE INDEX "OracleEvent_proposalTxHash_key" ON "OracleEvent"("proposalTxHash");

-- CreateIndex
CREATE UNIQUE INDEX "OracleEvent_disputeTxHash_key" ON "OracleEvent"("disputeTxHash");

-- CreateIndex
CREATE UNIQUE INDEX "OracleEvent_resolutionTxHash_key" ON "OracleEvent"("resolutionTxHash");

-- CreateIndex
CREATE INDEX "OracleEvent_finalized_idx" ON "OracleEvent"("finalized");

-- AddForeignKey
ALTER TABLE "RedemptionEvent" ADD CONSTRAINT "RedemptionEvent_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementEvent" ADD CONSTRAINT "SettlementEvent_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
