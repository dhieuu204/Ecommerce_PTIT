/**
 * Kiểu dữ liệu API P2 (hàng và giỏ) mà web dùng. Nguồn gốc: docs/api/README.md mục 3 và Swagger
 * marketplace-service (/api/market/v1/docs), approval-service (/api/approval/v1/docs).
 */
import type { BankAccount } from './types';

// ----- Danh mục (CAT-01) -----

/** GET /categories: cây danh mục chưa ẩn */
export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  /** Tên icon lucide-react, ví dụ "smartphone" */
  icon: string | null;
  children?: CategoryNode[];
}

/** GET /admin/categories */
export interface AdminCategory {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  icon: string | null;
  sort: number;
  hidden: boolean;
  /** Số sản phẩm (mọi trạng thái); cấp 1 là tổng của các con */
  productCount: number;
  createdAt: string;
  children?: AdminCategory[];
}

// ----- Xem hàng công khai (CAT-04, SRC-01) -----

export type ProductSort =
  'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'best_selling' | 'rating';

/** Một thẻ sản phẩm trong GET /products */
export interface ProductCardData {
  id: string;
  name: string;
  image: string | null;
  minPrice: number;
  maxPrice: number;
  /** Giá gốc của biến thể rẻ nhất (để hiện nhãn -%), null nếu không giảm */
  originalPrice: number | null;
  option1Name: string | null;
  /** Các lựa chọn nhóm 1 (ô chọn phiên bản trên thẻ) */
  option1Values: string[];
  soldCount: number;
  inStock: boolean;
  shop: { id: string; name: string };
  createdAt: string;
  /** P6: sao trung bình (null khi chưa có đánh giá) và số đánh giá */
  ratingAvg: number | null;
  ratingCount: number;
}

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
  parent: { id: string; name: string; slug: string } | null;
}

export interface ProductImage {
  url: string;
  /** Ảnh riêng của một lựa chọn nhóm 1 (ví dụ một màu); null là ảnh chung */
  option1Value: string | null;
}

/** GET /products/{productId} */
export interface ProductDetail {
  id: string;
  name: string;
  description: string;
  status: 'ACTIVE';
  weight: number;
  soldCount: number;
  minPrice: number;
  maxPrice: number;
  option1Name: string | null;
  option2Name: string | null;
  category: CategoryRef;
  images: ProductImage[];
  variants: Array<{
    id: string;
    option1Value: string | null;
    option2Value: string | null;
    price: number;
    originalPrice: number | null;
    /** Số còn bán được */
    available: number;
  }>;
  shop: {
    id: string;
    name: string;
    logoUrl: string | null;
    productCount: number;
    joinedAt: string;
  };
  /** P6: sao, số đánh giá, số tim, người xem đã thả tim chưa */
  ratingAvg: number | null;
  ratingCount: number;
  likeCount: number;
  liked: boolean;
}

/** GET /shops/{shopId} */
export interface PublicShop {
  id: string;
  name: string;
  logoUrl: string | null;
  description: string | null;
  provinceName: string | null;
  productCount: number;
  joinedAt: string;
  status: 'ACTIVE' | 'SUSPENDED';
  suspended: boolean;
  /** P6: sao shop, số đánh giá, số người theo dõi, người xem đang theo dõi chưa */
  ratingAvg: number | null;
  ratingCount: number;
  followerCount: number;
  following: boolean;
}

// ----- Giỏ hàng (CRT-01) -----

export type CartItemState = 'OK' | 'NOT_ENOUGH_STOCK' | 'OUT_OF_STOCK' | 'UNAVAILABLE';

export interface CartItem {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  image: string | null;
  option1Name: string | null;
  option2Name: string | null;
  /** '' nếu sản phẩm không có nhóm đó */
  option1Value: string;
  option2Value: string;
  price: number;
  originalPrice: number | null;
  /** Số còn bán được (0 nếu không còn bán) */
  available: number;
  quantity: number;
  selected: boolean;
  state: CartItemState;
}

/** GET /cart (PATCH/DELETE dòng giỏ, chọn, xóa nhiều cũng trả về giỏ đầy đủ) */
export interface Cart {
  shops: Array<{ shop: { id: string; name: string; logoUrl: string | null }; items: CartItem[] }>;
  /** Chỉ tính dòng đang chọn và state = OK */
  selectedCount: number;
  selectedTotal: number;
}

// ----- Sản phẩm của seller (CAT-02, CAT-03, INV-01) -----

export type ProductStatus = 'ACTIVE' | 'HIDDEN';

/** Một dòng trong GET /shops/me/products */
export interface SellerProductRow {
  id: string;
  name: string;
  status: ProductStatus;
  image: string | null;
  minPrice: number;
  maxPrice: number;
  totalStock: number;
  totalAvailable: number;
  variantCount: number;
  soldCount: number;
  categoryName: string;
  updatedAt: string;
}

export interface SellerVariant {
  id: string;
  option1Value: string | null;
  option2Value: string | null;
  price: number;
  originalPrice: number | null;
  stock: number;
  /** Đang giữ cho đơn trả trước chưa thanh toán (từ P3) */
  reserved: number;
  available: number;
}

/** GET/POST/PUT /shops/me/products/{id} */
export interface SellerProduct {
  id: string;
  name: string;
  description: string;
  status: ProductStatus;
  categoryId: string;
  category: CategoryRef;
  weight: number;
  option1Name: string | null;
  option2Name: string | null;
  minPrice: number;
  maxPrice: number;
  soldCount: number;
  images: ProductImage[];
  variants: SellerVariant[];
  createdAt: string;
  updatedAt: string;
}

/** Dữ liệu gửi khi tạo (POST) hoặc sửa (PUT) sản phẩm */
export interface ProductInput {
  name: string;
  description: string;
  categoryId: string;
  weight: number;
  option1Name?: string | null;
  option2Name?: string | null;
  variants: Array<{
    /** Chỉ khi sửa: biến thể cũ */
    id?: string;
    option1Value?: string | null;
    option2Value?: string | null;
    price: number;
    originalPrice?: number | null;
    /** Tồn ban đầu, bắt buộc với biến thể mới; biến thể cũ đổi tồn bằng API điều chỉnh tồn */
    stock?: number;
  }>;
  images: ProductImage[];
}

/** GET /shops/me/products/{id}/stock-history */
export interface StockHistoryRow {
  id: string;
  variantId: string;
  option1Value: string | null;
  option2Value: string | null;
  change: number;
  stockAfter: number;
  reason: string;
  createdBy: string;
  createdAt: string;
}

// ----- Voucher (VCH-01) -----

export type VoucherState = 'UPCOMING' | 'RUNNING' | 'ENDED';
export type DiscountType = 'AMOUNT' | 'PERCENT';

export interface Voucher {
  id: string;
  /** null = voucher sàn */
  shopId: string | null;
  code: string;
  name: string;
  discountType: DiscountType;
  /** Số tiền (AMOUNT) hoặc phần trăm 1–90 (PERCENT) */
  value: number;
  /** Trần giảm (bắt buộc với PERCENT) */
  maxDiscount: number | null;
  minOrder: number;
  startAt: string;
  endAt: string;
  quantity: number;
  perUserLimit: number;
  usedCount: number;
  state: VoucherState;
  createdAt: string;
}

export interface VoucherInput {
  code: string;
  name: string;
  discountType: DiscountType;
  value: number;
  maxDiscount?: number | null;
  minOrder: number;
  startAt: string;
  endAt: string;
  quantity: number;
  perUserLimit: number;
}

// ----- Shop (admin, SHP-04) -----

export type AdminShopStatus = 'ACTIVE' | 'SUSPENDED';

/** GET /admin/shops (marketplace) */
export interface AdminShopRow {
  id: string;
  name: string;
  logoUrl: string | null;
  ownerId: string;
  status: AdminShopStatus;
  suspendReason: string | null;
  productCount: number;
  approvedAt: string | null;
  createdAt: string;
}

/** GET /admin/shops/{shopId} (marketplace) */
export interface AdminShopDetail extends AdminShopRow {
  description: string | null;
  phone: string | null;
  /** Địa chỉ lấy hàng đầy đủ bằng chữ */
  pickupAddress: string | null;
  /** Số tài khoản đã che, chỉ còn 4 số cuối */
  bankAccount: BankAccount | null;
  productCounts: { ACTIVE: number; HIDDEN: number; REMOVED: number };
  moderatedAt: string | null;
}

/** GET /admin/shops/{shopId}/violations (approval-service); suspend/restore trả cùng dạng */
export interface ShopViolations {
  suspended: boolean;
  items: Array<{
    id: string;
    action: 'SUSPEND' | 'RESTORE';
    reason: string;
    decidedBy: string;
    decidedByName: string;
    createdAt: string;
    targetName: string;
  }>;
}
