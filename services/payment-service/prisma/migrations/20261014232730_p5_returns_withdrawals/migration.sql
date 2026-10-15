-- CreateEnum
CREATE TYPE "ReturnState" AS ENUM ('NONE', 'OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('GATEWAY', 'BANK_TRANSFER');

-- AlterEnum
ALTER TYPE "EarningStatus" ADD VALUE 'REFUNDED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RefundReason" ADD VALUE 'RETURN';
ALTER TYPE "RefundReason" ADD VALUE 'ADJUSTMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WalletTxType" ADD VALUE 'RETURN_DEDUCTED';
ALTER TYPE "WalletTxType" ADD VALUE 'LOCKED';
ALTER TYPE "WalletTxType" ADD VALUE 'UNLOCKED';
ALTER TYPE "WalletTxType" ADD VALUE 'WITHDRAWN';
ALTER TYPE "WalletTxType" ADD VALUE 'ADJUSTMENT';

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_payment_id_fkey";

-- DropIndex
DROP INDEX "refunds_shop_order_id_key";

-- AlterTable
ALTER TABLE "refunds" ADD COLUMN     "adjustment_id" UUID,
ADD COLUMN     "bank_account_name" VARCHAR(100),
ADD COLUMN     "bank_account_number" VARCHAR(30),
ADD COLUMN     "bank_name" VARCHAR(100),
ADD COLUMN     "method" "RefundMethod" NOT NULL DEFAULT 'GATEWAY',
ADD COLUMN     "return_id" UUID,
ALTER COLUMN "payment_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "seller_earnings" ADD COLUMN     "return_deduction" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "return_fee_reversed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "return_id" UUID,
ADD COLUMN     "return_refund" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "return_state" "ReturnState" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "wallet_transactions" ADD COLUMN     "adjustment_id" UUID,
ADD COLUMN     "withdrawal_id" UUID;

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "owner_name" VARCHAR(100) NOT NULL,
    "shop_name" VARCHAR(100) NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "bank_name" VARCHAR(100) NOT NULL,
    "bank_account_number" VARCHAR(30) NOT NULL,
    "bank_account_name" VARCHAR(100) NOT NULL,
    "request_key" VARCHAR(64) NOT NULL,
    "reason" VARCHAR(500),
    "decided_by_name" VARCHAR(100),
    "decided_at" TIMESTAMPTZ(3),
    "transfer_code" VARCHAR(60),
    "receipt_key" VARCHAR(200),
    "paid_by" UUID,
    "paid_by_name" VARCHAR(100),
    "paid_at" TIMESTAMPTZ(3),
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_request_key_key" ON "withdrawals"("request_key");

-- CreateIndex
CREATE INDEX "withdrawals_shop_id_created_at_idx" ON "withdrawals"("shop_id", "created_at");

-- CreateIndex
CREATE INDEX "withdrawals_status_created_at_idx" ON "withdrawals"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_return_id_key" ON "refunds"("return_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_adjustment_id_key" ON "refunds"("adjustment_id");

-- CreateIndex
CREATE INDEX "refunds_shop_order_id_idx" ON "refunds"("shop_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_withdrawal_id_type_key" ON "wallet_transactions"("withdrawal_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_adjustment_id_type_key" ON "wallet_transactions"("adjustment_id", "type");

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_withdrawal_id_fkey" FOREIGN KEY ("withdrawal_id") REFERENCES "withdrawals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "seller_wallets"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ===== Ràng buộc viết tay (Prisma không khai báo được) =====

-- Khoản hoàn do hủy / giao thất bại / sự cố: mỗi đơn con tối đa một (như P3). Khoản hoàn trả hàng và điều
-- chỉnh có mã riêng (return_id, adjustment_id) nên không tính vào đây.
CREATE UNIQUE INDEX "refunds_shop_order_once" ON "refunds"("shop_order_id")
  WHERE "return_id" IS NULL AND "adjustment_id" IS NULL;
-- Hoàn qua cổng phải gắn lần thanh toán; chuyển khoản tay phải có tài khoản người nhận
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_method_valid"
  CHECK (("method" <> 'GATEWAY' OR "payment_id" IS NOT NULL)
    AND ("method" <> 'BANK_TRANSFER' OR ("bank_name" IS NOT NULL AND "bank_account_number" IS NOT NULL
      AND "bank_account_name" IS NOT NULL)));

-- Mỗi shop chỉ một yêu cầu rút đang xử lý (chờ duyệt hoặc chờ chuyển khoản); số tiền rút luôn dương
CREATE UNIQUE INDEX "withdrawals_one_open_per_shop" ON "withdrawals"("shop_id")
  WHERE "status" IN ('PENDING', 'APPROVED');
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_amount_positive" CHECK ("amount" > 0);

-- Tiền trả hàng của đơn con không âm, không trừ seller quá số seller được nhận
ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_return_valid"
  CHECK ("return_refund" >= 0 AND "return_fee_reversed" >= 0
    AND "return_deduction" >= 0 AND "return_deduction" <= "seller_amount");
