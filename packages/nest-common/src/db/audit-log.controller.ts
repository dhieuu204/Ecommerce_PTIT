import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import type { Page } from '@san/shared';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { RequirePermissions } from '../auth/decorators';
import { SAN_PRISMA } from '../options';
import type { AuditLogRow, AuditLogWhere, AuditReadDb } from './db-types';
import { PageQuery, skipTake, toPage } from './pagination';

export class AuditLogQuery extends PageQuery {
  /** Từ thời điểm (ISO 8601) */
  @ApiPropertyOptional({ example: '2026-10-01T00:00:00Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'from phải là ngày giờ hợp lệ.' })
  from?: Date;

  /** Đến thời điểm (ISO 8601) */
  @ApiPropertyOptional({ example: '2026-10-09T23:59:59Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'to phải là ngày giờ hợp lệ.' })
  to?: Date;

  /** Mã admin đã làm */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('all', { message: 'actorId không hợp lệ.' })
  actorId?: string;

  /** Hành động, ví dụ SET_PERMISSIONS */
  @ApiPropertyOptional({ example: 'SET_PERMISSIONS' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;
}

/**
 * Nhật ký thao tác admin của service này (ADM-02). Có sẵn ở cả 4 service qua SanCommonModule;
 * trang admin của web gọi từng service rồi gộp theo thời gian.
 */
@ApiTags('Nhật ký thao tác')
@ApiBearerAuth()
@RequirePermissions('SYSTEM')
@Controller('admin/audit-logs')
export class AuditLogController {
  constructor(@Inject(SAN_PRISMA) private readonly db: AuditReadDb) {}

  /** Mới nhất lên đầu */
  @Get()
  async list(@Query() q: AuditLogQuery): Promise<Page<AuditLogRow>> {
    const where: AuditLogWhere = {};
    if (q.from || q.to) where.createdAt = { gte: q.from, lte: q.to };
    if (q.actorId) where.actorId = q.actorId;
    if (q.action) where.action = q.action;
    const [items, total] = await Promise.all([
      this.db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q) }),
      this.db.auditLog.count({ where }),
    ]);
    return toPage(items, total, q);
  }
}
