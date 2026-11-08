import type { AppConfig } from '../config';
import { CarrierRejectedError, type CreateShipmentInput } from './carrier';
import { GhnCarrier } from './ghn.carrier';

const config = {
  ghnToken: 'token-test',
  ghnShopId: '123',
  ghnApiUrl: 'https://ghn.test',
  packageLengthCm: 20,
  packageWidthCm: 15,
  packageHeightCm: 10,
} as AppConfig;

const input = (weight = 1000): CreateShipmentInput => ({
  clientCode: 'SO-1',
  from: {
    name: 'Shop',
    phone: '0900000001',
    address: '1 Lê Lợi',
    districtId: 1,
    wardCode: 'W1',
    wardName: 'Phường Bến Nghé',
    districtName: 'Quận 1',
    provinceName: 'Hồ Chí Minh',
  },
  to: {
    name: 'Người mua',
    phone: '0900000002',
    address: '2 Kim Mã',
    districtId: 2,
    wardCode: 'W2',
    wardName: 'Phường Kim Mã',
    districtName: 'Quận Ba Đình',
    provinceName: 'Hà Nội',
  },
  codAmount: 0,
  weight,
  items: [{ name: 'Điện thoại', quantity: 1, weight }],
});

describe('GhnCarrier', () => {
  const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
  const reply = (data: unknown, code = 200) =>
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code, data }), { status: 200 }));
  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    return {
      url,
      init,
      body: init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined,
    };
  };
  const carrier = new GhnCarrier(config);

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('gửi tên phường, quận, tỉnh của cả hai đầu và header ShopId', async () => {
    reply({ order_code: 'GHN1', total_fee: 30000 });
    await expect(carrier.createOrder(input())).resolves.toEqual({ ghnCode: 'GHN1', fee: 30000 });
    const { body, init } = lastCall();
    expect(body).toMatchObject({
      from_ward_name: 'Phường Bến Nghé',
      from_district_name: 'Quận 1',
      from_province_name: 'Hồ Chí Minh',
      to_ward_name: 'Phường Kim Mã',
      to_district_name: 'Quận Ba Đình',
      to_province_name: 'Hà Nội',
      service_type_id: 2,
    });
    expect(init.headers).toMatchObject({ Token: 'token-test', ShopId: '123' });
  });

  it('thiếu tên địa chỉ thì từ chối, không gọi GHN (tránh lấy hàng sai chỗ)', async () => {
    const bad = input();
    delete bad.from.wardName;
    await expect(carrier.createOrder(bad)).rejects.toBeInstanceOf(CarrierRejectedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dưới 20 kg dùng dịch vụ 2; từ 20 kg dùng dịch vụ 5 và món hàng có kích thước', async () => {
    reply({ order_code: 'GHN2' });
    await carrier.createOrder(input(19_999));
    expect(lastCall().body).toMatchObject({ service_type_id: 2 });
    expect((lastCall().body!.items as object[])[0]).not.toHaveProperty('length');

    reply({ order_code: 'GHN3' });
    await carrier.createOrder(input(20_000));
    expect(lastCall().body).toMatchObject({ service_type_id: 5 });
    expect((lastCall().body!.items as object[])[0]).toMatchObject({
      length: 20,
      width: 15,
      height: 10,
      weight: 20_000,
    });
  });

  it('tra vận đơn bằng GET; GHN báo không có thì trả null', async () => {
    reply({ order_code: 'GHN4' });
    await expect(carrier.findByClientCode('SO 1')).resolves.toEqual({ ghnCode: 'GHN4', fee: null });
    expect(lastCall().init.method).toBe('GET');
    expect(lastCall().init.body).toBeUndefined();
    expect(lastCall().url).toBe(
      'https://ghn.test/v2/shipping-order/detail-by-client-code?client_order_code=SO+1',
    );

    reply(null, 400);
    await expect(carrier.findByClientCode('SO-2')).resolves.toBeNull();
  });

  it('hủy vận đơn: gửi mã lý do; GHN không cho hủy thì báo đã lấy hàng', async () => {
    reply([{ order_code: 'GHN5', result: true }]);
    await expect(carrier.cancelOrder('GHN5')).resolves.toBe('CANCELLED');
    expect(lastCall().body).toEqual({ order_codes: ['GHN5'], reason_code: 'GHN-CANCEL-OTHER' });

    reply([{ order_code: 'GHN6', result: false }]);
    await expect(carrier.cancelOrder('GHN6')).resolves.toBe('ALREADY_PICKED');
  });
});
