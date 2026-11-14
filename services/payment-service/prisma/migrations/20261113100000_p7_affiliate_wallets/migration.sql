-- P7 (AFF-04, AFF-05): ví có chủ là shop hoặc cộng tác viên. Viết tay để GIỮ dữ liệu cũ:
-- mỗi ví shop cũ thành một dòng wallets loại SHOP, lịch sử ví và yêu cầu rút trỏ sang ví đó.

-- CreateEnum
CREATE TYPE "WalletOwnerType" AS ENUM ('SHOP', 'AFFILIATE');

-- ----- seller_wallets → wallets, khóa chính mới là id -----
ALTER TABLE "seller_wallets" RENAME TO "wallets";
ALTER TABLE "wallets" RENAME CONSTRAINT "seller_wallets_non_negative" TO "wallets_non_negative";
ALTER TABLE "wallets"
  ADD COLUMN "id" UUID,
  ADD COLUMN "owner_type" "WalletOwnerType" NOT NULL DEFAULT 'SHOP',
  ADD COLUMN "affiliate_id" UUID;
UPDATE "wallets" SET "id" = gen_random_uuid();
ALTER TABLE "wallets" ALTER COLUMN "id" SET NOT NULL;

-- ----- lịch sử ví: shop_id → wallet_id -----
ALTER TABLE "wallet_transactions" ADD COLUMN "wallet_id" UUID;
UPDATE "wallet_transactions" t SET "wallet_id" = w."id" FROM "wallets" w WHERE w."shop_id" = t."shop_id";
ALTER TABLE "wallet_transactions" ALTER COLUMN "wallet_id" SET NOT NULL;
ALTER TABLE "wallet_transactions" DROP CONSTRAINT "wallet_transactions_shop_id_fkey";
DROP INDEX "wallet_transactions_shop_id_created_at_idx";
DROP INDEX "wallet_transactions_shop_order_id_type_key";
ALTER TABLE "wallet_transactions" DROP COLUMN "shop_id";

-- ----- yêu cầu rút: shop_id → wallet_id, shop_name → display_name -----
ALTER TABLE "withdrawals"
  ADD COLUMN "wallet_id" UUID,
  ADD COLUMN "owner_type" "WalletOwnerType" NOT NULL DEFAULT 'SHOP';
UPDATE "withdrawals" r SET "wallet_id" = w."id" FROM "wallets" w WHERE w."shop_id" = r."shop_id";
ALTER TABLE "withdrawals" ALTER COLUMN "wallet_id" SET NOT NULL;
ALTER TABLE "withdrawals" RENAME COLUMN "shop_name" TO "display_name";
ALTER TABLE "withdrawals" DROP CONSTRAINT "withdrawals_shop_id_fkey";
DROP INDEX "withdrawals_shop_id_created_at_idx";
DROP INDEX "withdrawals_one_open_per_shop";
ALTER TABLE "withdrawals" DROP COLUMN "shop_id";

-- ----- khóa và ràng buộc mới của wallets -----
ALTER TABLE "wallets" DROP CONSTRAINT "seller_wallets_pkey";
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_pkey" PRIMARY KEY ("id");
ALTER TABLE "wallets" ALTER COLUMN "shop_id" DROP NOT NULL;
DROP INDEX "seller_wallets_owner_id_key";
CREATE UNIQUE INDEX "wallets_shop_id_key" ON "wallets"("shop_id");
CREATE UNIQUE INDEX "wallets_affiliate_id_key" ON "wallets"("affiliate_id");
CREATE UNIQUE INDEX "wallets_owner_type_owner_id_key" ON "wallets"("owner_type", "owner_id");
-- Đúng một trong shop_id, affiliate_id có giá trị, khớp loại chủ ví
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_owner_matches_type" CHECK (
  ("owner_type" = 'SHOP' AND "shop_id" IS NOT NULL AND "affiliate_id" IS NULL)
  OR ("owner_type" = 'AFFILIATE' AND "affiliate_id" IS NOT NULL AND "shop_id" IS NULL)
);

-- ----- chỉ mục, khóa ngoại mới -----
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");
CREATE UNIQUE INDEX "wallet_transactions_wallet_id_shop_order_id_type_key" ON "wallet_transactions"("wallet_id", "shop_order_id", "type");
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "withdrawals_wallet_id_created_at_idx" ON "withdrawals"("wallet_id", "created_at");
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Mỗi ví tối đa một yêu cầu rút đang xử lý (thay cho "mỗi shop" của P5)
CREATE UNIQUE INDEX "withdrawals_one_open_per_wallet" ON "withdrawals"("wallet_id")
  WHERE "status" IN ('PENDING', 'APPROVED');

-- ----- tiền đơn con: hoa hồng CTV -----
ALTER TABLE "seller_earnings"
  ADD COLUMN "affiliate_id" UUID,
  ADD COLUMN "affiliate_user_id" UUID,
  ADD COLUMN "commission" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "return_commission_reversed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "seller_earnings" ADD CONSTRAINT "seller_earnings_commission_valid"
  CHECK ("commission" >= 0 AND "return_commission_reversed" >= 0 AND "return_commission_reversed" <= "commission");
