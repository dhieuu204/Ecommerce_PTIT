-- P6 (MOD-01): báo cáo vi phạm của người mua, gỡ/khôi phục sản phẩm. Chỉ thêm cột, cột cũ thôi bắt buộc; dữ liệu P2 vẫn đúng.
-- CreateEnum
CREATE TYPE "ViolationStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISMISSED');

-- AlterEnum
ALTER TYPE "ViolationAction" ADD VALUE 'REMOVE';

-- AlterEnum
ALTER TYPE "ViolationTarget" ADD VALUE 'PRODUCT';

-- AlterTable
ALTER TABLE "violations" ADD COLUMN     "decided_at" TIMESTAMPTZ(3),
ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "report_note" VARCHAR(1000),
ADD COLUMN     "report_reason" VARCHAR(30),
ADD COLUMN     "reporter_id" UUID,
ADD COLUMN     "reporter_name" VARCHAR(100),
ADD COLUMN     "request_key" VARCHAR(64),
ADD COLUMN     "shop_id" UUID,
ADD COLUMN     "status" "ViolationStatus" NOT NULL DEFAULT 'RESOLVED',
ADD COLUMN     "target_image" VARCHAR(255),
ALTER COLUMN "target_name" SET DATA TYPE VARCHAR(150),
ALTER COLUMN "action" DROP NOT NULL,
ALTER COLUMN "reason" DROP NOT NULL,
ALTER COLUMN "decided_by" DROP NOT NULL,
ALTER COLUMN "decided_by_name" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "violations_request_key_key" ON "violations"("request_key");

-- CreateIndex
CREATE INDEX "violations_status_created_at_idx" ON "violations"("status", "created_at");

-- CreateIndex
CREATE INDEX "violations_reporter_id_created_at_idx" ON "violations"("reporter_id", "created_at");


-- Viết tay: dòng P2 (đình chỉ shop) có shop_id = mã shop
UPDATE "violations" SET "shop_id" = "target_id" WHERE "target_type" = 'SHOP' AND "shop_id" IS NULL;

-- Viết tay: mỗi người chỉ có một báo cáo đang chờ cho cùng một đối tượng (chống gửi trùng)
CREATE UNIQUE INDEX "violations_one_pending_report" ON "violations"("reporter_id", "target_id")
  WHERE "status" = 'PENDING' AND "reporter_id" IS NOT NULL;
