-- CreateEnum
CREATE TYPE "DisputeType" AS ENUM ('RETURN', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "DisputeStage" AS ENUM ('REQUEST_REJECTED', 'GOODS_PROBLEM');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('PENDING', 'RESOLVED', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED');

-- CreateEnum
CREATE TYPE "DisputeDecision" AS ENUM ('ACCEPT_RETURN', 'REFUND', 'REJECT', 'APPROVE');

-- CreateEnum
CREATE TYPE "WithdrawalApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "type" "DisputeType" NOT NULL,
    "return_id" UUID,
    "return_code" VARCHAR(28),
    "stage" "DisputeStage",
    "order_id" UUID NOT NULL,
    "order_code" VARCHAR(20) NOT NULL,
    "shop_order_id" UUID NOT NULL,
    "shop_order_code" VARCHAR(24) NOT NULL,
    "shop_id" UUID NOT NULL,
    "shop_name" VARCHAR(100) NOT NULL,
    "owner_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "buyer_name" VARCHAR(100) NOT NULL,
    "data" JSONB,
    "buyer_statement" VARCHAR(1000),
    "buyer_images" TEXT[],
    "seller_statement" VARCHAR(1000),
    "seller_images" TEXT[],
    "max_refund" INTEGER,
    "status" "DisputeStatus" NOT NULL DEFAULT 'PENDING',
    "decision" "DisputeDecision",
    "refund_amount" INTEGER,
    "seller_change" INTEGER,
    "bank_account" JSONB,
    "reason" VARCHAR(500),
    "created_by" UUID,
    "created_by_name" VARCHAR(100),
    "request_key" VARCHAR(64),
    "deadline" TIMESTAMPTZ(3),
    "decision_note" VARCHAR(500),
    "decided_by" UUID,
    "decided_by_name" VARCHAR(100),
    "decided_at" TIMESTAMPTZ(3),
    "execution_note" VARCHAR(500),
    "executed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_approvals" (
    "id" UUID NOT NULL,
    "withdrawal_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "shop_name" VARCHAR(100) NOT NULL,
    "owner_id" UUID NOT NULL,
    "owner_name" VARCHAR(100) NOT NULL,
    "amount" INTEGER NOT NULL,
    "bank_account" JSONB NOT NULL,
    "wallet" JSONB NOT NULL,
    "status" "WithdrawalApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reason" VARCHAR(500),
    "decided_by" UUID,
    "decided_by_name" VARCHAR(100),
    "decided_at" TIMESTAMPTZ(3),
    "requested_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawal_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "disputes_request_key_key" ON "disputes"("request_key");

-- CreateIndex
CREATE INDEX "disputes_type_status_created_at_idx" ON "disputes"("type", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_return_id_stage_key" ON "disputes"("return_id", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_approvals_withdrawal_id_key" ON "withdrawal_approvals"("withdrawal_id");

-- CreateIndex
CREATE INDEX "withdrawal_approvals_status_requested_at_idx" ON "withdrawal_approvals"("status", "requested_at");


-- ===== Ràng buộc viết tay (Prisma không khai báo được) =====
-- Tranh chấp trả hàng phải gắn yêu cầu và giai đoạn; đề nghị điều chỉnh phải có người lập và lý do
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_type_fields"
  CHECK (("type" <> 'RETURN' OR ("return_id" IS NOT NULL AND "stage" IS NOT NULL))
    AND ("type" <> 'ADJUSTMENT' OR ("created_by" IS NOT NULL AND "reason" IS NOT NULL)));
-- Số tiền không âm; hoàn đã quyết không vượt số hoàn tối đa
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_amounts_valid"
  CHECK (("refund_amount" IS NULL OR "refund_amount" >= 0)
    AND ("max_refund" IS NULL OR "refund_amount" IS NULL OR "refund_amount" <= "max_refund"));
ALTER TABLE "withdrawal_approvals" ADD CONSTRAINT "withdrawal_approvals_amount_positive"
  CHECK ("amount" > 0);
