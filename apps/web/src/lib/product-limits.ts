/**
 * Con số P2 mà Kênh người bán cần biết trước để báo lỗi ngay trên form (docs/api/README.md mục 3,
 * "Con số cấu hình"). Phải khớp .env của marketplace-service (PRODUCT_MAX_IMAGES, VARIANT_MAX_OPTIONS,
 * PRICE_MIN, PRICE_MAX, WEIGHT_MAX_GRAMS, STOCK_MAX, PRODUCT_IMAGE_MAX_MB, VOUCHER_MAX_DAYS).
 * Đổi ở đó thì đặt biến VITE_ tương ứng cho web. Backend vẫn tự kiểm; ở đây chỉ để báo trước.
 */
const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const env = import.meta.env;

export const PRODUCT_LIMITS = {
  nameMin: 5,
  nameMax: 120,
  descriptionMin: 20,
  descriptionMax: 5000,
  /** Ảnh chung tối đa */
  maxImages: num(env.VITE_PRODUCT_MAX_IMAGES, 9),
  imageMaxMb: num(env.VITE_PRODUCT_IMAGE_MAX_MB, 5),
  /** Số nhóm phân loại tối đa (cố định 2 theo quyết định P2) */
  maxGroups: 2,
  /** Lựa chọn tối đa mỗi nhóm */
  maxOptions: num(env.VITE_VARIANT_MAX_OPTIONS, 10),
  optionMax: 30,
  priceMin: num(env.VITE_PRICE_MIN, 1_000),
  priceMax: num(env.VITE_PRICE_MAX, 500_000_000),
  weightMax: num(env.VITE_WEIGHT_MAX_GRAMS, 30_000),
  stockMax: num(env.VITE_STOCK_MAX, 999_999),
  /** Ngưỡng "sắp hết hàng" trên danh sách sản phẩm */
  lowStock: 5,
  voucherMaxDays: num(env.VITE_VOUCHER_MAX_DAYS, 180),
};

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
