-- P7 (AFF-01, AFF-05): duyệt cộng tác viên; hồ sơ duyệt rút tiền có chủ ví là shop hoặc CTV.
-- Viết tay để giữ dữ liệu cũ: shop_name đổi tên thành display_name thay vì xóa rồi thêm.

-- CreateEnum
CREATE TYPE "WalletOwnerType" AS ENUM ('SHOP', 'AFFILIATE');

-- CreateEnum
CREATE TYPE "AffiliateApprovalType" AS ENUM ('REGISTER', 'SUSPEND', 'RESTORE');

-- AlterTable
ALTER TABLE "withdrawal_approvals" RENAME COLUMN "shop_name" TO "display_name";
ALTER TABLE "withdrawal_approvals"
  ADD COLUMN "affiliate_id" UUID,
  ADD COLUMN "owner_type" "WalletOwnerType" NOT NULL DEFAULT 'SHOP',
  ALTER COLUMN "shop_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "affiliate_approvals" (
    "id" UUID NOT NULL,
    "affiliate_id" UUID NOT NULL,
    "type" "AffiliateApprovalType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "user_id" UUID NOT NULL,
    "user_name" VARCHAR(100) NOT NULL,
    "user_email" VARCHAR(254) NOT NULL,
    "data" JSONB NOT NULL,
    "reason" VARCHAR(500),
    "decided_by" UUID,
    "decided_by_name" VARCHAR(100),
    "decided_at" TIMESTAMPTZ(3),
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "affiliate_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "affiliate_approvals_status_submitted_at_idx" ON "affiliate_approvals"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "affiliate_approvals_affiliate_id_submitted_at_idx" ON "affiliate_approvals"("affiliate_id", "submitted_at");

-- Mỗi CTV tối đa một hồ sơ đăng ký đang chờ; mỗi phiên bản hồ sơ chỉ lưu một lần (nhận trùng sự kiện)
CREATE UNIQUE INDEX "affiliate_approvals_one_pending" ON "affiliate_approvals"("affiliate_id")
  WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "affiliate_approvals_register_version" ON "affiliate_approvals"("affiliate_id", "version")
  WHERE "type" = 'REGISTER';
