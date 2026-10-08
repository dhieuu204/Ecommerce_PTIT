-- CreateEnum
CREATE TYPE "ShopReviewKind" AS ENUM ('REGISTRATION', 'CHANGE');

-- CreateEnum
CREATE TYPE "ShopReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "shop_reviews" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "ShopReviewKind" NOT NULL,
    "status" "ShopReviewStatus" NOT NULL DEFAULT 'PENDING',
    "owner_user_id" UUID NOT NULL,
    "owner_email" VARCHAR(254) NOT NULL,
    "owner_name" VARCHAR(100) NOT NULL,
    "profile" JSONB NOT NULL,
    "change" JSONB,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" VARCHAR(500),
    "decided_by_id" UUID,
    "decided_by_name" VARCHAR(100),
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_reviews_pkey" PRIMARY KEY ("id")
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
    "correlation_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "envelope" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_events" (
    "event_id" UUID NOT NULL,
    "type" VARCHAR(100) NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE INDEX "shop_reviews_status_kind_submitted_at_idx" ON "shop_reviews"("status", "kind", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "shop_reviews_shop_id_version_key" ON "shop_reviews"("shop_id", "version");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "outbox_events_published_at_created_at_idx" ON "outbox_events"("published_at", "created_at");

-- Viết tay (Prisma chưa khai được chỉ mục riêng phần):
-- mỗi shop tối đa một hồ sơ duyệt đang chờ.
CREATE UNIQUE INDEX "shop_reviews_one_pending_per_shop" ON "shop_reviews"("shop_id") WHERE "status" = 'PENDING';
