/*
  Warnings:

  - The values [LOCKED] on the enum `MarketStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `addedAt` on the `AuthorizedSigner` table. All the data in the column will be lost.
  - You are about to alter the column `address` on the `AuthorizedSigner` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(42)`.
  - You are about to drop the column `b` on the `Market` table. All the data in the column will be lost.
  - You are about to alter the column `lmsrB` on the `Market` table. The data in that column could be lost. The data in that column will be cast from `Decimal(78,0)` to `Decimal(65,30)`.
  - You are about to drop the column `addedAt` on the `OracleResolver` table. All the data in the column will be lost.
  - You are about to alter the column `address` on the `OracleResolver` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(42)`.
  - You are about to drop the column `updatedAt` on the `SyncLog` table. All the data in the column will be lost.
  - You are about to drop the column `addedAt` on the `WhitelistedCreator` table. All the data in the column will be lost.
  - You are about to alter the column `address` on the `WhitelistedCreator` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(42)`.
  - Made the column `creator` on table `Market` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "MarketStatus_new" AS ENUM ('OPEN', 'CLOSED', 'RESOLVED', 'SETTLED');
ALTER TABLE "Market" ALTER COLUMN "status" TYPE "MarketStatus_new" USING ("status"::text::"MarketStatus_new");
ALTER TYPE "MarketStatus" RENAME TO "MarketStatus_old";
ALTER TYPE "MarketStatus_new" RENAME TO "MarketStatus";
DROP TYPE "public"."MarketStatus_old";
COMMIT;

-- AlterTable
ALTER TABLE "AuthorizedSigner" DROP COLUMN "addedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "address" SET DATA TYPE VARCHAR(42),
ALTER COLUMN "isAllowed" SET DEFAULT true;

-- AlterTable
ALTER TABLE "Market" DROP COLUMN "b",
ALTER COLUMN "creator" SET NOT NULL,
ALTER COLUMN "lmsrB" DROP DEFAULT,
ALTER COLUMN "lmsrB" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "OracleResolver" DROP COLUMN "addedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "address" SET DATA TYPE VARCHAR(42),
ALTER COLUMN "isAllowed" SET DEFAULT true;

-- AlterTable
ALTER TABLE "SyncLog" DROP COLUMN "updatedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "lastSyncedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WhitelistedCreator" DROP COLUMN "addedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "address" SET DATA TYPE VARCHAR(42),
ALTER COLUMN "isWhitelisted" SET DEFAULT true;

-- CreateIndex
CREATE INDEX "SyncLog_service_idx" ON "SyncLog"("service");
