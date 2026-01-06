-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM ('OPEN', 'LOCKED', 'RESOLVED', 'SETTLED');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "SignedQuoteStatus" AS ENUM ('PENDING', 'COMMITTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "contractAddress" TEXT,
    "status" "MarketStatus" NOT NULL,
    "qYes" DECIMAL(65,30) NOT NULL,
    "qNo" DECIMAL(65,30) NOT NULL,
    "b" DECIMAL(65,30) NOT NULL,
    "collateral" DECIMAL(65,30) NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraderNonce" (
    "id" TEXT NOT NULL,
    "trader" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "lastNonce" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TraderNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignedQuote" (
    "id" TEXT NOT NULL,
    "trader" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "quoteHash" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "cost" DECIMAL(65,30) NOT NULL,
    "nonce" BIGINT NOT NULL,
    "isSell" BOOLEAN NOT NULL DEFAULT false,
    "marketVersion" INTEGER NOT NULL,
    "minAmountOut" DECIMAL(65,30),
    "minReturn" DECIMAL(65,30),
    "status" "SignedQuoteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignedQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "cost" DECIMAL(65,30) NOT NULL,
    "trader" TEXT NOT NULL,
    "marketVer" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Market_contractAddress_key" ON "Market"("contractAddress");

-- CreateIndex
CREATE INDEX "TraderNonce_marketId_idx" ON "TraderNonce"("marketId");

-- CreateIndex
CREATE UNIQUE INDEX "TraderNonce_trader_marketId_key" ON "TraderNonce"("trader", "marketId");

-- CreateIndex
CREATE UNIQUE INDEX "SignedQuote_quoteHash_key" ON "SignedQuote"("quoteHash");

-- CreateIndex
CREATE INDEX "SignedQuote_marketId_idx" ON "SignedQuote"("marketId");

-- CreateIndex
CREATE INDEX "Trade_marketId_idx" ON "Trade"("marketId");

-- AddForeignKey
ALTER TABLE "TraderNonce" ADD CONSTRAINT "TraderNonce_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedQuote" ADD CONSTRAINT "SignedQuote_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
