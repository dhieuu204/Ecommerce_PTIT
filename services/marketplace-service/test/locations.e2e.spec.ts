import { LocationsService } from '../src/locations/locations.service';
import { API, createTestApp, describeDb, loadSampleLocations, type TestApp } from './helpers';

describeDb('Tỉnh/huyện/xã (SHP-03, ACC-04)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());

  it('chưa có token GHN → nạp danh sách mẫu; API công khai trả [{id,name}] và [{code,name}]', async () => {
    await loadSampleLocations(t);
    const provinces = await t.http().get(`${API}/locations/provinces`).expect(200);
    expect(provinces.body).toHaveLength(3);
    expect(provinces.body[0]).toEqual({ id: expect.any(Number), name: 'Đà Nẵng' });
    expect(provinces.headers['cache-control']).toContain('max-age');

    const districts = await t.http().get(`${API}/locations/provinces/90001/districts`).expect(200);
    expect(districts.body.map((d: { name: string }) => d.name)).toEqual([
      'Quận Ba Đình',
      'Quận Cầu Giấy',
    ]);
    const wards = await t.http().get(`${API}/locations/districts/90101/wards`).expect(200);
    expect(wards.body).toContainEqual({ code: '9010101', name: 'Phường Điện Biên' });

    await t.http().get(`${API}/locations/provinces/abc/districts`).expect(200, []);
    await t.http().get(`${API}/locations/provinces/1/districts`).expect(200, []);
  });

  it('có token GHN → thay toàn bộ bằng dữ liệu GHN, bỏ dòng thử nghiệm', async () => {
    t.ghn.configured = true;
    t.ghn.provinces.mockResolvedValue([
      { ProvinceID: 201, ProvinceName: 'Hà Nội' },
      { ProvinceID: 999, ProvinceName: 'Test - Alert - Tỉnh - 001' },
    ]);
    t.ghn.districts.mockResolvedValue([
      { DistrictID: 1484, ProvinceID: 201, DistrictName: 'Quận Ba Đình' },
      { DistrictID: 3000, ProvinceID: 999, DistrictName: 'Huyện của tỉnh test' },
    ]);
    t.ghn.wards.mockImplementation(async (districtId: number) =>
      districtId === 1484
        ? [
            { WardCode: '1A0101', DistrictID: 1484, WardName: 'Phường Phúc Xá' },
            { WardCode: '1A0101', DistrictID: 1484, WardName: 'Phường Phúc Xá' },
          ]
        : [],
    );
    await t.app.get(LocationsService).sync();

    const provinces = await t.http().get(`${API}/locations/provinces`).expect(200);
    expect(provinces.body).toEqual([{ id: 201, name: 'Hà Nội' }]);
    const wards = await t.http().get(`${API}/locations/districts/1484/wards`).expect(200);
    expect(wards.body).toEqual([{ code: '1A0101', name: 'Phường Phúc Xá' }]);
    expect(t.ghn.wards).toHaveBeenCalledTimes(1);
  });

  it('GHN lỗi giữa chừng → giữ nguyên dữ liệu cũ', async () => {
    t.ghn.configured = true;
    t.ghn.districts.mockRejectedValueOnce(new Error('GHN 500'));
    await expect(t.app.get(LocationsService).sync()).rejects.toThrow('GHN 500');
    const provinces = await t.http().get(`${API}/locations/provinces`).expect(200);
    expect(provinces.body).toEqual([{ id: 201, name: 'Hà Nội' }]);
  });

  it('kiểm địa chỉ: chỉ rõ ô sai', async () => {
    await loadSampleLocations(t);
    const locations = t.app.get(LocationsService);
    await expect(locations.resolve(90001, 90101, '9010101')).resolves.toMatchObject({
      provinceName: 'Hà Nội',
      districtName: 'Quận Ba Đình',
      wardName: 'Phường Điện Biên',
    });
    const fieldOf = (p: Promise<unknown>) =>
      p.catch(
        (e: { details: { fields: Record<string, string> } }) => Object.keys(e.details.fields)[0],
      );
    expect(await fieldOf(locations.resolve(1, 90101, '9010101'))).toBe('provinceId');
    expect(await fieldOf(locations.resolve(90002, 90101, '9010101'))).toBe('districtId');
    expect(await fieldOf(locations.resolve(90001, 90101, '9020101', 'pickupAddress.'))).toBe(
      'pickupAddress.wardCode',
    );
  });
});
