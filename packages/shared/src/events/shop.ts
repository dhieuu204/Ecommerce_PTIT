/** Sự kiện của luồng mở shop và duyệt shop (P1: SHP-01, SHP-02, SHP-03). */

/** REGISTER: hồ sơ mở shop. CHANGE: đổi tên shop hoặc tài khoản ngân hàng sau khi đã duyệt. */
export type ApplicationType = 'REGISTER' | 'CHANGE';

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
  /** Tên chủ tài khoản */
  accountName: string;
}

/** Toàn bộ hồ sơ shop lúc nộp. approval-service lưu nguyên bản này để admin xem. */
export interface ShopApplicationData {
  name: string;
  description: string;
  /** Ảnh logo (MinIO), null nếu chưa có */
  logoUrl: string | null;
  phone: string;
  pickupAddress: GhnAddress;
  bankAccount: BankAccount;
}

/** marketplace-service → approval-service: seller nộp hồ sơ mở shop hoặc yêu cầu đổi thông tin. */
export const SHOP_APPLICATION_SUBMITTED = 'shop_application.submitted';
export interface ShopApplicationSubmittedPayload {
  shopId: string;
  /** Số phiên bản hồ sơ, tăng dần từ 1. Bản mới thay bản cũ đang chờ. */
  version: number;
  type: ApplicationType;
  owner: { userId: string; email: string; fullName: string };
  /** Hồ sơ đầy đủ (với CHANGE: thông tin hiện tại đã gộp phần muốn đổi) */
  data: ShopApplicationData;
  /** Chỉ có với CHANGE: các mục muốn đổi và giá trị cũ */
  change?: {
    fields: Array<'name' | 'bankAccount'>;
    old: { name?: string; bankAccount?: BankAccount };
  };
  submittedAt: string;
}

/** approval-service → marketplace-service: admin đã duyệt hoặc từ chối hồ sơ. */
export const SHOP_APPLICATION_DECIDED = 'shop_application.decided';
export interface ShopApplicationDecidedPayload {
  shopId: string;
  /** marketplace chỉ áp quyết định nếu đúng phiên bản đang chờ; khác thì bỏ qua */
  version: number;
  type: ApplicationType;
  decision: 'APPROVED' | 'REJECTED';
  /** Bắt buộc khi REJECTED */
  reason: string | null;
  decidedBy: { userId: string; name: string };
  decidedAt: string;
}

/** approval-service → marketplace-service: admin đình chỉ hoặc khôi phục shop (SHP-04). */
export const SHOP_SUSPENSION_DECIDED = 'shop_suspension.decided';
export interface ShopSuspensionDecidedPayload {
  shopId: string;
  action: 'SUSPEND' | 'RESTORE';
  reason: string;
  decidedBy: { userId: string; name: string };
  /** marketplace chỉ áp nếu mới hơn quyết định đã áp trước đó (sự kiện có thể tới sai thứ tự) */
  decidedAt: string;
}

/**
 * approval-service → marketplace-service (P6, MOD-01): admin kiểm duyệt gỡ sản phẩm vi phạm hoặc khôi phục.
 * marketplace chỉ áp nếu mới hơn quyết định đã áp trước đó (cột products.moderated_at).
 */
export const PRODUCT_MODERATION_DECIDED = 'product_moderation.decided';
export interface ProductModerationDecidedPayload {
  productId: string;
  shopId: string;
  /** REMOVE: gỡ khỏi sàn, seller không tự bật lại được; RESTORE: trả về trạng thái ẩn, seller tự bật */
  action: 'REMOVE' | 'RESTORE';
  reason: string;
  decidedBy: { userId: string; name: string };
  decidedAt: string;
}
