import { Inject, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/jwt';
import { writeAudit } from '../db/audit';
import type { AuditDb, TransactionRunner } from '../db/db-types';
import { AppError } from '../errors/app-error';
import { SAN_PRISMA } from '../options';

/** Một con số cấu hình của service (hạn thanh toán, phí sàn, ngưỡng duyệt...) */
export interface SettingDefinition {
  key: string;
  /** Tên tiếng Việt hiện trên trang admin */
  label: string;
  /** Đơn vị hiển thị: phút, giờ, đồng, lần, % x 100... */
  unit: string;
  /** Giải thích thêm cho admin */
  description?: string;
  min: number;
  max: number;
  /** Giá trị dùng khi chưa ai sửa (phiên bản 0) */
  defaultValue: number;
  /** Kiểm thêm theo các con số khác (ví dụ giữ tồn ≥ hạn thanh toán); trả câu lỗi hoặc null */
  check?: (value: number, current: Record<string, number>) => string | null;
}

/** Một phiên bản của một con số */
export interface SettingVersion {
  version: number;
  value: number;
  effectiveFrom: Date | null;
  createdBy: string | null;
  createdByName: string | null;
  reason: string | null;
}

/** Con số đang dùng, trả cho trang admin */
export interface SettingView extends SettingVersion {
  key: string;
  label: string;
  unit: string;
  description: string | null;
  min: number;
  max: number;
  defaultValue: number;
}

interface SettingRow {
  key: string;
  version: number;
  value: number;
  effectiveFrom: Date;
  createdBy: string | null;
  createdByName: string | null;
  reason: string | null;
}

/** Phần bảng settings mà gói chung dùng (giống nhau ở marketplace, payment, approval) */
export interface SettingsDb {
  setting: {
    findMany(args: {
      where?: { key?: string | { in: string[] } };
      orderBy: Array<Record<string, 'asc' | 'desc'>>;
      distinct?: Array<'key'>;
    }): PromiseLike<SettingRow[]>;
    create(args: {
      data: {
        key: string;
        version: number;
        value: number;
        createdBy: string;
        createdByName: string;
        reason: string;
      };
    }): PromiseLike<SettingRow>;
  };
}

type Db = SettingsDb & TransactionRunner<SettingsDb & AuditDb>;

export const SETTING_DEFINITIONS = Symbol('SETTING_DEFINITIONS');

/**
 * Cấu hình có phiên bản (ADM-01). Mỗi lần admin sửa là một phiên bản mới có hiệu lực ngay;
 * không sửa dòng cũ. Đơn và tiền đã chốt tự chụp con số lúc đó vào dữ liệu của mình.
 *
 *   const minutes = await this.settings.get('payment_minutes');
 */
@Injectable()
export class SettingsService {
  private readonly defs: Map<string, SettingDefinition>;

  constructor(
    @Inject(SAN_PRISMA) private readonly db: Db,
    @Inject(SETTING_DEFINITIONS) definitions: SettingDefinition[],
  ) {
    this.defs = new Map(definitions.map((d) => [d.key, d]));
  }

  /** Giá trị đang dùng của một con số */
  async get(key: string): Promise<number> {
    return (await this.values([key]))[key]!;
  }

  /** Giá trị đang dùng của nhiều con số (một lần đọc) */
  async values(keys: string[] = [...this.defs.keys()]): Promise<Record<string, number>> {
    for (const key of keys) this.def(key);
    const rows = await this.latest(keys);
    return Object.fromEntries(
      keys.map((key) => [key, rows.get(key)?.value ?? this.def(key).defaultValue]),
    );
  }

  async list(): Promise<SettingView[]> {
    const rows = await this.latest([...this.defs.keys()]);
    return [...this.defs.values()].map((d) => this.view(d, rows.get(d.key)));
  }

  /** Mới nhất trước; phiên bản 0 là mặc định trong code */
  async history(key: string): Promise<SettingVersion[]> {
    const d = this.def(key);
    const rows = await this.db.setting.findMany({ where: { key }, orderBy: [{ version: 'desc' }] });
    return [...rows.map(version), this.defaultVersion(d)];
  }

  /** Tạo phiên bản mới (SYSTEM), ghi nhật ký trong cùng giao dịch */
  async update(admin: AuthUser, key: string, value: number, reason: string): Promise<SettingView> {
    const d = this.def(key);
    if (!Number.isInteger(value) || value < d.min || value > d.max) {
      throw invalid(`Giá trị phải là số nguyên từ ${d.min} đến ${d.max}.`);
    }
    const current = await this.values();
    if (current[key] === value) {
      throw new AppError(400, 'NOTHING_TO_CHANGE', 'Giá trị mới giống giá trị đang dùng.');
    }
    const problem = d.check?.(value, current);
    if (problem) throw invalid(problem);

    const created = await this.db.$transaction(async (tx) => {
      const [last] = await tx.setting.findMany({ where: { key }, orderBy: [{ version: 'desc' }] });
      const nextVersion = (last?.version ?? 0) + 1;
      let row: SettingRow;
      try {
        row = await tx.setting.create({
          data: {
            key,
            version: nextVersion,
            value,
            createdBy: admin.id,
            createdByName: admin.name,
            reason,
          },
        });
      } catch {
        // Trùng khóa (key, version): admin khác vừa lưu cùng lúc
        throw new AppError(409, 'SETTING_CONFLICT', 'Có người vừa sửa con số này, bạn tải lại.');
      }
      await writeAudit(tx, {
        actor: admin,
        action: 'UPDATE_SETTING',
        targetType: 'SETTING',
        targetId: key,
        reason,
        before: { value: current[key], version: last?.version ?? 0 },
        after: { value, version: nextVersion },
      });
      return row;
    });
    return this.view(d, created);
  }

  private def(key: string): SettingDefinition {
    const d = this.defs.get(key);
    if (!d) throw new AppError(404, 'NOT_FOUND', 'Không có cấu hình này.');
    return d;
  }

  /** Phiên bản mới nhất của từng khóa */
  private async latest(keys: string[]): Promise<Map<string, SettingRow>> {
    const rows = await this.db.setting.findMany({
      where: { key: { in: keys } },
      orderBy: [{ key: 'asc' }, { version: 'desc' }],
      distinct: ['key'],
    });
    return new Map(rows.map((r) => [r.key, r]));
  }

  private defaultVersion(d: SettingDefinition): SettingVersion {
    return {
      version: 0,
      value: d.defaultValue,
      effectiveFrom: null,
      createdBy: null,
      createdByName: null,
      reason: null,
    };
  }

  private view(d: SettingDefinition, row: SettingRow | undefined): SettingView {
    return {
      key: d.key,
      label: d.label,
      unit: d.unit,
      description: d.description ?? null,
      min: d.min,
      max: d.max,
      defaultValue: d.defaultValue,
      ...(row ? version(row) : this.defaultVersion(d)),
    };
  }
}

function version(r: SettingRow): SettingVersion {
  return {
    version: r.version,
    value: r.value,
    effectiveFrom: r.effectiveFrom,
    createdBy: r.createdBy,
    createdByName: r.createdByName,
    reason: r.reason,
  };
}

function invalid(message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
    fields: { value: message },
  });
}
