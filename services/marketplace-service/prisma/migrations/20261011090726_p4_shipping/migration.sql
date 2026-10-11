-- CreateEnum
CREATE TYPE "ShipmentType" AS ENUM ('DELIVERY', 'RETURN');

-- CreateEnum
CREATE TYPE "Carrier" AS ENUM ('GHN', 'MOCK');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('CREATING', 'UNKNOWN', 'CREATE_FAILED', 'READY_TO_PICK', 'PICKED', 'DELIVERED', 'RETURNING', 'RETURNED', 'CANCELLED', 'LOST');

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('GHN', 'MOCK');

-- AlterEnum
ALTER TYPE "OrderPaymentStatus" ADD VALUE 'COD';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'COD';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ShopOrderStatus" ADD VALUE 'SHIPPING';
ALTER TYPE "ShopOrderStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "ShopOrderStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "ShopOrderStatus" ADD VALUE 'RETURNING';
ALTER TYPE "ShopOrderStatus" ADD VALUE 'RETURNED';
ALTER TYPE "ShopOrderStatus" ADD VALUE 'FAILED';
ALTER TYPE "ShopOrderStatus" ADD VALUE 'INCIDENT';
ALTER TYPE "ShopOrderStatus" ADD VALUE 'INCIDENT_RESOLVED';

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "pay_before" DROP NOT NULL,
ALTER COLUMN "hold_until" DROP NOT NULL;

-- AlterTable
ALTER TABLE "shop_orders" ADD COLUMN     "cod_amount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "complete_before" TIMESTAMPTZ(3),
ADD COLUMN     "completed_at" TIMESTAMPTZ(3),
ADD COLUMN     "delivered_at" TIMESTAMPTZ(3),
ADD COLUMN     "handover_before" TIMESTAMPTZ(3),
ADD COLUMN     "incident_note" VARCHAR(500),
ADD COLUMN     "picked_at" TIMESTAMPTZ(3),
ADD COLUMN     "return_close_before" TIMESTAMPTZ(3),
ADD COLUMN     "returned_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "cod_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "shop_order_id" UUID NOT NULL,
    "type" "ShipmentType" NOT NULL DEFAULT 'DELIVERY',
    "carrier" "Carrier" NOT NULL,
    "client_code" VARCHAR(40) NOT NULL,
    "ghn_code" VARCHAR(40),
    "status" "ShipmentStatus" NOT NULL DEFAULT 'CREATING',
    "cod_amount" INTEGER NOT NULL DEFAULT 0,
    "weight" INTEGER NOT NULL,
    "fee" INTEGER,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "picked_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "returned_at" TIMESTAMPTZ(3),
    "last_event_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_history" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "ghn_status" VARCHAR(40) NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "source" "EventSource" NOT NULL,
    "event_key" VARCHAR(120) NOT NULL,
    "note" VARCHAR(300),
    "happened_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipments_client_code_key" ON "shipments"("client_code");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_ghn_code_key" ON "shipments"("ghn_code");

-- CreateIndex
CREATE INDEX "shipments_status_idx" ON "shipments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_shop_order_id_type_key" ON "shipments"("shop_order_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_history_event_key_key" ON "shipment_history"("event_key");

-- CreateIndex
CREATE INDEX "shipment_history_shipment_id_happened_at_idx" ON "shipment_history"("shipment_id", "happened_at");

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_shop_order_id_fkey" FOREIGN KEY ("shop_order_id") REFERENCES "shop_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_history" ADD CONSTRAINT "shipment_history_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

