#!/usr/bin/env node
/**
 * Thu thập dữ liệu sản phẩm thật cho bộ demo (chạy tay, một lần; kết quả đã lưu sẵn trong repo).
 *
 * Nguồn: thegioididong.com (cùng công ty với topzone.vn, cùng hàng và giá; trang có sẵn dữ liệu schema.org
 * ProductGroup gồm đủ biến thể màu/dung lượng, giá và ảnh theo màu). Tuân theo robots.txt: nghỉ 5 giây giữa
 * các trang (Crawl-delay: 5). Ảnh và thông tin thuộc về nguồn: chỉ dùng cho đồ án và buổi demo.
 *
 * Kết quả: services/marketplace-service/seed/demo-products.json và ảnh webp 640×640 trong seed/images
 * (giữ nguyên các sản phẩm ngoài nhóm công nghệ đang có). Cần ffmpeg trên máy để chuyển ảnh sang webp.
 * Cào xong chạy thêm `node scripts/normalize-demo-images.mjs` để vật thể trong mọi ảnh cùng cỡ, nằm giữa khung.
 *
 *   node scripts/crawl-demo-products.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SEED = join(ROOT, 'services', 'marketplace-service', 'seed');
const IMAGES = join(SEED, 'images');
const BASE = 'https://www.thegioididong.com';
const PAGE_DELAY = 5000;
const IMAGE_DELAY = 800;
const UA = 'Mozilla/5.0 (compatible; san-tmdt-do-an/1.0; du lieu demo do an mon hoc)';

/** Danh mục con (tên trong seed-categories) theo shop: A = Táo Xanh Mobile, B = Galaxy Hub */
const LIST = [
  // ----- Táo Xanh Mobile: hàng Apple -----
  { shop: 'A', category: 'iPhone', path: '/dtdd/iphone-17-pro-max' },
  { shop: 'A', category: 'iPhone', path: '/dtdd/iphone-17-pro' },
  { shop: 'A', category: 'iPhone', path: '/dtdd/iphone-17' },
  { shop: 'A', category: 'iPhone', path: '/dtdd/iphone-air' },
  { shop: 'A', category: 'iPhone', path: '/dtdd/iphone-16-plus' },
  { shop: 'A', category: 'iPhone', path: '/dtdd/iphone-16' },
  { shop: 'A', category: 'iPhone', path: '/dtdd/iphone-15' },
  { shop: 'A', category: 'MacBook', path: '/laptop/macbook-air-13-inch-m5-16gb-512gb' },
  { shop: 'A', category: 'MacBook', path: '/laptop/macbook-air-15-inch-m5-16gb-512gb' },
  { shop: 'A', category: 'MacBook', path: '/laptop/macbook-neo-13-inch-a18-pro-8gb-256gb' },
  { shop: 'A', category: 'iPad', path: '/may-tinh-bang/ipad-air-m4-11-inch-wifi-128gb' },
  { shop: 'A', category: 'iPad', path: '/may-tinh-bang/ipad-11-wifi-128gb' },
  { shop: 'A', category: 'iPad', path: '/may-tinh-bang/ipad-pro-m5-11-inch-wifi-256gb' },
  { shop: 'A', category: 'iPad', path: '/may-tinh-bang/ipad-air-m4-13-inch-5g-128gb' },
  {
    shop: 'A',
    category: 'Apple Watch',
    path: '/dong-ho-thong-minh/apple-watch-series-11-42mm-vien-nhom-day-the-thao',
  },
  {
    shop: 'A',
    category: 'Apple Watch',
    path: '/dong-ho-thong-minh/apple-watch-se-3-40mm-vien-nhom-day-the-thao',
  },
  {
    shop: 'A',
    category: 'Apple Watch',
    path: '/dong-ho-thong-minh/apple-watch-series-11-gps-cellular-46mm-vien-titanium-day-milan',
  },
  {
    shop: 'A',
    category: 'Tai nghe',
    path: '/tai-nghe/tai-nghe-bluetooth-apple-airpods-pro-3-trang-mfhp4',
  },
  { shop: 'A', category: 'Tai nghe', path: '/tai-nghe/airpods-4-chong-on-mxp93' },
  { shop: 'A', category: 'Tai nghe', path: '/tai-nghe/airpods-max-cong-usb-c' },
  { shop: 'A', category: 'Sạc và cáp', path: '/adapter-sac/sac-nhanh-apple-dynamic-40w-60w-mgtu4' },
  {
    shop: 'A',
    category: 'Ốp lưng',
    path: '/op-lung-flipcover/op-lung-magnetic-iphone-18-pro-max-17-pro-max-nomad-modern-leather-nm009179858',
  },
  // ----- Galaxy Hub: Samsung, Xiaomi, OPPO, Android, phụ kiện -----
  { shop: 'B', category: 'Samsung', path: '/dtdd/samsung-galaxy-s25-ultra' },
  { shop: 'B', category: 'Samsung', path: '/dtdd/samsung-galaxy-s25' },
  { shop: 'B', category: 'Samsung', path: '/dtdd/samsung-galaxy-z-flip7' },
  { shop: 'B', category: 'Samsung', path: '/dtdd/samsung-galaxy-z-fold7' },
  { shop: 'B', category: 'Samsung', path: '/dtdd/samsung-galaxy-a26' },
  { shop: 'B', category: 'Samsung', path: '/dtdd/samsung-galaxy-a17-8gb-128gb' },
  { shop: 'B', category: 'Xiaomi', path: '/dtdd/xiaomi-17' },
  { shop: 'B', category: 'Xiaomi', path: '/dtdd/xiaomi-17t-pro-5g-12gb-256gb' },
  { shop: 'B', category: 'Xiaomi', path: '/dtdd/xiaomi-poco-x8-pro-8gb-256gb' },
  { shop: 'B', category: 'Xiaomi', path: '/dtdd/xiaomi-redmi-15c-4gb-128gb' },
  { shop: 'B', category: 'OPPO', path: '/dtdd/oppo-a6-pro-5g-8gb-256gb' },
  { shop: 'B', category: 'OPPO', path: '/dtdd/oppo-a6-8gb-256gb' },
  { shop: 'B', category: 'OPPO', path: '/dtdd/oppo-a7-pro-5g-6gb-256gb' },
  {
    shop: 'B',
    category: 'Máy tính bảng Android',
    path: '/may-tinh-bang/samsung-galaxy-tab-s10-fe',
  },
  {
    shop: 'B',
    category: 'Máy tính bảng Android',
    path: '/may-tinh-bang/samsung-galaxy-tab-a11-plus-wifi-6gb-128gb',
  },
  {
    shop: 'B',
    category: 'Laptop Windows',
    path: '/laptop/asus-vivobook-14-x1404va-core-5-120u-eb260w',
  },
  {
    shop: 'B',
    category: 'Laptop Windows',
    path: '/laptop/asus-tuf-gaming-fa506ncq-r7-170-hn005w',
  },
  { shop: 'B', category: 'Laptop Windows', path: '/laptop/asus-ux5406sa-ultra-7-pv140ws' },
  { shop: 'B', category: 'Đồng hồ Android', path: '/dong-ho-thong-minh/samsung-galaxy-watch8' },
  {
    shop: 'B',
    category: 'Đồng hồ Android',
    path: '/dong-ho-thong-minh/samsung-galaxy-watch-ultra-2025',
  },
  {
    shop: 'B',
    category: 'Tai nghe',
    path: '/tai-nghe/tai-nghe-bluetooth-true-wireless-samsung-galaxy-buds-3-pro-r630n',
  },
  {
    shop: 'B',
    category: 'Tai nghe',
    path: '/tai-nghe/tai-nghe-bluetooth-true-wireless-samsung-galaxy-buds-3-fe-r420n',
  },
  { shop: 'B', category: 'Loa', path: '/loa-laptop/loa-bluetooth-jbl-flip-7' },
  { shop: 'B', category: 'Loa', path: '/loa-laptop/loa-bluetooth-jbl-charge-6' },
  { shop: 'B', category: 'Loa', path: '/loa-laptop/loa-bluetooth-jbl-go-4' },
  {
    shop: 'B',
    category: 'Sạc và cáp',
    path: '/adapter-sac/adapter-sac-type-c-pd-25w-samsung-ep-t2510n',
  },
  {
    shop: 'B',
    category: 'Sạc dự phòng',
    path: '/sac-dtdd/pin-sac-du-phong-10000mah-type-c-pd-qc-3-0-45w-anker-a1638',
  },
  {
    shop: 'B',
    category: 'Sạc dự phòng',
    path: '/sac-dtdd/pin-du-phong-10000mah-type-c-anker-powercore-a1229',
  },
];

/** Danh mục ngoài nhóm công nghệ: giữ nguyên sản phẩm demo đang có (nguồn không bán các mặt hàng này) */
const KEEP_CATEGORIES = new Set([
  'Thời trang nam',
  'Thời trang nữ',
  'Giày dép',
  'Túi xách',
  'Đồ dùng nhà bếp',
  'Trang trí',
  'Đồ gia dụng',
  'Chăm sóc da',
  'Trang điểm',
  'Nước hoa',
]);

/** Khối lượng đóng gói mặc định (gram) khi trang không ghi */
const DEFAULT_WEIGHT = {
  iPhone: 450,
  Samsung: 450,
  Xiaomi: 450,
  OPPO: 450,
  MacBook: 2000,
  'Laptop Windows': 2500,
  iPad: 900,
  'Máy tính bảng Android': 900,
  'Apple Watch': 300,
  'Đồng hồ Android': 300,
  'Tai nghe': 250,
  Loa: 900,
  'Sạc và cáp': 200,
  'Ốp lưng': 150,
  'Sạc dự phòng': 400,
};

/** Thông số ưu tiên đưa vào mô tả (theo thứ tự); thiếu thì lấy các dòng đầu tiên */
const SPEC_ORDER = [
  'Kích thước màn hình',
  'Màn hình',
  'Công nghệ màn hình',
  'Chip xử lý (CPU)',
  'Công nghệ CPU',
  'CPU',
  'Chip đồ họa (GPU)',
  'Card màn hình',
  'RAM',
  'Dung lượng lưu trữ',
  'Ổ cứng',
  'Độ phân giải camera sau',
  'Dung lượng pin',
  'Thời lượng pin',
  'Hỗ trợ sạc tối đa',
  'Công suất',
  'Hệ điều hành',
  'Kết nối',
  'Công nghệ âm thanh',
  'Tiêu chuẩn chống nước, chống bụi',
  'Kháng nước, bụi',
  'Chất liệu',
  'Khối lượng máy',
  'Khối lượng',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Trang đã tải được lưu tạm để chạy lại không phải tải lại (xóa thư mục này để lấy dữ liệu mới) */
const CACHE = join(tmpdir(), 'san-tmdt-crawl-cache');

/** Trả { html, cached }; null khi trang không có */
async function fetchText(url) {
  mkdirSync(CACHE, { recursive: true });
  const cacheFile = join(CACHE, `${slugify(url)}.html`);
  if (existsSync(cacheFile)) return { html: readFileSync(cacheFile, 'utf8'), cached: true };
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'vi' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      writeFileSync(cacheFile, html);
      return { html, cached: false };
    } catch (e) {
      console.warn(`  thử lại ${url}: ${e.message}`);
      await sleep(PAGE_DELAY);
    }
  }
  return null;
}

/** Các khối JSON-LD trong trang */
function jsonLd(html) {
  const out = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      // khối hỏng: bỏ qua
    }
  }
  return out;
}

const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');

const money = (s) => Number(String(s).replace(/[^\d]/g, '')) || null;

/** "256 GB" → "256GB", "1 TB" → "1TB" */
const normSize = (s) => (s ? String(s).replace(/\s+/g, '').toUpperCase() : '');

/** Giá trị so sánh để xếp dung lượng: 64GB < 128GB < 1TB */
function sizeRank(s) {
  const m = /^(\d+(?:\.\d+)?)(GB|TB|MM)?/i.exec(normSize(s));
  if (!m) return 0;
  const n = Number(m[1]);
  return m[2]?.toUpperCase() === 'TB' ? n * 1024 : n;
}

/**
 * Giá niêm yết theo dung lượng trong bảng "Giá bán" của bài viết (để làm giá gạch ngang). Bảng có dạng
 * `<td>… 256GB</td>[<td>1299$</td>]<td>33.990.000đ</td>` (ô có thể bọc <p>, <a>, <span>).
 */
function listPrices(html) {
  const map = new Map();
  const text = decode(
    html
      .replace(/\\u003c/g, '<')
      .replace(/\\u003e/g, '>')
      .replace(/\\"/g, '"'),
  );
  const cellEnd = String.raw`\s*(?:<\/(?:a|span|p|strong|b)>\s*)*<\/td>\s*`;
  const cellStart = String.raw`<td[^>]*>\s*(?:<(?:p|span|strong|b)[^>]*>\s*)*`;
  const re = new RegExp(
    String.raw`(\d+\s?(?:GB|TB))` +
      cellEnd +
      String.raw`(?:` +
      cellStart +
      String.raw`[\d.,]+\s?\$` +
      cellEnd +
      String.raw`)?` +
      cellStart +
      String.raw`([\d.]{9,11})\s*đ`,
    'gi',
  );
  let m;
  while ((m = re.exec(text))) {
    const size = normSize(m[1]);
    const price = money(m[2]);
    if (price && price > 100000 && !map.has(size)) map.set(size, price);
  }
  return map;
}

/** Giá bán và giá gạch ngang của biến thể đang hiển thị trên trang: <span>34.990.000đ</span><del>37.990.000đ</del> */
function shownPrices(html) {
  const m = /([\d.]{6,11})<!-- -->đ<\/span><div[^>]*><del[^>]*>([\d.]{6,11})<!-- -->đ/.exec(html);
  if (!m) return null;
  const sale = money(m[1]);
  const old = money(m[2]);
  return sale && old && old > sale ? { sale, old } : null;
}

/** Tên gọn: bỏ "chính hãng, giá tốt", màu và dung lượng ở cuối */
function cleanName(raw, colors) {
  let name = decode(raw)
    .replace(/\s*(chính hãng|giá tốt|giá rẻ).*$/i, '')
    .trim();
  for (const c of [...colors].sort((a, b) => b.length - a.length)) {
    if (c && name.toLowerCase().endsWith(` ${c.toLowerCase()}`)) {
      name = name.slice(0, -c.length - 1).trim();
      break;
    }
  }
  return name
    .replace(/\s+\d+GB\/\d+(GB|TB)$/i, '')
    .replace(/\s+\d+\s?(GB|TB)$/i, '')
    .trim();
}

function hash(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

/** Tồn kho giả định ổn định theo khóa (vài biến thể hết hàng cho thật) */
const stockFor = (seed) => {
  const h = hash(seed) % 60;
  return h < 4 ? 0 : h + 3;
};

function weightOf(props, category) {
  const raw = props.get('Khối lượng máy') ?? props.get('Khối lượng') ?? props.get('Trọng lượng');
  const m = raw && /([\d.,]+)\s*(kg|g)/i.exec(raw);
  if (!m) return DEFAULT_WEIGHT[category] ?? 500;
  const n = Number(m[1].replace(',', '.'));
  const grams = m[2].toLowerCase() === 'kg' ? n * 1000 : n;
  return Math.round(grams + 150); // cộng hộp và đóng gói
}

function describe(name, props) {
  const picked = [];
  for (const k of SPEC_ORDER) if (props.has(k) && picked.length < 8) picked.push(k);
  for (const k of props.keys()) if (picked.length < 6 && !picked.includes(k)) picked.push(k);
  const lines = picked.map((k) => `- ${k}: ${props.get(k).split('|').join(', ')}`);
  return [
    `${name} chính hãng, hàng mới 100%.`,
    '',
    'Thông số nổi bật',
    ...lines,
    '',
    'Bảo hành 12 tháng chính hãng. Đổi trả theo chính sách của sàn.',
    'Thông số tham khảo từ thegioididong.com.',
  ].join('\n');
}

const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Tải ảnh rồi chuyển sang webp 640×640 nền trắng bằng ffmpeg */
async function saveImage(url, file) {
  const res = await fetch(url, { headers: { 'user-agent': UA, referer: BASE } });
  if (!res.ok) throw new Error(`ảnh HTTP ${res.status}`);
  const tmp = join(tmpdir(), `crawl-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  try {
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-i',
      tmp,
      '-vf',
      'scale=640:640:force_original_aspect_ratio=decrease,pad=640:640:(ow-iw)/2:(oh-ih)/2:color=white',
      '-c:v',
      'libwebp',
      '-quality',
      '82',
      join(IMAGES, file),
    ]);
  } finally {
    rmSync(tmp, { force: true });
  }
}

async function crawlOne(entry, usedKeys) {
  const url = BASE + entry.path;
  const page = await fetchText(url);
  if (!page) {
    console.warn(`- bỏ qua (không có trang) ${entry.path}`);
    return null;
  }
  const { html } = page;
  entry.cached = page.cached;
  const blocks = jsonLd(html);
  const group = blocks.find((b) => b['@type'] === 'ProductGroup');
  const single = blocks.find((b) => b['@type'] === 'Product');
  const variantsRaw = group?.hasVariant ?? (single ? [single] : []);
  if (variantsRaw.length === 0) {
    console.warn(`- bỏ qua (không có dữ liệu sản phẩm) ${entry.path}`);
    return null;
  }
  const props = new Map();
  for (const p of group?.additionalProperty ?? single?.additionalProperty ?? []) {
    const value = p.value ? String(p.value).trim() : '';
    if (p.name && value && !/master/i.test(p.name) && !/không công bố|đang cập nhật/i.test(value)) {
      props.set(p.name, value);
    }
  }

  const rows = variantsRaw
    .map((v) => ({
      color: v.color ? decode(String(v.color)).trim() : '',
      size: normSize(v.size),
      price: money(v.offers?.price ?? v.offers?.lowPrice),
      image: (Array.isArray(v.image) ? v.image : [v.image])
        .map((i) => (typeof i === 'string' ? i : i?.url))
        .filter(Boolean)[0],
    }))
    .filter((r) => r.price);
  if (rows.length === 0) {
    console.warn(`- bỏ qua (không có giá) ${entry.path}`);
    return null;
  }
  const colors = [...new Set(rows.map((r) => r.color).filter(Boolean))];
  const sizes = [...new Set(rows.map((r) => r.size).filter(Boolean))].sort(
    (a, b) => sizeRank(a) - sizeRank(b),
  );
  const name = cleanName(group?.name ?? single?.name ?? '', colors);
  let key = slugify(name.replace(/^(Điện thoại|Máy tính bảng|Laptop|Tai nghe|Loa)\s+/i, '')).slice(
    0,
    48,
  );
  while (usedKeys.has(key)) key += '-2';
  usedKeys.add(key);

  // Nhóm lựa chọn: màu trước (ảnh đổi theo màu), dung lượng/kích cỡ sau
  const dims = [];
  if (colors.length > 1) dims.push('color');
  if (sizes.length > 1) dims.push('size');
  const sizeLabel = sizes.some((s) => /MM$/.test(s)) ? 'Kích cỡ' : 'Dung lượng';
  const optionName = (d) => (d === 'color' ? 'Màu sắc' : sizeLabel);
  const list = listPrices(html);
  // Mức giảm của biến thể đang hiển thị: dùng cho biến thể không có trong bảng giá (khuyến mãi thường là
  // số tiền cố định)
  const shown = shownPrices(html);
  const discount = shown ? shown.old - shown.sale : 0;

  const seen = new Set();
  const variants = [];
  for (const r of rows) {
    const o1 = dims[0] ? (dims[0] === 'color' ? r.color : r.size) : '';
    const o2 = dims[1] ? r.size : '';
    const id = `${o1}|${o2}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const fromTable = list.get(r.size) ?? (sizes.length <= 1 ? [...list.values()][0] : undefined);
    const listPrice =
      fromTable && fromTable > r.price ? fromTable : discount > 0 ? r.price + discount : null;
    variants.push({
      option1Value: o1,
      option2Value: o2,
      price: r.price,
      originalPrice: listPrice && listPrice > r.price ? listPrice : null,
      stock: stockFor(`${key}|${id}`),
    });
  }
  // Xếp biến thể: theo thứ tự màu rồi dung lượng
  variants.sort(
    (a, b) =>
      (dims[0] === 'color' ? colors.indexOf(a.option1Value) - colors.indexOf(b.option1Value) : 0) ||
      sizeRank(dims[0] === 'size' ? a.option1Value : a.option2Value) -
        sizeRank(dims[0] === 'size' ? b.option1Value : b.option2Value),
  );

  // Ảnh: mỗi màu một ảnh (gắn với màu khi lựa chọn 1 là màu); không có màu thì tối đa 3 ảnh chung
  const images = [];
  const byColor = dims[0] === 'color';
  const picks = byColor
    ? colors.map((c) => ({ color: c, url: rows.find((r) => r.color === c && r.image)?.image }))
    : [...new Set(rows.map((r) => r.image).filter(Boolean))]
        .slice(0, 3)
        .map((u) => ({ color: null, url: u }));
  for (const [i, p] of picks.entries()) {
    if (!p.url) continue;
    const file = `${key}-${i + 1}.webp`;
    if (existsSync(join(IMAGES, file))) {
      images.push({ file, option1Value: byColor ? p.color : null });
      continue;
    }
    try {
      await saveImage(p.url, file);
      images.push({ file, option1Value: byColor ? p.color : null });
    } catch (e) {
      console.warn(`  ảnh lỗi ${p.url}: ${e.message}`);
    }
    await sleep(IMAGE_DELAY);
  }
  if (images.length === 0) {
    console.warn(`- bỏ qua (không tải được ảnh) ${entry.path}`);
    return null;
  }

  const ratings = group?.aggregateRating?.ratingCount ?? 0;
  const product = {
    key,
    shop: entry.shop,
    category: entry.category,
    name,
    description: describe(name, props),
    weight: weightOf(props, entry.category),
    soldCount: Math.min(1500, Math.round(ratings / 25)) + (hash(key) % 60),
    option1Name: dims[0] ? optionName(dims[0]) : null,
    option2Name: dims[1] ? optionName(dims[1]) : null,
    variants,
    images,
    source: url,
  };
  console.log(
    `+ ${name}: ${variants.length} biến thể, ${images.length} ảnh, ${variants[0].price.toLocaleString('vi-VN')}đ`,
  );
  return product;
}

async function main() {
  mkdirSync(IMAGES, { recursive: true });
  const old = JSON.parse(readFileSync(join(SEED, 'demo-products.json'), 'utf8')).products;
  const kept = old.filter((p) => KEEP_CATEGORIES.has(p.category));
  const usedKeys = new Set(kept.map((p) => p.key));
  const crawled = [];
  let lastFetched = false;
  for (const [i, entry] of LIST.entries()) {
    // Chỉ nghỉ giữa các lần tải thật (trang lấy từ bộ nhớ tạm thì không cần)
    if (lastFetched) await sleep(PAGE_DELAY);
    console.log(`[${i + 1}/${LIST.length}] ${entry.path}`);
    const p = await crawlOne(entry, usedKeys);
    lastFetched = entry.cached === false;
    if (p) crawled.push(p);
  }
  const products = [...crawled, ...kept];
  writeFileSync(join(SEED, 'demo-products.json'), `${JSON.stringify({ products }, null, 2)}\n`);

  // Xóa ảnh cũ không còn dùng (giữ logo shop)
  const used = new Set(products.flatMap((p) => p.images.map((img) => img.file)));
  let removed = 0;
  for (const f of readdirSync(IMAGES)) {
    if (!used.has(f) && !/^shop-[ab]-logo\.webp$/.test(f) && existsSync(join(IMAGES, f))) {
      rmSync(join(IMAGES, f));
      removed++;
    }
  }
  console.log(
    `Xong: ${crawled.length}/${LIST.length} sản phẩm thu thập, giữ ${kept.length} sản phẩm ngoài nhóm công nghệ, xóa ${removed} ảnh cũ.`,
  );
}

await main();
