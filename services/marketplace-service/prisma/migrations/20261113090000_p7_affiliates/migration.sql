-- CreateEnum
CREATE TYPE "AffiliateStatus" AS ENUM ('PENDING', 'REJECTED', 'ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "commission" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "commission_rate" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "commission_rate" INTEGER;

-- AlterTable
ALTER TABLE "shop_orders" ADD COLUMN     "affiliate_click_id" UUID,
ADD COLUMN     "affiliate_id" UUID,
ADD COLUMN     "commission" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "affiliates" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code" VARCHAR(8),
    "status" "AffiliateStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "display_name" VARCHAR(60) NOT NULL,
    "channels" TEXT[],
    "phone" VARCHAR(10) NOT NULL,
    "bank_name" VARCHAR(100) NOT NULL,
    "bank_account_number" VARCHAR(30) NOT NULL,
    "bank_account_name" VARCHAR(100) NOT NULL,
    "reject_reason" VARCHAR(500),
    "suspend_reason" VARCHAR(500),
    "request_key" VARCHAR(64) NOT NULL,
    "moderated_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "affiliates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_clicks" (
    "id" UUID NOT NULL,
    "affiliate_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "product_id" UUID,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "affiliate_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_user_id_key" ON "affiliates"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_code_key" ON "affiliates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "affiliates_request_key_key" ON "affiliates"("request_key");

-- CreateIndex
CREATE INDEX "affiliates_status_created_at_idx" ON "affiliates"("status", "created_at");

-- CreateIndex
CREATE INDEX "affiliate_clicks_affiliate_id_created_at_idx" ON "affiliate_clicks"("affiliate_id", "created_at");

-- CreateIndex
CREATE INDEX "affiliate_clicks_user_id_shop_id_created_at_idx" ON "affiliate_clicks"("user_id", "shop_id", "created_at");

-- CreateIndex
CREATE INDEX "shop_orders_affiliate_id_created_at_idx" ON "shop_orders"("affiliate_id", "created_at");

-- AddForeignKey
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "affiliates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

