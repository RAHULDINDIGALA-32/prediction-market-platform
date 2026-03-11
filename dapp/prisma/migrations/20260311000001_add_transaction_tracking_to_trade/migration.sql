/*
  Warnings:

  - Added the required column `blockNumber` to the `Trade` table without a default value. This will fail if there are existing `Trade` rows.
  - Added the required column `transactionHash` to the `Trade` table without a default value. This will fail if there are existing `Trade` rows.

*/
-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "blockNumber" BIGINT NOT NULL,
ADD COLUMN     "transactionHash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Trade_transactionHash_key" ON "Trade"("transactionHash");

-- CreateIndex
CREATE INDEX "Trade_trader_idx" ON "Trade"("trader");

-- CreateIndex
CREATE INDEX "Trade_transactionHash_idx" ON "Trade"("transactionHash");
