-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('REQUESTED', 'REJECTED', 'DISPUTED', 'SHIPPING_BACK', 'RECEIVED', 'REFUNDING', 'REFUNDED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('DEFECTIVE', 'DAMAGED', 'WRONG_ITEM', 'MISSING', 'NOT_AS_DESCRIBED', 'COUNTERFEIT');

-- CreateEnum
CREATE TYPE "DisputeStage" AS ENUM ('REQUEST_REJECTED', 'GOODS_PROBLEM');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "returned_quantity" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "returns" (
    "id" UUID NOT NULL,
    "code" VARCHAR(28) NOT NULL,
    "shop_order_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" "ReturnReason" NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "images" TEXT[],
    "refund_amount" INTEGER NOT NULL,
    "seller_base" INTEGER NOT NULL,
    "refund_without_return" BOOLEAN NOT NULL DEFAULT false,
    "bank_name" VARCHAR(100),
    "bank_account_number" VARCHAR(30),
    "bank_account_name" VARCHAR(100),
    "seller_note" VARCHAR(1000),
    "seller_images" TEXT[],
    "dispute_note" VARCHAR(1000),
    "dispute_images" TEXT[],
    "dispute_stage" "DisputeStage",
    "deadline" TIMESTAMPTZ(3),
    "decided_refund" INTEGER,
    "platform_covers" BOOLEAN NOT NULL DEFAULT false,
    "refund_status" "RefundStatus" NOT NULL DEFAULT 'NONE',
    "refund_updated_at" TIMESTAMPTZ(3),
    "history" JSONB NOT NULL DEFAULT '[]',
    "request_key" VARCHAR(64) NOT NULL,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "refund_amount" INTEGER NOT NULL,
    "seller_base" INTEGER NOT NULL,
    "restocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "returns_code_key" ON "returns"("code");

-- CreateIndex
CREATE UNIQUE INDEX "returns_shop_order_id_key" ON "returns"("shop_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "returns_request_key_key" ON "returns"("request_key");

-- CreateIndex
CREATE INDEX "returns_buyer_id_created_at_idx" ON "returns"("buyer_id", "created_at");

-- CreateIndex
CREATE INDEX "returns_shop_id_status_created_at_idx" ON "returns"("shop_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "returns_status_deadline_idx" ON "returns"("status", "deadline");

-- CreateIndex
CREATE UNIQUE INDEX "return_items_return_id_order_item_id_key" ON "return_items"("return_id", "order_item_id");

-- AddForeignKey
ALTER TABLE "returns" ADD CONSTRAINT "returns_shop_order_id_fkey" FOREIGN KEY ("shop_order_id") REFERENCES "shop_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Số lượng trả luôn dương, tiền không âm; số món đã trả không vượt số đã mua (Prisma không khai báo được CHECK)
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_amounts_valid"
  CHECK ("quantity" > 0 AND "refund_amount" >= 0 AND "seller_base" >= 0);
ALTER TABLE "returns" ADD CONSTRAINT "returns_amounts_valid"
  CHECK ("refund_amount" >= 0 AND "seller_base" >= 0
    AND ("decided_refund" IS NULL OR ("decided_refund" >= 0 AND "decided_refund" <= "refund_amount")));
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_returned_quantity_valid"
  CHECK ("returned_quantity" >= 0 AND "returned_quantity" <= "quantity");
