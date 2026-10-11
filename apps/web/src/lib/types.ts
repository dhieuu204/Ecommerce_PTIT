/** Kiểu dữ liệu API trả về mà web dùng. Nguồn gốc: tài liệu Swagger của từng service. */
import type { BankAccount, Permission } from '@san/shared';

export type { BankAccount, Permission };

/** Người đang đăng nhập (trong kết quả đăng nhập/làm mới vé) */
export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  permissions: Permission[];
}

/** GET /api/user/v1/me */
export interface Profile {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  /** YYYY-MM-DD */
  birthday: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  status: 'UNVERIFIED' | 'ACTIVE' | 'LOCKED';
  permissions: Permission[];
  hasPassword: boolean;
  hasGoogle: boolean;
  createdAt: string;
}

/** GET /api/user/v1/me/addresses */
export interface Address {
  id: string;
  receiverName: string;
  phone: string;
  provinceId: number;
  districtId: number;
  wardCode: string;
  provinceName: string;
  districtName: string;
  wardName: string;
  street: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/market/v1/locations/... */
export interface Place {
  id: number;
  name: string;
}
export interface WardPlace {
  code: string;
  name: string;
}

/** SUSPENDED: admin đình chỉ (từ P2); seller vẫn vào Kênh người bán, hàng bị ẩn khỏi sàn */
export type ShopStatus = 'PENDING' | 'REJECTED' | 'ACTIVE' | 'SUSPENDED';

export interface ShopView {
  id: string;
  status: ShopStatus;
  name: string | null;
  description: string | null;
  logoUrl: string | null;
  phone: string | null;
  pickupAddress: {
    provinceId: number;
    districtId: number;
    wardCode: string;
    street: string;
    fullText: string;
  } | null;
  bankAccount: BankAccount | null;
  /** Lý do đình chỉ khi status = SUSPENDED */
  suspendReason: string | null;
  /** Shop nhận thanh toán khi nhận hàng (COD) */
  codEnabled: boolean;
  createdAt: string;
}

export interface ApplicationView {
  version: number;
  type: 'REGISTER' | 'CHANGE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REPLACED';
  rejectReason: string | null;
  submittedAt: string;
  decidedAt: string | null;
  change?: { fields: Array<'name' | 'bankAccount'>; name?: string; bankAccount?: BankAccount };
}

/** GET /api/market/v1/shops/me */
export interface MyShop {
  status: 'NONE' | ShopStatus;
  shop: ShopView | null;
  application: ApplicationView | null;
  changeRequest: ApplicationView | null;
}

/** Trang danh sách: { items, page, pageSize, total } */
export type { Page } from '@san/shared';
