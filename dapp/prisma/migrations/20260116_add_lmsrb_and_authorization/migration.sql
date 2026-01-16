-- Create WhitelistedCreator table for syncing MarketFactory.whitelistedCreators
CREATE TABLE "WhitelistedCreator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "address" TEXT NOT NULL UNIQUE,
    "isWhitelisted" BOOLEAN NOT NULL DEFAULT false,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Create AuthorizedSigner table for syncing QuoteVerifier.allowedSigners
CREATE TABLE "AuthorizedSigner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "address" TEXT NOT NULL UNIQUE,
    "isAllowed" BOOLEAN NOT NULL DEFAULT false,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Create OracleResolver table for syncing OracleAdapter.resolvers
CREATE TABLE "OracleResolver" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "address" TEXT NOT NULL UNIQUE,
    "isAllowed" BOOLEAN NOT NULL DEFAULT false,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Create SyncLog table to track event syncing progress
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "service" TEXT NOT NULL UNIQUE,
    "lastBlockScanned" BIGINT NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Create indices for fast authorization lookups
CREATE INDEX "WhitelistedCreator_address_idx" ON "WhitelistedCreator"("address");
CREATE INDEX "AuthorizedSigner_address_idx" ON "AuthorizedSigner"("address");
CREATE INDEX "OracleResolver_address_idx" ON "OracleResolver"("address");
