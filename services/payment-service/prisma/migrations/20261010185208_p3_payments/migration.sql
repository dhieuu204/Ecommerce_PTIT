-- CreateEnum
CREATE TYPE "EarningStatus" AS ENUM ('UNPAID', 'HELD', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Gateway" AS ENUM ('VNPAY', 'MOCK');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('CANCELLED', 'LATE_PAYMENT', 'DUPLICATE_PAYMENT');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'FAILED', 'UNKNOWN', 'NEEDS_MANUAL', 'SUCCEEDED', 'MANUAL_DONE');

-- CreateTable
CREATE TABLE "seller_earnings" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_code" VARCHAR(20) NOT NULL,
    "shop_order_id" UUID NOT NULL,
    "shop_order_code" VARCHAR(24) NOT NULL,
    "shop_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "shop_discount" INTEGER NOT NULL,
    "platform_discount" INTEGER NOT NULL,
    "shipping_fee" INTEGER NOT NULL,
    "buyer_paid" INTEGER NOT NULL,
    "platform_fee_rate" INTEGER NOT NULL,
    "platform_fee" INTEGER NOT NULL,
    "seller_amount" INTEGER NOT NULL,
    "status" "EarningStatus" NOT NULL DEFAULT 'UNPAID',
    "pay_before" TIMESTAMPTZ(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "seller_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "ref" VARCHAR(40) NOT NULL,
    "request_key" VARCHAR(64) NOT NULL,
    "gateway" "Gateway" NOT NULL,
    "amount" INTEGER NOT NULL,
    "pay_url" VARCHAR(2000) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "transaction_no" VARCHAR(40),
    "bank_code" VARCHAR(20),
    "paid_at" TIMESTAMPTZ(3),
    "client_ip" VARCHAR(45) NOT NULL,
    "gateway_response" JSONB,
    "checked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "shop_order_id" UUID,
    "amount" INTEGER NOT NULL,
    "reason" "RefundReason" NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "tries" INTEGER NOT NULL DEFAULT 0,
    "next_try_at" TIMESTAMPTZ(3),
    "request_id" VARCHAR(40),
    "last_error" VARCHAR(500),
    "gateway_response" JSONB,
    "transfer_code" VARCHAR(60),
    "receipt_key" VARCHAR(200),
    "manual_note" VARCHAR(500),
    "manual_by" UUID,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "created_by_name" VARCHAR(100),
    "reason" VARCHAR(500),

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key","version")
);

-- CreateIndex
CREATE UNIQUE INDEX "seller_earnings_shop_order_id_key" ON "seller_earnings"("shop_order_id");

-- CreateIndex
CREATE INDEX "seller_earnings_order_id_idx" ON "seller_earnings"("order_id");

-- CreateIndex
CREATE INDEX "seller_earnings_status_pay_before_idx" ON "seller_earnings"("status", "pay_before");

-- CreateIndex
CREATE UNIQUE INDEX "payments_ref_key" ON "payments"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "payments_request_key_key" ON "payments"("request_key");

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_attempt_key" ON "payments"("order_id", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_shop_order_id_key" ON "refunds"("shop_order_id");

-- CreateIndex
CREATE INDEX "refunds_status_next_try_at_idx" ON "refunds"("status", "next_try_at");

-- CreateIndex
CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
