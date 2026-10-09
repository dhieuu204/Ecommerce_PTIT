import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseIdPipe, RequirePermissions, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import { AdminUsersService, type UserDetail, type UserRow } from './admin-users.service';
import { ListUsersQuery, LockUserDto, SetPermissionsDto } from './dto/admin-users.dto';

/** Người dùng và bộ quyền (ACC-05). Chỉ admin có bộ quyền SYSTEM. */
@ApiTags('Admin: người dùng và quyền')
@ApiBearerAuth()
@RequirePermissions('SYSTEM')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  /** Danh sách, mới đăng ký trước; lọc theo email/tên, trạng thái, bộ quyền */
  @Get()
  list(@Query() q: ListUsersQuery): Promise<Page<UserRow>> {
    return this.users.list(q);
  }

  @Get(':userId')
  detail(@Param('userId', ParseIdPipe) userId: string): Promise<UserDetail> {
    return this.users.detail(userId);
  }

  /** Đặt lại toàn bộ bộ quyền, kèm lý do. Bỏ bớt quyền thì người đó bị đăng xuất mọi nơi */
  @Put(':userId/permissions')
  @ApiResponse({ status: 409, description: 'CANNOT_REMOVE_OWN_SYSTEM' })
  setPermissions(
    @CurrentUser() admin: AuthUser,
    @Param('userId', ParseIdPipe) userId: string,
    @Body() dto: SetPermissionsDto,
  ): Promise<UserDetail> {
    return this.users.setPermissions(admin, userId, dto);
  }

  /** Khóa tài khoản, kèm lý do; đăng xuất mọi nơi */
  @Post(':userId/lock')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'CANNOT_LOCK_SELF hoặc ALREADY_LOCKED' })
  lock(
    @CurrentUser() admin: AuthUser,
    @Param('userId', ParseIdPipe) userId: string,
    @Body() dto: LockUserDto,
  ): Promise<UserDetail> {
    return this.users.lock(admin, userId, dto);
  }

  /** Mở khóa tài khoản, kèm lý do */
  @Post(':userId/unlock')
  @HttpCode(200)
  @ApiResponse({ status: 409, description: 'NOT_LOCKED' })
  unlock(
    @CurrentUser() admin: AuthUser,
    @Param('userId', ParseIdPipe) userId: string,
    @Body() dto: LockUserDto,
  ): Promise<UserDetail> {
    return this.users.unlock(admin, userId, dto);
  }
}
