import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { SanPrismaDb } from '@san/nest-common';
import { PrismaClient } from '../generated/prisma';

/**
 * Kết nối database user-service. Inject vào service nghiệp vụ: `constructor(private prisma: PrismaService)`.
 * Prisma tự kết nối ở truy vấn đầu tiên, nên service vẫn khởi động được khi database chưa bật.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

// Kiểm lúc biên dịch: 3 bảng kỹ thuật (audit_logs, outbox_events, inbox_events) khớp với gói chung
export const checkPrismaShape = (db: PrismaService): SanPrismaDb => db;
