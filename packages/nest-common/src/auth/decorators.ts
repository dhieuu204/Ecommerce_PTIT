import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@san/shared';
import type { AuthUser } from './jwt';

export const IS_PUBLIC = 'san:isPublic';
export const REQUIRED_PERMISSIONS = 'san:permissions';

/** API không cần đăng nhập (ví dụ đăng ký, danh sách tỉnh). Mặc định mọi API đều cần đăng nhập. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** API cho admin: người gọi phải có ít nhất một trong các bộ quyền này. */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

/** Lấy người đang gọi API: `@CurrentUser() user: AuthUser`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
