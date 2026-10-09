/**
 * Mỗi service có Prisma client riêng (services/<service>/generated/prisma), nên gói chung không
 * import được kiểu của chúng. Các interface dưới đây chỉ mô tả phần cần dùng; PrismaService của
 * service nào cũng khớp vì đều có 3 bảng kỹ thuật giống nhau (audit_logs, outbox_events, inbox_events).
 */

/** Dữ liệu JSON lưu vào cột Json */
export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue | undefined };

export interface OutboxDb {
  outboxEvent: {
    create(args: { data: { id: string; type: string; payload: JsonObject } }): PromiseLike<unknown>;
  };
}

export interface OutboxRelayDb {
  outboxEvent: {
    findMany(args: {
      where: { sentAt: null };
      orderBy: { createdAt: 'asc' };
      take: number;
    }): PromiseLike<Array<{ id: string; payload: unknown }>>;
    update(args: { where: { id: string }; data: { sentAt: Date } }): PromiseLike<unknown>;
  };
}

export interface InboxDb {
  inboxEvent: {
    /** skipDuplicates: id đã có thì bỏ qua (count = 0), không báo lỗi */
    createMany(args: {
      data: Array<{ id: string; type: string }>;
      skipDuplicates: boolean;
    }): PromiseLike<{ count: number }>;
  };
}

export interface AuditDb {
  auditLog: {
    create(args: {
      data: {
        actorId: string;
        actorName: string;
        action: string;
        targetType: string;
        targetId: string;
        reason?: string | null;
        before?: JsonObject;
        after?: JsonObject;
      };
    }): PromiseLike<unknown>;
  };
}

/** Một dòng nhật ký thao tác admin */
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
  createdAt: Date;
}

export interface AuditLogWhere {
  createdAt?: { gte?: Date; lte?: Date };
  actorId?: string;
  action?: string;
}

/** Đọc nhật ký thao tác admin (GET /admin/audit-logs) */
export interface AuditReadDb {
  auditLog: {
    findMany(args: {
      where: AuditLogWhere;
      orderBy: { createdAt: 'desc' };
      skip: number;
      take: number;
    }): PromiseLike<AuditLogRow[]>;
    count(args: { where: AuditLogWhere }): PromiseLike<number>;
  };
}

/** Chạy nhiều lệnh trong một giao dịch: prisma.$transaction(async (tx) => { ... }) */
export interface TransactionRunner<Tx> {
  $transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R>;
}

/**
 * Phần PrismaService mà gói chung dùng. Mỗi service kiểm lúc biên dịch trong prisma.service.ts,
 * nên nếu ai sửa 3 bảng kỹ thuật lệch đi thì build báo lỗi ngay.
 */
export type SanPrismaDb = OutboxRelayDb &
  AuditDb &
  AuditReadDb &
  TransactionRunner<OutboxDb & InboxDb & AuditDb>;
