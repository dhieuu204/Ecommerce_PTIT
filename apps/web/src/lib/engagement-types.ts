/**
 * Kiểu dữ liệu API P6 phần đánh giá, theo dõi shop, thả tim (ENG-01..03). Nguồn gốc: docs/api/README.md
 * mục 7 và Swagger marketplace-service (/api/market/v1/docs).
 */
import type { ProductCardData } from './catalog-types';
import type { Page } from './types';

/** Số đánh giá theo từng mức sao */
export type StarCounts = Record<'1' | '2' | '3' | '4' | '5', number>;

/** Tóm tắt sao của sản phẩm hoặc shop */
export interface ReviewSummary {
  /** Làm tròn 1 chữ số; null khi chưa có đánh giá */
  ratingAvg: number | null;
  ratingCount: number;
  stars: StarCounts;
  /** Số đánh giá có ảnh */
  withImages: number;
}

/** Một đánh giá công khai (tên người mua đã che bớt) */
export interface PublicReview {
  id: string;
  buyerName: string;
  rating: number;
  content: string;
  images: string[];
  variantName: string;
  edited: boolean;
  sellerReply: string | null;
  sellerRepliedAt: string | null;
  createdAt: string;
  /** Chỉ có ở đánh giá của shop */
  product?: { id: string; name: string };
}

/** GET /products/{id}/reviews, GET /shops/{id}/reviews */
export interface PublicReviewPage extends Page<PublicReview> {
  summary: ReviewSummary;
}

/** GET /me/reviews?state=PENDING: dòng hàng chờ đánh giá */
export interface PendingReviewItem {
  orderItemId: string;
  productId: string;
  productName: string;
  variantName: string;
  image: string | null;
  quantity: number;
  orderId: string;
  shopOrderId: string;
  shopOrderCode: string;
  shop: { id: string; name: string };
  completedAt: string;
  reviewBefore: string;
}

/** GET /me/reviews?state=DONE, POST/PUT /me/reviews */
export interface MyReview {
  id: string;
  orderItemId: string;
  productId: string;
  productName: string;
  variantName: string;
  image: string | null;
  orderId: string;
  shopOrderCode: string;
  shop: { id: string; name: string };
  buyerName: string;
  rating: number;
  content: string;
  images: string[];
  edited: boolean;
  canEdit: boolean;
  editBefore: string;
  sellerReply: string | null;
  sellerRepliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Đánh giá trong Kênh người bán */
export interface SellerReview extends PublicReview {
  product: { id: string; name: string; image: string | null };
  shopOrderId: string;
  shopOrderCode: string;
}

/** GET /shops/me/reviews */
export interface SellerReviewPage extends Page<SellerReview> {
  summary: ReviewSummary & { unreplied: number };
}

/** PUT/DELETE /shops/{id}/follow */
export interface FollowState {
  following: boolean;
  followerCount: number;
}

/** PUT/DELETE /products/{id}/like */
export interface LikeState {
  liked: boolean;
  likeCount: number;
}

/** GET /me/followed-shops */
export interface FollowedShop {
  id: string;
  name: string;
  logoUrl: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  productCount: number;
  suspended: boolean;
  followedAt: string;
}

/** GET /me/liked-products */
export interface LikedProduct extends ProductCardData {
  /** false: không còn bán (ẩn, bị gỡ hoặc shop ngừng bán) */
  available: boolean;
  likedAt: string;
}

/**
 * Giới hạn ảnh đánh giá để giao diện báo trước (backend vẫn tự kiểm). Phải khớp REVIEW_MAX_IMAGES,
 * REVIEW_IMAGE_MAX_MB của marketplace-service; đổi ở đó thì đặt biến VITE_ tương ứng.
 */
const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
export const REVIEW_LIMITS = {
  maxImages: num(import.meta.env.VITE_REVIEW_MAX_IMAGES, 5),
  imageMaxMb: num(import.meta.env.VITE_REVIEW_IMAGE_MAX_MB, 5),
  contentMax: 1000,
};
