-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('VNPAY', 'COD');

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('HELD', 'RELEASED', 'REVERSED', 'COMPENSATION');

-- CreateEnum
CREATE TYPE "WalletBucket" AS ENUM ('PENDING', 'AVAILABLE', 'LOCKED');

-- CreateEnum
CREATE TYPE "ReconcileResult" AS ENUM ('MATCHED', 'MISMATCHED', 'DUPLICATE', 'NOT_FOUND', 'NOT_DELIVERED');

-- CreateEnum
CREATE TYPE "ReconcileResolution" AS ENUM ('ACCEPTED', 'NOTED');

-- CreateEnum
CREATE TYPE "ReconcileStatus" AS ENUM ('MATCHED', 'MISMATCH', 'RESOLVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EarningStatus" ADD VALUE 'AVAILABLE';
ALTER TYPE "EarningStatus" ADD VALUE 'FAILED';
ALTER TYPE "EarningStatus" ADD VALUE 'COMPENSATED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RefundReason" ADD VALUE 'DELIVERY_FAILED';
ALTER TYPE "RefundReason" ADD VALUE 'INCIDENT';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "reconcile_note" VARCHAR(500),
ADD COLUMN     "reconcile_status" "ReconcileStatus",
ADD COLUMN     "reconciled_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "seller_earnings" ADD COLUMN     "carrier_fee" INTEGER,
ADD COLUMN     "cod_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "completed_at" TIMESTAMPTZ(3),
ADD COLUMN     "delivered_at" TIMESTAMPTZ(3),
ADD COLUMN     "ghn_code" VARCHAR(40),
ADD COLUMN     "money_received_at" TIMESTAMPTZ(3),
ADD COLUMN     "payment_method" "PaymentMethod" NOT NULL DEFAULT 'VNPAY',
ADD COLUMN     "released_at" TIMESTAMPTZ(3),
ALTER COLUMN "pay_before" DROP NOT NULL;

-- CreateTable
CREATE TABLE "seller_wallets" (
    "shop_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "pending" INTEGER NOT NULL DEFAULT 0,
    "available" INTEGER NOT NULL DEFAULT 0,
    "locked" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "seller_wallets_pkey" PRIMARY KEY ("shop_id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "from_bucket" "WalletBucket",
    "to_bucket" "WalletBucket",
    "shop_order_id" UUID,
    "note" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cod_reconciliations" (
    "id" UUID NOT NULL,
    "file_name" VARCHAR(200) NOT NULL,
    "file_key" VARCHAR(200) NOT NULL,
    "file_hash" VARCHAR(64) NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "uploaded_by_name" VARCHAR(100) NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "matched" INTEGER NOT NULL,
    "mismatched" INTEGER NOT NULL,
    "duplicated" INTEGER NOT NULL,
    "not_found" INTEGER NOT NULL,
    "not_delivered" INTEGER NOT NULL,
    "total_cod" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cod_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cod_reconciliation_items" (
    "id" UUID NOT NULL,
    "reconciliation_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "ghn_code" VARCHAR(40) NOT NULL,
    "cod_amount" INTEGER NOT NULL,
    "ship_fee" INTEGER NOT NULL,
    "return_fee" INTEGER NOT NULL,
    "shop_order_id" UUID,
    "expected_cod" INTEGER,
    "buyer_shipping_fee" INTEGER,
    "result" "ReconcileResult" NOT NULL,
    "resolution" "ReconcileResolution",
    "note" VARCHAR(500),
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "cod_reconciliation_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seller_wallets_owner_id_key" ON "seller_wallets"("owner_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_shop_id_created_at_idx" ON "wallet_transactions"("shop_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_shop_order_id_type_key" ON "wallet_transactions"("shop_order_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "cod_reconciliations_file_hash_key" ON "cod_reconciliations"("file_hash");

-- CreateIndex
CREATE INDEX "cod_reconciliations_created_at_idx" ON "cod_reconciliations"("created_at");

-- CreateIndex
CREATE INDEX "cod_reconciliation_items_reconciliation_id_row_number_idx" ON "cod_reconciliation_items"("reconciliation_id", "row_number");

-- CreateIndex
CREATE INDEX "cod_reconciliation_items_ghn_code_idx" ON "cod_reconciliation_items"("ghn_code");

-- CreateIndex
CREATE INDEX "payments_reconcile_status_idx" ON "payments"("reconcile_status");

-- CreateIndex
CREATE INDEX "seller_earnings_shop_id_created_at_idx" ON "seller_earnings"("shop_id", "created_at");

-- CreateIndex
CREATE INDEX "seller_earnings_ghn_code_idx" ON "seller_earnings"("ghn_code");

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "seller_wallets"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cod_reconciliation_items" ADD CONSTRAINT "cod_reconciliation_items_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "cod_reconciliations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Số dư ví không bao giờ âm; mỗi dòng lịch sử ví luôn là số dương (Prisma không khai báo được CHECK)
ALTER TABLE "seller_wallets" ADD CONSTRAINT "seller_wallets_non_negative"
  CHECK ("pending" >= 0 AND "available" >= 0 AND "locked" >= 0);
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_amount_positive"
  CHECK ("amount" > 0);
