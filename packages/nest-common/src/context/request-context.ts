import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Thông tin gắn với một request, đọc được ở bất kỳ đâu trong lúc xử lý request đó. */
interface RequestContext {
  correlationId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Mã nối các bước của cùng một thao tác qua nhiều service.
 * Lấy từ header X-Correlation-Id nếu có, không thì sinh mới; trả lại trong header của response.
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(CORRELATION_HEADER);
  const correlationId = incoming && incoming.length <= 64 ? incoming : randomUUID();
  res.setHeader(CORRELATION_HEADER, correlationId);
  storage.run({ correlationId }, next);
}

/** Mã liên kết của request hiện tại; ngoài request (job, sự kiện) thì sinh mới. */
export function currentCorrelationId(): string {
  return storage.getStore()?.correlationId ?? randomUUID();
}

/** Chạy một đoạn code với mã liên kết cho trước (dùng khi xử lý sự kiện nhận được). */
export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return storage.run({ correlationId }, fn);
}
