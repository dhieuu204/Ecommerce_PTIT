-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('PENDING', 'REJECTED', 'ACTIVE');

-- CreateEnum
CREATE TYPE "ApplicationType" AS ENUM ('REGISTER', 'CHANGE');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REPLACED');

-- CreateTable
CREATE TABLE "provinces" (
    "id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "provinces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" INTEGER NOT NULL,
    "province_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wards" (
    "code" VARCHAR(20) NOT NULL,
    "district_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,

    CONSTRAINT "wards_pkey" PRIMARY KEY ("district_id","code")
);

-- CreateTable
CREATE TABLE "shops" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "status" "ShopStatus" NOT NULL DEFAULT 'PENDING',
    "name" VARCHAR(80),
    "description" VARCHAR(3000),
    "logo_url" VARCHAR(255),
    "phone" VARCHAR(10),
    "pickup_province_id" INTEGER,
    "pickup_district_id" INTEGER,
    "pickup_ward_code" VARCHAR(20),
    "pickup_street" VARCHAR(200),
    "pickup_address" VARCHAR(400),
    "bank_name" VARCHAR(100),
    "bank_account_number" VARCHAR(30),
    "bank_account_name" VARCHAR(100),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_applications" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "type" "ApplicationType" NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "data" JSONB NOT NULL,
    "reject_reason" VARCHAR(500),
    "request_key" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(3),

    CONSTRAINT "shop_applications_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "districts_province_id_idx" ON "districts"("province_id");

-- CreateIndex
CREATE UNIQUE INDEX "shops_owner_id_key" ON "shops"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "shops_name_key" ON "shops"("name");

-- CreateIndex
CREATE UNIQUE INDEX "shop_applications_request_key_key" ON "shop_applications"("request_key");

-- CreateIndex
CREATE UNIQUE INDEX "shop_applications_shop_id_version_key" ON "shop_applications"("shop_id", "version");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "outbox_events_sent_at_idx" ON "outbox_events"("sent_at");

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "provinces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wards" ADD CONSTRAINT "wards_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_applications" ADD CONSTRAINT "shop_applications_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Viết tay (Prisma chưa khai được loại chỉ mục này): mỗi shop tối đa 1 hồ sơ đang chờ duyệt.
CREATE UNIQUE INDEX "shop_applications_one_pending_per_shop" ON "shop_applications"("shop_id") WHERE "status" = 'PENDING';
