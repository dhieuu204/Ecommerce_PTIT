/**
 * Kiểu dữ liệu các API quản trị P1 trả về. Nguồn gốc:
 * - approval-service: src/shop-approvals/shop-approvals.service.ts
 * - user-service: src/admin-users/admin-users.service.ts
 * - nest-common: src/db/audit-log.controller.ts (có ở cả 4 service)
 */
import type { BankAccount, Permission, ShopApplicationData } from '@san/shared';

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REPLACED';
export type ApprovalType = 'REGISTER' | 'CHANGE';

/** GET /api/approval/v1/admin/shop-approvals */
export interface ShopApprovalRow {
  id: string;
  shopId: string;
  version: number;
  type: ApprovalType;
  status: ApprovalStatus;
  shopName: string;
  ownerName: string;
  ownerEmail: string;
  submittedAt: string;
  decidedAt: string | null;
}

export interface ShopApprovalVersion {
  id: string;
  version: number;
  type: ApprovalType;
  status: ApprovalStatus;
  submittedAt: string;
  decidedAt: string | null;
  reason: string | null;
}

/** GET /api/approval/v1/admin/shop-approvals/{approvalId} */
export interface ShopApprovalDetail extends ShopApprovalRow {
  ownerId: string;
  /** Hồ sơ đầy đủ lúc nộp (với CHANGE: thông tin hiện tại đã gộp phần muốn đổi) */
  data: ShopApplicationData;
  /** Chỉ với CHANGE: các mục muốn đổi và giá trị cũ */
  change: {
    fields: Array<'name' | 'bankAccount'>;
    old: { name?: string; bankAccount?: BankAccount };
  } | null;
  reason: string | null;
  decidedBy: string | null;
  decidedByName: string | null;
  /** Mọi phiên bản hồ sơ của shop, mới nhất trước */
  history: ShopApprovalVersion[];
}

export type UserStatus = 'UNVERIFIED' | 'ACTIVE' | 'LOCKED';

/** GET /api/user/v1/admin/users */
export interface AdminUserRow {
  id: string;
  email: string;
  fullName: string;
  status: UserStatus;
  permissions: Permission[];
  hasGoogle: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** GET /api/user/v1/admin/users/{userId} */
export interface AdminUserDetail extends AdminUserRow {
  phone: string | null;
  lockReason: string | null;
  /** Số thiết bị đang đăng nhập */
  activeSessions: number;
}

/** GET <service>/admin/audit-logs */
export interface AuditLogRow {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}
