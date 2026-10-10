-- CreateEnum
CREATE TYPE "OrderCheckStatus" AS ENUM ('PENDING', 'PASSED', 'REJECTED', 'TIMEOUT', 'CANCELLED');

-- CreateTable
CREATE TABLE "order_checks" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_code" VARCHAR(20) NOT NULL,
    "buyer_id" UUID NOT NULL,
    "buyer_name" VARCHAR(100) NOT NULL,
    "buyer_email" VARCHAR(255) NOT NULL,
    "owner_ids" UUID[],
    "amount" INTEGER NOT NULL,
    "payment_method" VARCHAR(10) NOT NULL,
    "data" JSONB NOT NULL,
    "rules_hit" JSONB NOT NULL,
    "status" "OrderCheckStatus" NOT NULL,
    "deadline" TIMESTAMPTZ(3),
    "reason" VARCHAR(500),
    "decided_by" UUID,
    "decided_by_name" VARCHAR(100),
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_checks_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "order_checks_order_id_key" ON "order_checks"("order_id");

-- CreateIndex
CREATE INDEX "order_checks_status_deadline_idx" ON "order_checks"("status", "deadline");

-- CreateIndex
CREATE INDEX "order_checks_buyer_id_idx" ON "order_checks"("buyer_id");
