/*
  Warnings:

  - A unique constraint covering the columns `[metadataHash]` on the table `Market` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CreatorRole" AS ENUM ('ADMIN', 'EDITOR');

-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "category" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "endTime" BIGINT,
ADD COLUMN     "ipfsCid" TEXT,
ADD COLUMN     "metadataHash" TEXT,
ADD COLUMN     "resolutionSource" TEXT,
ADD COLUMN     "title" TEXT;

-- CreateTable
CREATE TABLE "Creator" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "role" "CreatorRole" NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Creator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Creator_address_key" ON "Creator"("address");

-- CreateIndex
CREATE INDEX "Creator_address_idx" ON "Creator"("address");

-- CreateIndex
CREATE UNIQUE INDEX "Market_metadataHash_key" ON "Market"("metadataHash");
