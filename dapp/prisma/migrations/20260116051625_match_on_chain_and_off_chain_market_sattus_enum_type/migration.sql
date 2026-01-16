-- CreateEnum
CREATE TYPE "Outcome" AS ENUM ('YES', 'NO');

-- AlterTable
ALTER TABLE "Creator" ADD COLUMN     "isWhitelisted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "creator" TEXT,
ADD COLUMN     "subsidyAmount" DECIMAL(65,30);

-- CreateTable
CREATE TABLE "OracleEvent" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "proposer" TEXT NOT NULL,
    "disputer" TEXT,
    "proposed" "Outcome" NOT NULL,
    "finalized" "Outcome",
    "disputedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OracleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OracleEvent_marketId_idx" ON "OracleEvent"("marketId");

-- CreateIndex
CREATE INDEX "OracleEvent_proposer_idx" ON "OracleEvent"("proposer");

-- AddForeignKey
ALTER TABLE "OracleEvent" ADD CONSTRAINT "OracleEvent_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
