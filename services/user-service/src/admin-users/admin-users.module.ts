import { Module } from '@nestjs/common';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

/** Admin: người dùng, bộ quyền, khóa tài khoản (ACC-05) */
@Module({
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
})
export class AdminUsersModule {}
