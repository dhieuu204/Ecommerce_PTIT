-- CreateEnum
CREATE TYPE "ViolationTarget" AS ENUM ('SHOP');

-- CreateEnum
CREATE TYPE "ViolationAction" AS ENUM ('SUSPEND', 'RESTORE');

-- CreateTable
CREATE TABLE "violations" (
    "id" UUID NOT NULL,
    "target_type" "ViolationTarget" NOT NULL DEFAULT 'SHOP',
    "target_id" UUID NOT NULL,
    "target_name" VARCHAR(100) NOT NULL,
    "owner_id" UUID NOT NULL,
    "action" "ViolationAction" NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "decided_by" UUID NOT NULL,
    "decided_by_name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "violations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "violations_target_id_created_at_idx" ON "violations"("target_id", "created_at");
