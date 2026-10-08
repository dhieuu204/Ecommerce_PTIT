-- CreateEnum
CREATE TYPE "ApplicationType" AS ENUM ('REGISTER', 'CHANGE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REPLACED');

-- CreateTable
CREATE TABLE "shop_approvals" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "type" "ApplicationType" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "owner_id" UUID NOT NULL,
    "owner_name" VARCHAR(100) NOT NULL,
    "owner_email" VARCHAR(254) NOT NULL,
    "data" JSONB NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" VARCHAR(500),
    "decided_by" UUID,
    "decided_by_name" VARCHAR(100),
    "decided_at" TIMESTAMPTZ(3),

    CONSTRAINT "shop_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_name" VARCHAR(100) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "target_type" VARCHAR(32) NOT NULL,
    "target_id" VARCHAR(64) NOT NULL,
    "reason" VARCHAR(500),
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_events" (
    "id" UUID NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shop_approvals_status_submitted_at_idx" ON "shop_approvals"("status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "shop_approvals_shop_id_version_key" ON "shop_approvals"("shop_id", "version");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "outbox_events_sent_at_idx" ON "outbox_events"("sent_at");

-- Viết tay (Prisma chưa khai được loại chỉ mục này): mỗi shop tối đa 1 hồ sơ đang chờ duyệt.
CREATE UNIQUE INDEX "shop_approvals_one_pending_per_shop" ON "shop_approvals"("shop_id") WHERE "status" = 'PENDING';
