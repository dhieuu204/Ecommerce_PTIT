-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('VNPAY');

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('UNPAID', 'PAID');

-- CreateEnum
CREATE TYPE "OrderCheckStatus" AS ENUM ('PENDING', 'PASSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ShopOrderStatus" AS ENUM ('PENDING', 'TO_CONFIRM', 'CONFIRMED', 'CANCEL_REQUESTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CancelActor" AS ENUM ('BUYER', 'SELLER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ShippingFeeSource" AS ENUM ('GHN', 'FALLBACK', 'FIXED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('NONE', 'PROCESSING', 'NEEDS_MANUAL', 'SUCCEEDED', 'MANUAL_DONE');

-- AlterTable
ALTER TABLE "stock_history" ADD COLUMN     "order_id" UUID;

-- CreateTable
CREATE TABLE "voucher_usages" (
    "id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "shop_order_id" UUID,
    "amount" INTEGER NOT NULL,
    "returned_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkouts" (
    "id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "input" JSONB NOT NULL,
    "data" JSONB NOT NULL,
    "total" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "order_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "buyer_id" UUID NOT NULL,
    "buyer_name" VARCHAR(100) NOT NULL,
    "buyer_email" VARCHAR(255) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'VNPAY',
    "receiver_name" VARCHAR(100) NOT NULL,
    "receiver_phone" VARCHAR(15) NOT NULL,
    "province_id" INTEGER NOT NULL,
    "district_id" INTEGER NOT NULL,
    "ward_code" VARCHAR(20) NOT NULL,
    "address" VARCHAR(400) NOT NULL,
    "platform_voucher_id" UUID,
    "platform_voucher_code" VARCHAR(20),
    "platform_discount" INTEGER NOT NULL DEFAULT 0,
    "subtotal" INTEGER NOT NULL,
    "shipping_fee" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "payment_status" "OrderPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "check_status" "OrderCheckStatus" NOT NULL DEFAULT 'PENDING',
    "pay_before" TIMESTAMPTZ(3) NOT NULL,
    "hold_until" TIMESTAMPTZ(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_orders" (
    "id" UUID NOT NULL,
    "code" VARCHAR(24) NOT NULL,
    "order_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "shop_name" VARCHAR(80) NOT NULL,
    "status" "ShopOrderStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" INTEGER NOT NULL,
    "shop_voucher_id" UUID,
    "shop_voucher_code" VARCHAR(20),
    "shop_discount" INTEGER NOT NULL DEFAULT 0,
    "platform_discount" INTEGER NOT NULL DEFAULT 0,
    "shipping_fee" INTEGER NOT NULL,
    "shipping_fee_source" "ShippingFeeSource" NOT NULL,
    "total" INTEGER NOT NULL,
    "platform_fee_rate" INTEGER,
    "platform_fee" INTEGER,
    "seller_amount" INTEGER,
    "confirm_before" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "cancelled_by" "CancelActor",
    "cancel_reason" VARCHAR(500),
    "cancelled_at" TIMESTAMPTZ(3),
    "cancel_request_reason" VARCHAR(500),
    "cancel_requested_at" TIMESTAMPTZ(3),
    "cancel_request_used" BOOLEAN NOT NULL DEFAULT false,
    "refund_status" "RefundStatus" NOT NULL DEFAULT 'NONE',
    "refund_updated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shop_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "shop_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "product_name" VARCHAR(120) NOT NULL,
    "variant_name" VARCHAR(80) NOT NULL,
    "image" VARCHAR(255),
    "price" INTEGER NOT NULL,
    "original_price" INTEGER,
    "quantity" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_history" (
    "id" UUID NOT NULL,
    "shop_order_id" UUID NOT NULL,
    "from_status" "ShopOrderStatus",
    "to_status" "ShopOrderStatus" NOT NULL,
    "actor_type" "CancelActor" NOT NULL,
    "actor_id" UUID,
    "actor_name" VARCHAR(100),
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_history_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "voucher_usages_voucher_id_user_id_idx" ON "voucher_usages"("voucher_id", "user_id");

-- CreateIndex
CREATE INDEX "voucher_usages_order_id_idx" ON "voucher_usages"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkouts_order_id_key" ON "checkouts"("order_id");

-- CreateIndex
CREATE INDEX "checkouts_buyer_id_created_at_idx" ON "checkouts"("buyer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_code_key" ON "orders"("code");

-- CreateIndex
CREATE INDEX "orders_buyer_id_created_at_idx" ON "orders"("buyer_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_payment_status_hold_until_idx" ON "orders"("payment_status", "hold_until");

-- CreateIndex
CREATE UNIQUE INDEX "shop_orders_code_key" ON "shop_orders"("code");

-- CreateIndex
CREATE INDEX "shop_orders_order_id_idx" ON "shop_orders"("order_id");

-- CreateIndex
CREATE INDEX "shop_orders_shop_id_status_created_at_idx" ON "shop_orders"("shop_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "shop_orders_status_confirm_before_idx" ON "shop_orders"("status", "confirm_before");

-- CreateIndex
CREATE INDEX "order_items_shop_order_id_idx" ON "order_items"("shop_order_id");

-- CreateIndex
CREATE INDEX "order_history_shop_order_id_created_at_idx" ON "order_history"("shop_order_id", "created_at");

-- AddForeignKey
ALTER TABLE "stock_history" ADD CONSTRAINT "stock_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_usages" ADD CONSTRAINT "voucher_usages_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_usages" ADD CONSTRAINT "voucher_usages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_usages" ADD CONSTRAINT "voucher_usages_shop_order_id_fkey" FOREIGN KEY ("shop_order_id") REFERENCES "shop_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_shop_order_id_fkey" FOREIGN KEY ("shop_order_id") REFERENCES "shop_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_history" ADD CONSTRAINT "order_history_shop_order_id_fkey" FOREIGN KEY ("shop_order_id") REFERENCES "shop_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
