/** Sự kiện của luồng mở shop và duyệt shop (P1: SHP-01, SHP-02, SHP-03). */

/** REGISTRATION: hồ sơ mở shop. CHANGE: yêu cầu đổi tên shop hoặc tài khoản ngân hàng sau khi đã duyệt. */
export type ShopReviewKind = 'REGISTRATION' | 'CHANGE';

/** Địa chỉ theo mã GHN, kèm tên để admin đọc được mà không cần tra. */
export interface GhnAddress {
  provinceId: number;
  districtId: number;
  wardCode: string;
  provinceName: string;
  districtName: string;
  wardName: string;
  /** Số nhà, tên đường */
  street: string;
}

export interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

/** Bản chụp hồ sơ shop tại lúc nộp. approval-service lưu nguyên bản này để admin xem. */
export interface ShopProfileSnapshot {
  name: string;
  description: string;
  /** Đường dẫn ảnh logo (MinIO), null nếu chưa có */
  logoUrl: string | null;
  phone: string;
  pickupAddress: GhnAddress;
  bankAccount: BankAccount;
}

/** marketplace-service → approval-service: seller nộp hồ sơ hoặc yêu cầu đổi thông tin. */
export const SHOP_APPLICATION_SUBMITTED = 'shop.application_submitted';
export interface ShopApplicationSubmittedPayload {
  shopId: string;
  /** Số phiên bản hồ sơ, tăng dần từ 1. Bản mới thay bản cũ đang chờ. */
  version: number;
  kind: ShopReviewKind;
  owner: { userId: string; email: string; fullName: string };
  /** Hồ sơ đầy đủ sau khi nộp (với CHANGE: hồ sơ hiện tại đã gộp phần muốn đổi) */
  profile: ShopProfileSnapshot;
  /** Chỉ có với CHANGE: các trường muốn đổi và giá trị cũ của chúng */
  change?: {
    fields: Array<'name' | 'bankAccount'>;
    previous: { name?: string; bankAccount?: BankAccount };
  };
  submittedAt: string;
}

/** approval-service → marketplace-service: admin đã duyệt hoặc từ chối. */
export const SHOP_REVIEW_DECIDED = 'shop_review.decided';
export interface ShopReviewDecidedPayload {
  reviewId: string;
  shopId: string;
  /** marketplace chỉ áp quyết định nếu đúng phiên bản đang chờ; khác thì bỏ qua */
  version: number;
  kind: ShopReviewKind;
  decision: 'APPROVED' | 'REJECTED';
  /** Bắt buộc khi REJECTED */
  reason: string | null;
  decidedBy: { userId: string; name: string };
  decidedAt: string;
}
