import type { AuthUser } from '../auth/jwt';
import type { AuditDb, JsonObject } from './db-types';

export interface AuditEntry {
  /** Admin thực hiện */
  actor: Pick<AuthUser, 'id' | 'name'>;
  /** Việc đã làm, viết hoa, ví dụ SET_PERMISSIONS, APPROVE_SHOP */
  action: string;
  /** Loại đối tượng, ví dụ USER, SHOP */
  targetType: string;
  targetId: string;
  reason?: string | null;
  /** Dữ liệu trước và sau khi đổi (chỉ các trường liên quan), ví dụ { permissions: [...] } */
  before?: object;
  after?: object;
}

/** Đổi object bất kỳ (có Date, undefined...) thành JSON thuần để lưu cột Json. */
function toJson(value: object | undefined): JsonObject | undefined {
  return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as JsonObject);
}

/**
 * Ghi nhật ký thao tác admin (ADM-02). Gọi trong cùng giao dịch với thay đổi dữ liệu:
 * await prisma.$transaction(async (tx) => { ...; await writeAudit(tx, {...}); });
 */
export async function writeAudit(db: AuditDb, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actor.id,
      actorName: entry.actor.name,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      reason: entry.reason ?? null,
      before: toJson(entry.before),
      after: toJson(entry.after),
    },
  });
}
