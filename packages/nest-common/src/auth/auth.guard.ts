import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@san/shared';
import type { Request } from 'express';
import { AppError } from '../errors/app-error';
import { IS_PUBLIC, REQUIRED_PERMISSIONS } from './decorators';
import { AuthUser, JwtVerifier, TokenError } from './jwt';

/**
 * Chạy trước mọi API: kiểm access token (header Authorization: Bearer ...) và bộ quyền admin.
 * - Không có vé / vé sai → 401 UNAUTHENTICATED; vé hết hạn → 401 TOKEN_EXPIRED.
 * - Thiếu bộ quyền → 403 FORBIDDEN.
 * Quyền theo chủ sở hữu (ví dụ chỉ chủ shop sửa shop) kiểm trong service, không ở đây.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: JwtVerifier,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (token) {
      try {
        req.user = await this.verifier.verify(token);
      } catch (e) {
        // API công khai vẫn cho qua khi vé hỏng; API cần đăng nhập thì báo lỗi
        if (!isPublic) {
          if (e instanceof TokenError && e.expired) {
            throw new AppError(401, 'TOKEN_EXPIRED', 'Phiên đăng nhập đã hết hạn.');
          }
          throw new AppError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập.');
        }
      }
    }
    if (isPublic) return true;
    if (!req.user) throw new AppError(401, 'UNAUTHENTICATED', 'Bạn cần đăng nhập.');

    const needed = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS, targets);
    if (needed?.length && !needed.some((p) => req.user!.permissions.includes(p))) {
      throw new AppError(403, 'FORBIDDEN', 'Bạn không có quyền làm việc này.');
    }
    return true;
  }
}
