-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('PENDING', 'REJECTED', 'ACTIVE');

-- CreateEnum
CREATE TYPE "ShopApplicationKind" AS ENUM ('REGISTRATION', 'CHANGE');

-- CreateEnum
CREATE TYPE "ShopApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "UploadPurpose" AS ENUM ('SHOP_LOGO');

-- CreateTable
CREATE TABLE "ghn_provinces" (
    "id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ghn_provinces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ghn_districts" (
    "id" INTEGER NOT NULL,
    "province_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ghn_districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ghn_wards" (
    "code" VARCHAR(20) NOT NULL,
    "district_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ghn_wards_pkey" PRIMARY KEY ("district_id","code")
);

-- CreateTable
CREATE TABLE "shops" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "status" "ShopStatus" NOT NULL DEFAULT 'PENDING',
    "name" VARCHAR(80),
    "description" VARCHAR(3000),
    "logo_key" VARCHAR(255),
    "phone" VARCHAR(10),
    "pickup_province_id" INTEGER,
    "pickup_district_id" INTEGER,
    "pickup_ward_code" VARCHAR(20),
    "pickup_street" VARCHAR(200),
    "pickup_address_text" VARCHAR(400),
    "bank_name" VARCHAR(100),
    "bank_account_number" VARCHAR(30),
    "bank_account_holder" VARCHAR(100),
    "approved_version" INTEGER NOT NULL DEFAULT 0,
    "latest_version" INTEGER NOT NULL DEFAULT 0,
    "activated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_applications" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "ShopApplicationKind" NOT NULL,
    "status" "ShopApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "profile" JSONB NOT NULL,
    "change" JSONB,
    "reject_reason" VARCHAR(500),
    "decided_by_name" VARCHAR(100),
    "decided_at" TIMESTAMPTZ(3),
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_files" (
    "key" VARCHAR(255) NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "purpose" "UploadPurpose" NOT NULL,
    "content_type" VARCHAR(50) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "user_id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "endpoint" VARCHAR(100) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("user_id","key")
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
CREATE INDEX "ghn_districts_province_id_idx" ON "ghn_districts"("province_id");

-- CreateIndex
CREATE UNIQUE INDEX "shops_owner_user_id_key" ON "shops"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "shops_name_key" ON "shops"("name");

-- CreateIndex
CREATE INDEX "shops_status_idx" ON "shops"("status");

-- CreateIndex
CREATE INDEX "shop_applications_shop_id_status_idx" ON "shop_applications"("shop_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "shop_applications_shop_id_version_key" ON "shop_applications"("shop_id", "version");

-- CreateIndex
CREATE INDEX "uploaded_files_owner_user_id_created_at_idx" ON "uploaded_files"("owner_user_id", "created_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "outbox_events_published_at_created_at_idx" ON "outbox_events"("published_at", "created_at");

-- AddForeignKey
ALTER TABLE "ghn_districts" ADD CONSTRAINT "ghn_districts_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "ghn_provinces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ghn_wards" ADD CONSTRAINT "ghn_wards_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "ghn_districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_applications" ADD CONSTRAINT "shop_applications_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Viết tay (Prisma chưa khai được chỉ mục riêng phần):
-- mỗi shop tối đa một hồ sơ đang chờ duyệt.
CREATE UNIQUE INDEX "shop_applications_one_pending_per_shop" ON "shop_applications"("shop_id") WHERE "status" = 'PENDING';
