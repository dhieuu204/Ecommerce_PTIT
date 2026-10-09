import { Injectable } from '@nestjs/common';
import { AppError, skipTake, toPage, writeAudit, type AuthUser } from '@san/nest-common';
import type { Page, Permission } from '@san/shared';
import { PrismaService } from '../prisma.service';
import { SessionService } from '../sessions/session.service';
import type { Prisma, User } from '../../generated/prisma';
import type { ListUsersQuery, LockUserDto, SetPermissionsDto } from './dto/admin-users.dto';

/** Một dòng trong danh sách người dùng */
export interface UserRow {
  id: string;
  email: string;
  fullName: string;
  status: User['status'];
  permissions: Permission[];
  hasGoogle: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

/** Chi tiết một người dùng cho admin */
export interface UserDetail extends UserRow {
  phone: string | null;
  lockReason: string | null;
  /** Số thiết bị đang đăng nhập */
  activeSessions: number;
}

function row(u: User): UserRow {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    status: u.status,
    permissions: u.permissions,
    hasGoogle: u.googleId !== null,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

/** Admin quản lý người dùng và bộ quyền (ACC-05). Mọi thao tác ghi nhật ký. */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  async list(q: ListUsersQuery): Promise<Page<UserRow>> {
    const where: Prisma.UserWhereInput = {
      status: q.status,
      ...(q.permission ? { permissions: { has: q.permission } } : {}),
      ...(q.q
        ? {
            OR: [
              { email: { contains: q.q, mode: 'insensitive' } },
              { fullName: { contains: q.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q) }),
      this.prisma.user.count({ where }),
    ]);
    return toPage(items.map(row), total, q);
  }

  async detail(userId: string): Promise<UserDetail> {
    const user = await this.find(userId);
    const activeSessions = await this.prisma.session.count({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    return { ...row(user), phone: user.phone, lockReason: user.lockReason, activeSessions };
  }

  /**
   * Đặt lại toàn bộ bộ quyền. Không tự bỏ SYSTEM của mình (409 CANNOT_REMOVE_OWN_SYSTEM), để hệ thống
   * luôn còn người quản trị. Bỏ bớt quyền → thu hồi mọi phiên của người đó (vé hiện tại hết hạn trong 15 phút).
   */
  async setPermissions(
    admin: AuthUser,
    userId: string,
    dto: SetPermissionsDto,
  ): Promise<UserDetail> {
    const user = await this.find(userId);
    if (admin.id === userId && !dto.permissions.includes('SYSTEM')) {
      throw new AppError(
        409,
        'CANNOT_REMOVE_OWN_SYSTEM',
        'Bạn không thể tự bỏ bộ quyền Quản trị hệ thống của chính mình.',
      );
    }
    const removed = user.permissions.some((p) => !dto.permissions.includes(p));
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { permissions: dto.permissions } });
      if (removed) await this.sessions.revokeAll(userId, tx);
      await writeAudit(tx, {
        actor: admin,
        action: 'SET_PERMISSIONS',
        targetType: 'USER',
        targetId: userId,
        reason: dto.reason,
        before: { permissions: user.permissions },
        after: { permissions: dto.permissions },
      });
    });
    return this.detail(userId);
  }

  /** Khóa tài khoản: không đăng nhập được, mọi phiên bị thu hồi. Không tự khóa mình. */
  async lock(admin: AuthUser, userId: string, dto: LockUserDto): Promise<UserDetail> {
    const user = await this.find(userId);
    if (admin.id === userId) {
      throw new AppError(409, 'CANNOT_LOCK_SELF', 'Bạn không thể tự khóa tài khoản của mình.');
    }
    if (user.status === 'LOCKED') {
      throw new AppError(409, 'ALREADY_LOCKED', 'Tài khoản này đang bị khóa.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { status: 'LOCKED', lockReason: dto.reason },
      });
      await this.sessions.revokeAll(userId, tx);
      await writeAudit(tx, {
        actor: admin,
        action: 'LOCK_USER',
        targetType: 'USER',
        targetId: userId,
        reason: dto.reason,
        before: { status: user.status },
        after: { status: 'LOCKED' },
      });
    });
    return this.detail(userId);
  }

  /**
   * Mở khóa. Bảng users không lưu trạng thái trước khi khóa, nên suy ra: người đã từng đăng nhập
   * hoặc đã gộp Google (đã chứng minh là chủ email) → ACTIVE; còn lại → UNVERIFIED (nhập mã như mới đăng ký).
   */
  async unlock(admin: AuthUser, userId: string, dto: LockUserDto): Promise<UserDetail> {
    const user = await this.find(userId);
    if (user.status !== 'LOCKED') {
      throw new AppError(409, 'NOT_LOCKED', 'Tài khoản này không bị khóa.');
    }
    const status = user.lastLoginAt || user.googleId ? 'ACTIVE' : 'UNVERIFIED';
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { status, lockReason: null, failedLogins: 0, loginLockedUntil: null },
      });
      await writeAudit(tx, {
        actor: admin,
        action: 'UNLOCK_USER',
        targetType: 'USER',
        targetId: userId,
        reason: dto.reason,
        before: { status: 'LOCKED', lockReason: user.lockReason },
        after: { status },
      });
    });
    return this.detail(userId);
  }

  private async find(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy người dùng.');
    return user;
  }
}
