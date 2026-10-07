/**
 * Thư viện dùng chung giữa 4 service.
 * Hiện mới có tên service. Kiểu sự kiện (envelope), kiểm JWT và outbox/inbox
 * được thêm ở bước "Hợp đồng API và sự kiện" (xem docs/README.md).
 */
export const SERVICES = {
  user: 'user-service',
  marketplace: 'marketplace-service',
  payment: 'payment-service',
  approval: 'approval-service',
} as const;

export type ServiceName = (typeof SERVICES)[keyof typeof SERVICES];
