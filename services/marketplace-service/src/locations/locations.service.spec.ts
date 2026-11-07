import type { JobService } from '@san/nest-common';
import type { PrismaService } from '../prisma.service';
import type { GhnClient } from './ghn.client';
import { LocationsService } from './locations.service';

/** Bắt dữ liệu sync() ghi vào database thay vì ghi thật */
function setup() {
  const saved: Record<string, unknown[]> = {};
  const table = (name: string) => ({
    deleteMany: jest.fn(),
    createMany: jest.fn(({ data }: { data: unknown[] }) => {
      saved[name] = data;
    }),
  });
  const tx = { province: table('provinces'), district: table('districts'), ward: table('wards') };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<void>) => fn(tx)),
  } as unknown as PrismaService;
  const ghn = {
    configured: true,
    provinces: jest.fn(async () => [
      { ProvinceID: 201, ProvinceName: 'Hà Nội' },
      { ProvinceID: 2002, ProvinceName: 'Hà Nội 02' },
      { ProvinceID: 9, ProvinceName: 'Tỉnh Test' },
    ]),
    districts: jest.fn(async (provinceId: number) =>
      provinceId === 201
        ? [
            { DistrictID: 1484, ProvinceID: 201, DistrictName: 'Quận Ba Đình' },
            { DistrictID: 3440, ProvinceID: 201, DistrictName: 'Quận Rỗng' },
          ]
        : [],
    ),
    wards: jest.fn(async (districtId: number) =>
      districtId === 1484
        ? [
            { WardCode: '1A0101', DistrictID: 1484, WardName: 'Phường Phúc Xá' },
            { WardCode: '1A0101', DistrictID: 1484, WardName: 'Phường Phúc Xá' },
          ]
        : [],
    ),
  } as unknown as GhnClient;
  const service = new LocationsService(prisma, ghn, {} as JobService);
  return { service, saved };
}

describe('LocationsService.sync với GHN', () => {
  it('bỏ tỉnh/huyện rỗng, dòng thử nghiệm và xã trùng mã', async () => {
    const { service, saved } = setup();
    await service.sync();
    expect(saved.provinces).toEqual([{ id: 201, name: 'Hà Nội' }]);
    expect(saved.districts).toEqual([{ id: 1484, provinceId: 201, name: 'Quận Ba Đình' }]);
    expect(saved.wards).toEqual([{ code: '1A0101', districtId: 1484, name: 'Phường Phúc Xá' }]);
  });
});
