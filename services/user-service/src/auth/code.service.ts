import { Injectable } from '@nestjs/common';
import { AppError } from '@san/nest-common';
import { createHash, randomInt } from 'node:crypto';
import { AppConfig } from '../config';
import { PrismaService } from '../prisma.service';
import type { CodePurpose, Prisma } from '../../generated/prisma';

/** Băm mã kèm userId (cùng mã 6 số của hai người khác nhau ra hai bản băm khác nhau). */
function hashCode(userId: string, code: string): string {
  return createHash('sha256').update(`${userId}:${code}`).digest('hex');
}

/**
 * Mã 6 số gửi qua email (ACC-01 xác minh tài khoản, ACC-03 đặt lại mật khẩu).
 * Hạn 10 phút, sai tối đa 5 lần, dùng một lần; mã mới thay mã cũ cùng mục đích.
 */
@Injectable()
export class CodeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /** Số giây còn phải chờ trước khi gửi mã mới (0 = gửi được). */
  async cooldownLeft(userId: string, purpose: CodePurpose): Promise<number> {
    const last = await this.prisma.verificationCode.findFirst({
      where: { userId, purpose },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!last) return 0;
    const waited = (Date.now() - last.createdAt.getTime()) / 1000;
    return Math.max(0, Math.ceil(this.config.resendCooldownSeconds - waited));
  }

  /** Tạo mã mới (xóa các mã chưa dùng cùng mục đích), trả mã gốc để gửi mail. */
  async issue(db: Prisma.TransactionClient, userId: string, purpose: CodePurpose): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await db.verificationCode.deleteMany({ where: { userId, purpose, usedAt: null } });
    await db.verificationCode.create({
      data: {
        userId,
        purpose,
        codeHash: hashCode(userId, code),
        expiresAt: new Date(Date.now() + this.config.codeTtlMinutes * 60_000),
      },
    });
    return code;
  }

  /**
   * Kiểm mã. Đúng → đánh dấu đã dùng. Sai → 400 CODE_INVALID kèm attemptsLeft.
   * Không có mã, hết hạn, đã dùng hoặc sai đủ 5 lần → 400 CODE_EXPIRED.
   * userId undefined (email không có tài khoản) cũng trả CODE_EXPIRED, không lộ email có tồn tại không.
   */
  async consume(userId: string | undefined, purpose: CodePurpose, code: string): Promise<void> {
    const max = this.config.codeMaxAttempts;
    const expired = (
      message = 'Mã đã hết hạn hoặc không còn dùng được. Vui lòng gửi lại mã mới.',
    ) => new AppError(400, 'CODE_EXPIRED', message);
    if (!userId) throw expired();

    const row = await this.prisma.verificationCode.findFirst({
      where: { userId, purpose, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || row.expiresAt <= new Date() || row.attempts >= max) throw expired();

    if (row.codeHash !== hashCode(userId, code)) {
      // Tăng số lần sai ngay trong câu lệnh, hai lần nhập cùng lúc không lách được giới hạn
      const { count } = await this.prisma.verificationCode.updateMany({
        where: { id: row.id, usedAt: null, attempts: { lt: max } },
        data: { attempts: { increment: 1 } },
      });
      if (count === 0) throw expired();
      const left = max - row.attempts - 1;
      if (left <= 0) throw expired(`Bạn đã nhập sai ${max} lần. Vui lòng gửi lại mã mới.`);
      throw new AppError(400, 'CODE_INVALID', `Mã không đúng. Bạn còn ${left} lần thử.`, {
        attemptsLeft: left,
      });
    }

    const { count } = await this.prisma.verificationCode.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) throw expired();
  }
}
