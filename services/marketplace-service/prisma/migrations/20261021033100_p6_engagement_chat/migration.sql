-- P6: đánh giá, theo dõi shop, thả tim, chat, thông báo; sản phẩm bị gỡ do vi phạm. Chỉ thêm bảng và cột có mặc định.
-- CreateEnum
CREATE TYPE "MessageSender" AS ENUM ('BUYER', 'SHOP');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'PRODUCT', 'ORDER');

-- AlterEnum
ALTER TYPE "ProductStatus" ADD VALUE 'REMOVED';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "moderated_at" TIMESTAMPTZ(3),
ADD COLUMN     "rating_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rating_total" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "removed_reason" VARCHAR(500);

-- AlterTable
ALTER TABLE "shops" ADD COLUMN     "rating_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rating_total" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "shop_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "buyer_name" VARCHAR(100) NOT NULL,
    "variant_name" VARCHAR(80) NOT NULL,
    "rating" INTEGER NOT NULL,
    "content" VARCHAR(1000) NOT NULL DEFAULT '',
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "seller_reply" VARCHAR(1000),
    "seller_replied_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_follows" (
    "user_id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_follows_pkey" PRIMARY KEY ("user_id","shop_id")
);

-- CreateTable
CREATE TABLE "product_likes" (
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_likes_pkey" PRIMARY KEY ("user_id","product_id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "buyer_name" VARCHAR(100) NOT NULL,
    "shop_id" UUID NOT NULL,
    "last_message_at" TIMESTAMPTZ(3),
    "last_message_preview" VARCHAR(120),
    "buyer_unread" INTEGER NOT NULL DEFAULT 0,
    "shop_unread" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "sender_role" "MessageSender" NOT NULL,
    "type" "MessageType" NOT NULL,
    "content" VARCHAR(1000) NOT NULL,
    "card" JSONB,
    "client_key" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "link" VARCHAR(255),
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reviews_order_item_id_key" ON "reviews"("order_item_id");

-- CreateIndex
CREATE INDEX "reviews_product_id_created_at_idx" ON "reviews"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "reviews_shop_id_created_at_idx" ON "reviews"("shop_id", "created_at");

-- CreateIndex
CREATE INDEX "reviews_buyer_id_created_at_idx" ON "reviews"("buyer_id", "created_at");

-- CreateIndex
CREATE INDEX "shop_follows_shop_id_idx" ON "shop_follows"("shop_id");

-- CreateIndex
CREATE INDEX "product_likes_product_id_idx" ON "product_likes"("product_id");

-- CreateIndex
CREATE INDEX "conversations_shop_id_last_message_at_idx" ON "conversations"("shop_id", "last_message_at");

-- CreateIndex
CREATE INDEX "conversations_buyer_id_last_message_at_idx" ON "conversations"("buyer_id", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_buyer_id_shop_id_key" ON "conversations"("buyer_id", "shop_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_client_key_key" ON "messages"("conversation_id", "client_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_follows" ADD CONSTRAINT "shop_follows_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_likes" ADD CONSTRAINT "product_likes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Viết tay: số sao 1–5, bộ đếm không âm
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_check" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "products" ADD CONSTRAINT "products_rating_check" CHECK ("rating_count" >= 0 AND "rating_total" >= 0);
ALTER TABLE "shops" ADD CONSTRAINT "shops_rating_check" CHECK ("rating_count" >= 0 AND "rating_total" >= 0);
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_unread_check" CHECK ("buyer_unread" >= 0 AND "shop_unread" >= 0);
