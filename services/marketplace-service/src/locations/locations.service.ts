import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleInit } from '@nestjs/common';
import { AppError, JobService } from '@san/nest-common';
import { PrismaService } from '../prisma.service';
import { GhnClient, type GhnWard } from './ghn.client';
import { SAMPLE_LOCATIONS } from './sample-locations';

export interface Place {
  id: number;
  name: string;
}
export interface WardPlace {
  code: string;
  name: string;
}
/** Địa chỉ đã kiểm, kèm tên để lưu và hiển thị */
export interface ResolvedAddress {
  provinceId: number;
  districtId: number;
  wardCode: string;
  provinceName: string;
  districtName: string;
  wardName: string;
}

export const SYNC_LOCATIONS_JOB = 'sync-locations';
/** Đồng bộ lúc 3 giờ sáng mỗi ngày (giờ Việt Nam) */
const SYNC_CRON = '0 3 * * *';
/** GHN dev có vài dòng thử nghiệm, bỏ đi */
const isTestEntry = (name: string) => /test|thử nghiệm|demo/i.test(name);
/** Sắp tên theo thứ tự chữ cái tiếng Việt (Đ sau D), không phụ thuộc collation của database */
const vi = new Intl.Collator('vi');
const byName = <T extends { name: string }>(rows: T[]) =>
  rows.sort((a, b) => vi.compare(a.name, b.name));

/**
 * Tỉnh/huyện/xã (SHP-03, ACC-04). marketplace-service là chủ dữ liệu này: lấy từ GHN, lưu trong market_db,
 * job pg-boss đồng bộ mỗi ngày. Chưa có GHN_TOKEN thì dùng danh sách mẫu (mô phỏng).
 */
@Injectable()
export class LocationsService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger(LocationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ghn: GhnClient,
    private readonly jobs: JobService,
  ) {}

  onModuleInit(): void {
    this.jobs.define(SYNC_LOCATIONS_JOB, { cron: SYNC_CRON }, () => this.sync());
  }

  /** Database chưa có dữ liệu (lần chạy đầu) thì đồng bộ ngay */
  async onApplicationBootstrap(): Promise<void> {
    try {
      if ((await this.prisma.province.count()) === 0) await this.jobs.run(SYNC_LOCATIONS_JOB);
    } catch (e) {
      this.logger.warn(`Chưa kiểm được bảng tỉnh/thành: ${(e as Error).message}`);
    }
  }

  async provinces(): Promise<Place[]> {
    return byName(await this.prisma.province.findMany({ select: { id: true, name: true } }));
  }

  async districts(provinceId: number): Promise<Place[]> {
    if (!Number.isInteger(provinceId)) return [];
    return byName(
      await this.prisma.district.findMany({
        where: { provinceId },
        select: { id: true, name: true },
      }),
    );
  }

  async wards(districtId: number): Promise<WardPlace[]> {
    if (!Number.isInteger(districtId)) return [];
    return byName(
      await this.prisma.ward.findMany({
        where: { districtId },
        select: { code: true, name: true },
      }),
    );
  }

  /** Kiểm 3 mã khớp nhau, trả kèm tên. Sai → 400 VALIDATION_ERROR chỉ rõ ô sai (field = prefix + tên ô). */
  async resolve(
    provinceId: number,
    districtId: number,
    wardCode: string,
    fieldPrefix = '',
  ): Promise<ResolvedAddress> {
    const ward = await this.prisma.ward.findUnique({
      where: { districtId_code: { districtId, code: wardCode } },
      include: { district: { include: { province: true } } },
    });
    if (!ward || ward.district.provinceId !== provinceId) {
      const district = await this.prisma.district.findUnique({ where: { id: districtId } });
      const [field, message] = !(await this.prisma.province.findUnique({
        where: { id: provinceId },
      }))
        ? ['provinceId', 'Tỉnh/thành không hợp lệ.']
        : !district || district.provinceId !== provinceId
          ? ['districtId', 'Quận/huyện không thuộc tỉnh/thành đã chọn.']
          : ['wardCode', 'Phường/xã không thuộc quận/huyện đã chọn.'];
      throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
        fields: { [`${fieldPrefix}${field}`]: message },
      });
    }
    return {
      provinceId,
      districtId,
      wardCode,
      provinceName: ward.district.province.name,
      districtName: ward.district.name,
      wardName: ward.name,
    };
  }

  /**
   * Thay toàn bộ danh sách bằng dữ liệu mới trong một giao dịch (không bảng nào khác khóa ngoại vào đây,
   * địa chỉ chỉ lưu mã và tên). Tải GHN lỗi giữa chừng thì giữ nguyên dữ liệu cũ.
   */
  async sync(): Promise<void> {
    const data = this.ghn.configured ? await this.fetchGhn() : this.sample();
    await this.prisma.$transaction(
      async (tx) => {
        await tx.ward.deleteMany();
        await tx.district.deleteMany();
        await tx.province.deleteMany();
        await tx.province.createMany({ data: data.provinces });
        await tx.district.createMany({ data: data.districts });
        await tx.ward.createMany({ data: data.wards });
      },
      { timeout: 60_000 },
    );
    this.logger.log(
      `Đã đồng bộ ${data.provinces.length} tỉnh, ${data.districts.length} huyện, ${data.wards.length} xã` +
        (this.ghn.configured ? ' từ GHN.' : ' (DỮ LIỆU MẪU, chưa đặt GHN_TOKEN).'),
    );
  }

  private async fetchGhn() {
    const provinces = (await this.ghn.provinces())
      .filter((p) => !isTestEntry(p.ProvinceName))
      .map((p) => ({ id: p.ProvinceID, name: p.ProvinceName.trim() }));
    const provinceIds = new Set(provinces.map((p) => p.id));
    const districts = (await this.ghn.districts())
      .filter((d) => provinceIds.has(d.ProvinceID) && !isTestEntry(d.DistrictName))
      .map((d) => ({ id: d.DistrictID, provinceId: d.ProvinceID, name: d.DistrictName.trim() }));

    // Mỗi huyện một lần gọi; chạy 5 lời gọi cùng lúc cho nhanh mà không dồn GHN
    const wards: GhnWard[] = [];
    for (let i = 0; i < districts.length; i += 5) {
      const batch = await Promise.all(districts.slice(i, i + 5).map((d) => this.ghn.wards(d.id)));
      wards.push(...batch.flat());
    }
    // Bỏ dòng thử nghiệm và dòng trùng mã (GHN dev đôi khi trả trùng)
    const unique = new Map<string, { code: string; districtId: number; name: string }>();
    for (const w of wards) {
      if (isTestEntry(w.WardName)) continue;
      unique.set(`${w.DistrictID}:${w.WardCode}`, {
        code: w.WardCode,
        districtId: w.DistrictID,
        name: w.WardName.trim(),
      });
    }
    return { provinces, districts, wards: [...unique.values()] };
  }

  private sample() {
    this.logger.warn(
      'Chưa đặt GHN_TOKEN: dùng danh sách tỉnh/huyện/xã MẪU (mô phỏng, mã không phải mã GHN).',
    );
    return {
      provinces: SAMPLE_LOCATIONS.map((p) => ({ id: p.id, name: p.name })),
      districts: SAMPLE_LOCATIONS.flatMap((p) =>
        p.districts.map((d) => ({ id: d.id, provinceId: p.id, name: d.name })),
      ),
      wards: SAMPLE_LOCATIONS.flatMap((p) =>
        p.districts.flatMap((d) =>
          d.wards.map((name, i) => ({
            code: `${d.id}${String(i + 1).padStart(2, '0')}`,
            districtId: d.id,
            name,
          })),
        ),
      ),
    };
  }
}
