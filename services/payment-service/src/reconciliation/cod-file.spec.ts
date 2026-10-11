import {
  buildCodFile,
  normalizeHeader,
  parseCsv,
  parseMoney,
  readCodFile,
  readRows,
} from './cod-file';

describe('File đối soát COD', () => {
  it('chuẩn hóa tiêu đề: bỏ dấu, chữ thường, bỏ ký tự đặc biệt', () => {
    expect(normalizeHeader('Tiền thu hộ (COD)')).toBe('tienthuhocod');
    expect(normalizeHeader(' Mã  Vận Đơn ')).toBe('mavandon');
    expect(normalizeHeader('Phí hoàn hàng')).toBe('phihoanhang');
  });

  it('đọc số tiền dạng số, "1.250.000", "1,250,000 đ"; trống = 0; chữ lạ = null', () => {
    expect(parseMoney(250000)).toBe(250_000);
    expect(parseMoney('1.250.000')).toBe(1_250_000);
    expect(parseMoney('1,250,000 đ')).toBe(1_250_000);
    expect(parseMoney('')).toBe(0);
    expect(parseMoney(null)).toBe(0);
    expect(parseMoney('không')).toBeNull();
    expect(parseMoney({ result: 30000 })).toBe(30_000);
  });

  it('CSV: dấu phẩy hoặc chấm phẩy, ô có ngoặc kép', () => {
    expect(parseCsv('a,b\n"1,5",x\r\n')).toEqual([
      ['a', 'b'],
      ['1,5', 'x'],
    ]);
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('tìm dòng tiêu đề dưới dòng tên file; bỏ dòng trống; cột phí không có thì = 0', () => {
    const rows = readRows([
      ['BẢNG ĐỐI SOÁT GHN'],
      [],
      ['STT', 'Mã vận đơn', 'Tiền thu hộ'],
      [1, 'ghnabc', '250.000'],
      [2, '', ''],
      [3, 'GHNXYZ', 100000],
    ]);
    expect(rows).toEqual([
      { rowNumber: 4, ghnCode: 'GHNABC', codAmount: 250_000, shipFee: 0, returnFee: 0 },
      { rowNumber: 6, ghnCode: 'GHNXYZ', codAmount: 100_000, shipFee: 0, returnFee: 0 },
    ]);
  });

  it('thiếu cột bắt buộc hoặc số tiền sai thì báo lỗi tiếng Việt', () => {
    expect(() => readRows([['Mã vận đơn', 'Ghi chú']])).toThrow(/Tiền thu hộ/);
    expect(() =>
      readRows([
        ['Mã vận đơn', 'Tiền thu hộ'],
        ['A1', 'abc'],
      ]),
    ).toThrow(/Dòng 2/);
    expect(() => readRows([['Mã vận đơn', 'Tiền thu hộ']])).toThrow(/không có dòng/);
  });

  it('file Excel tự tạo đọc lại được đúng số liệu', async () => {
    const buf = await buildCodFile(
      [
        {
          ghnCode: 'SIM1',
          clientCode: 'X-1',
          codAmount: 177_857,
          shipFee: 22_000,
          returnFee: 0,
          deliveredAt: new Date(),
        },
      ],
      'MÔ PHỎNG',
    );
    expect(await readCodFile(buf)).toEqual([
      { rowNumber: 3, ghnCode: 'SIM1', codAmount: 177_857, shipFee: 22_000, returnFee: 0 },
    ]);
  });
});
