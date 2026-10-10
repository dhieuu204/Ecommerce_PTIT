/**
 * Thư viện dùng chung giữa 4 service: tên service, quyền và JWT, dạng lỗi/phân trang, kiểu sự kiện.
 * Kiểm JWT và outbox/inbox sẽ thêm ở việc nền tảng chung (xem docs/api/README.md).
 */
export const SERVICES = {
  user: 'user-service',
  marketplace: 'marketplace-service',
  payment: 'payment-service',
  approval: 'approval-service',
} as const;

export type ServiceName = (typeof SERVICES)[keyof typeof SERVICES];

export * from './auth';
export * from './http';
export * from './events';
export * from './demo';
