import { Workbook, type Worksheet } from 'exceljs';

/** Một dòng đọc được từ file đối soát COD của GHN */
export interface CodFileRow {
  /** Số dòng trong file (1 = dòng đầu tiên của trang tính) */
  rowNumber: number;
  ghnCode: string;
  codAmount: number;
  shipFee: number;
  returnFee: number;
}

/** File không đọc được: thông báo tiếng Việt cho admin */
export class CodFileError extends Error {}

/**
 * Tên tiêu đề cột hệ thống nhận ra (đã bỏ dấu, bỏ khoảng trắng và ký tự đặc biệt). Chưa có file mẫu thật
 * của GHN nên để riêng ở đây: khi có file thật chỉ cần thêm tên cột vào danh sách.
 */
export const COLUMN_ALIASES = {
  ghnCode: ['mavandon', 'mavandonghn', 'madonghn', 'ordercode', 'trackingcode', 'mavd', 'maghn'],
  codAmount: ['tienthuho', 'tienthuhocod', 'thuho', 'codamount', 'cod', 'tiencod', 'sotienthuho'],
  shipFee: [
    'phigiaohang',
    'phivanchuyen',
    'phiship',
    'phigiao',
    'shipfee',
    'phidichvu',
    'tongphi',
    'mainservice',
  ],
  returnFee: ['phihoan', 'phihoanhang', 'phichuyenhoan', 'returnfee'],
} as const;

type Column = keyof typeof COLUMN_ALIASES;

/** Tiêu đề cột của file mẫu và file MÔ PHỎNG */
export const TEMPLATE_HEADERS = [
  'Mã vận đơn',
  'Mã đơn hàng',
  'Tiền thu hộ (COD)',
  'Phí giao hàng',
  'Phí hoàn hàng',
  'Ngày giao',
];

export const MAX_ROWS = 5000;

/** "Tiền thu hộ (COD)" → "tienthuhocod" */
export function normalizeHeader(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Số tiền trong ô: số, hoặc chữ như "1.250.000", "1,250,000 đ"; trống = 0; không đọc được = null */
export function parseMoney(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v === 'object' && 'result' in (v as object)) {
    return parseMoney((v as { result: unknown }).result);
  }
  const s = String(v).trim();
  if (!s) return 0;
  const negative = s.startsWith('-');
  const digits = s.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return negative ? -n : n;
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as { text?: unknown; result?: unknown; richText?: Array<{ text: string }> };
    if (o.richText) return o.richText.map((r) => r.text).join('');
    if (o.text !== undefined) return String(o.text);
    if (o.result !== undefined) return String(o.result);
  }
  return String(v);
}

/** Tách CSV đơn giản (dấu phẩy hoặc chấm phẩy, có ngoặc kép) */
export function parseCsv(text: string): string[][] {
  // Bỏ ký tự BOM đầu file (Excel thêm khi lưu CSV UTF-8)
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Tìm dòng tiêu đề trong 10 dòng đầu (file GHN thường có dòng tiêu đề lớn phía trên) */
function findColumns(rows: unknown[][]): { headerIndex: number; cols: Record<Column, number> } {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const names = (rows[i] ?? []).map((v) => normalizeHeader(cellText(v)));
    const cols = {} as Record<Column, number>;
    for (const key of Object.keys(COLUMN_ALIASES) as Column[]) {
      cols[key] = names.findIndex((n) => (COLUMN_ALIASES[key] as readonly string[]).includes(n));
    }
    if (cols.ghnCode >= 0 && cols.codAmount >= 0) return { headerIndex: i, cols };
  }
  throw new CodFileError(
    'Không tìm thấy cột "Mã vận đơn" và "Tiền thu hộ (COD)" trong file. Bạn dùng file mẫu để xem tên cột.',
  );
}

/** Đọc các dòng dữ liệu từ bảng ô (đã tách từ Excel hoặc CSV) */
export function readRows(rows: unknown[][]): CodFileRow[] {
  const { headerIndex, cols } = findColumns(rows);
  const out: CodFileRow[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const ghnCode = cellText(r[cols.ghnCode]).trim().toUpperCase();
    if (!ghnCode) continue;
    const money = (col: number, label: string) => {
      if (col < 0) return 0;
      const n = parseMoney(r[col]);
      if (n === null || n < 0) {
        throw new CodFileError(
          `Dòng ${i + 1}: ${label} "${cellText(r[col])}" không phải số tiền hợp lệ.`,
        );
      }
      return n;
    };
    out.push({
      rowNumber: i + 1,
      ghnCode: ghnCode.slice(0, 40),
      codAmount: money(cols.codAmount, 'tiền thu hộ'),
      shipFee: money(cols.shipFee, 'phí giao hàng'),
      returnFee: money(cols.returnFee, 'phí hoàn'),
    });
    if (out.length > MAX_ROWS) throw new CodFileError(`File có quá ${MAX_ROWS} dòng.`);
  }
  if (out.length === 0) throw new CodFileError('File không có dòng dữ liệu nào.');
  return out;
}

function sheetRows(ws: Worksheet): unknown[][] {
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const values = (row.values as unknown[]).slice(1);
    rows[n - 1] = values;
  });
  return Array.from(rows, (r) => r ?? []);
}

/** Đọc file .xlsx hoặc .csv (nhận ra theo nội dung: file xlsx bắt đầu bằng "PK") */
export async function readCodFile(buffer: Buffer): Promise<CodFileRow[]> {
  const isXlsx = buffer.length > 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (!isXlsx) return readRows(parseCsv(buffer.toString('utf8')));
  const wb = new Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new CodFileError('Không đọc được file Excel.');
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new CodFileError('File Excel không có trang tính nào.');
  return readRows(sheetRows(ws));
}

/** Dòng ghi vào file mẫu / file MÔ PHỎNG */
export interface CodFileOutRow {
  ghnCode: string;
  clientCode: string;
  codAmount: number;
  shipFee: number;
  returnFee: number;
  deliveredAt: Date | null;
}

/** Tạo file Excel theo mẫu GHN (dùng cho file mẫu và file MÔ PHỎNG) */
export async function buildCodFile(rows: CodFileOutRow[], title: string): Promise<Buffer> {
  const wb = new Workbook();
  wb.creator = 'San TMDT';
  const ws = wb.addWorksheet('Doi soat COD');
  ws.addRow([title]);
  ws.getRow(1).font = { bold: true, size: 13 };
  ws.addRow(TEMPLATE_HEADERS);
  ws.getRow(2).font = { bold: true };
  for (const r of rows) {
    ws.addRow([
      r.ghnCode,
      r.clientCode,
      r.codAmount,
      r.shipFee,
      r.returnFee,
      r.deliveredAt ? r.deliveredAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '',
    ]);
  }
  ws.columns.forEach((c, i) => {
    c.width = [18, 20, 18, 16, 16, 22][i] ?? 16;
    if (i >= 2 && i <= 4) c.numFmt = '#,##0';
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
