-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM ('OPEN', 'CLOSED', 'RESOLVED', 'SETTLED');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "Outcome" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "SignedQuoteStatus" AS ENUM ('PENDING', 'COMMITTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CreatorRole" AS ENUM ('ADMIN', 'EDITOR');

-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "contractAddress" TEXT,
    "status" "MarketStatus" NOT NULL,
    "qYes" DECIMAL(65,30) NOT NULL,
    "qNo" DECIMAL(65,30) NOT NULL,
    "lmsrB" DECIMAL(65,30) NOT NULL,
    "collateral" DECIMAL(65,30) NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadataHash" TEXT,
    "ipfsCid" TEXT,
    "title" TEXT,
    "description" TEXT,
    "category" TEXT,
    "resolutionSource" TEXT,
    "endTime" BIGINT,
    "creator" TEXT NOT NULL,
    "subsidyAmount" DECIMAL(65,30),

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "WhitelistedCreator" (
    "id" TEXT NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "isWhitelisted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhitelistedCreator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorizedSigner" (
    "id" TEXT NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "privateKey" VARCHAR(255) NOT NULL,
    "isAllowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorizedSigner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OracleResolver" (
    "id" TEXT NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "isAllowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OracleResolver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "lastBlockScanned" BIGINT NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Market_contractAddress_key" ON "Market"("contractAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Market_metadataHash_key" ON "Market"("metadataHash");

-- CreateIndex
CREATE INDEX "OracleEvent_marketId_idx" ON "OracleEvent"("marketId");

-- CreateIndex
CREATE INDEX "OracleEvent_proposer_idx" ON "OracleEvent"("proposer");

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

-- CreateIndex
CREATE UNIQUE INDEX "WhitelistedCreator_address_key" ON "WhitelistedCreator"("address");

-- CreateIndex
CREATE INDEX "WhitelistedCreator_address_idx" ON "WhitelistedCreator"("address");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizedSigner_address_key" ON "AuthorizedSigner"("address");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizedSigner_privateKey_key" ON "AuthorizedSigner"("privateKey");

-- CreateIndex
CREATE INDEX "AuthorizedSigner_address_idx" ON "AuthorizedSigner"("address");

-- CreateIndex
CREATE UNIQUE INDEX "OracleResolver_address_key" ON "OracleResolver"("address");

-- CreateIndex
CREATE INDEX "OracleResolver_address_idx" ON "OracleResolver"("address");

-- CreateIndex
CREATE UNIQUE INDEX "SyncLog_service_key" ON "SyncLog"("service");

-- CreateIndex
CREATE INDEX "SyncLog_service_idx" ON "SyncLog"("service");

-- AddForeignKey
ALTER TABLE "OracleEvent" ADD CONSTRAINT "OracleEvent_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraderNonce" ADD CONSTRAINT "TraderNonce_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedQuote" ADD CONSTRAINT "SignedQuote_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;
