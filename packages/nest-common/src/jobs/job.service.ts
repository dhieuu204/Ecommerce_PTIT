import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import PgBoss from 'pg-boss';
import { SAN_OPTIONS, type SanCommonOptions } from '../options';

type JobHandler = (data: Record<string, unknown>) => Promise<void>;

interface JobDefinition {
  name: string;
  /** Lịch chạy dạng cron, giờ Việt Nam; không có = chỉ chạy khi gọi run() */
  cron?: string;
  handler: JobHandler;
}

/** Múi giờ của lịch chạy job */
export const JOB_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Job hẹn giờ và việc chạy nền (luật kiến trúc số 8): dùng pg-boss, lưu hàng đợi trong database
 * của chính service (schema `pgboss`). Nhiều bản service chạy cùng lúc thì mỗi job vẫn chỉ một bản chạy.
 *
 *   onModuleInit() {
 *     this.jobs.define('sync-locations', { cron: '0 3 * * *' }, () => this.sync());
 *   }
 *   await this.jobs.run('sync-locations'); // chạy ngay một lần (vẫn qua hàng đợi)
 *
 * Lỗi trong handler: pg-boss thử lại 2 lần (cách 1 phút). Khi chạy test (NODE_ENV=test)
 * hoặc chưa đặt databaseUrl thì không bật pg-boss; test gọi thẳng hàm nghiệp vụ.
 */
@Injectable()
export class JobService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JobService.name);
  private readonly jobs = new Map<string, JobDefinition>();
  private boss?: PgBoss;
  /** Lệnh run() gọi trước khi pg-boss bật xong (thứ tự khởi động module không cố định) */
  private pendingRuns: Array<[string, Record<string, unknown>]> = [];

  constructor(@Inject(SAN_OPTIONS) private readonly options: SanCommonOptions) {}

  /** Khai báo một job. Gọi trong onModuleInit. */
  define(name: string, opts: { cron?: string }, handler: JobHandler): void {
    if (this.jobs.has(name)) throw new Error(`Đã có job ${name}`);
    this.jobs.set(name, { name, cron: opts.cron, handler });
  }

  /** Đưa job vào hàng đợi để chạy ngay (đang có một lần chạy chờ thì không thêm). */
  async run(name: string, data: Record<string, unknown> = {}): Promise<void> {
    if (!this.boss) {
      if (this.enabled) this.pendingRuns.push([name, data]);
      else this.logger.warn(`pg-boss không bật, bỏ qua job ${name}.`);
      return;
    }
    await this.boss.send(name, data, { singletonKey: name });
  }

  private get enabled(): boolean {
    return (
      Boolean(this.options.databaseUrl) && process.env.NODE_ENV !== 'test' && this.jobs.size > 0
    );
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.enabled) return;
    const boss = new PgBoss({ connectionString: this.options.databaseUrl, schema: 'pgboss' });
    boss.on('error', (e: Error) => this.logger.error(`pg-boss lỗi: ${e.message}`));
    try {
      await boss.start();
    } catch (e) {
      this.logger.error(`Chưa bật được pg-boss (${(e as Error).message}), job hẹn giờ không chạy.`);
      return;
    }
    for (const job of this.jobs.values()) {
      await boss.createQueue(job.name, {
        name: job.name,
        policy: 'singleton',
        retryLimit: 2,
        retryDelay: 60,
      });
      if (job.cron) await boss.schedule(job.name, job.cron, {}, { tz: JOB_TIMEZONE });
      await boss.work<Record<string, unknown>>(job.name, async ([item]) => {
        this.logger.log(`Chạy job ${job.name}`);
        await job.handler(item?.data ?? {});
      });
    }
    this.boss = boss;
    this.logger.log(`pg-boss đã bật: ${[...this.jobs.keys()].join(', ')}`);
    for (const [name, data] of this.pendingRuns.splice(0)) await this.run(name, data);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss?.stop({ graceful: true, wait: true }).catch(() => undefined);
  }
}
