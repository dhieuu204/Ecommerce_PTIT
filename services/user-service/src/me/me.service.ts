import { Injectable } from '@nestjs/common';
import { AppError, type AuthUser } from '@san/nest-common';
import type { Permission } from '@san/shared';
import { checkPassword, hashPassword } from '../common/password';
import { PrismaService } from '../prisma.service';
import { SessionService } from '../sessions/session.service';
import type { User } from '../../generated/prisma';
import type { ChangePasswordDto, UpdateProfileDto } from './dto/me.dto';

/** Hồ sơ trả cho chính chủ */
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
  /** Đã có mật khẩu (false: chỉ đăng nhập bằng Google, đổi mật khẩu thì bỏ trống mật khẩu hiện tại) */
  hasPassword: boolean;
  /** Đã gộp tài khoản Google */
  hasGoogle: boolean;
  createdAt: Date;
}

export function toProfile(u: User): Profile {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    birthday: u.birthday ? u.birthday.toISOString().slice(0, 10) : null,
    gender: u.gender,
    status: u.status,
    permissions: u.permissions,
    hasPassword: u.passwordHash !== null,
    hasGoogle: u.googleId !== null,
    createdAt: u.createdAt,
  };
}

/** Hồ sơ của tôi, đổi mật khẩu (ACC-03, ACC-04) */
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  async get(userId: string): Promise<Profile> {
    return toProfile(await this.find(userId));
  }

  /** Sửa hồ sơ. Đổi họ tên thì web gọi /auth/refresh để vé đăng nhập mang tên mới. */
  async update(userId: string, dto: UpdateProfileDto): Promise<Profile> {
    await this.find(userId);
    if (dto.birthday && new Date(dto.birthday) > new Date()) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
        fields: { birthday: 'Ngày sinh không được ở tương lai.' },
      });
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        birthday:
          dto.birthday === undefined
            ? undefined
            : dto.birthday && new Date(`${dto.birthday}T00:00:00Z`),
        gender: dto.gender,
      },
    });
    return toProfile(user);
  }

  /**
   * Đổi mật khẩu. Có mật khẩu thì phải nhập đúng mật khẩu hiện tại (sai → 400 WRONG_PASSWORD);
   * tài khoản chỉ có Google thì đặt lần đầu. Xong thì đăng xuất các thiết bị khác, giữ thiết bị đang dùng.
   */
  async changePassword(me: AuthUser, dto: ChangePasswordDto): Promise<void> {
    const user = await this.find(me.id);
    if (user.passwordHash) {
      const ok = dto.currentPassword
        ? await checkPassword(dto.currentPassword, user.passwordHash)
        : false;
      if (!ok) throw new AppError(400, 'WRONG_PASSWORD', 'Mật khẩu hiện tại không đúng.');
    }
    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: me.id }, data: { passwordHash } });
      await this.sessions.revokeAll(me.id, tx, me.sessionId);
    });
  }

  private async find(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy tài khoản.');
    return user;
  }
}
