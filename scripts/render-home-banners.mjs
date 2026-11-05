#!/usr/bin/env node
/**
 * Dựng ảnh banner trang chủ (ảnh tạm của HK Shop, tự thiết kế từ ảnh sản phẩm demo): mỗi banner là một
 * trang HTML (chữ Plus Jakarta Sans, bảng màu của sàn, ảnh trong apps/web/public/home/cut), chụp bằng
 * Chrome chạy ngầm rồi chuyển sang webp. Kết quả ở apps/web/public/home/banners.
 *
 *   node scripts/render-home-banners.mjs
 *
 * Cần Chrome (đường dẫn mặc định của Windows, hoặc biến CHROME) và ffmpeg. Muốn đổi ảnh banner thật (tự thiết
 * kế hay tạo bằng GPT Image) thì chỉ cần thay file webp cùng tên, không phải sửa code.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOME = join(ROOT, 'apps', 'web', 'public', 'home');
const SEED = join(ROOT, 'services', 'marketplace-service', 'seed', 'images');
const OUT = join(ROOT, 'apps', 'web', 'public', 'home', 'banners');
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
/** 'cut/x' = ảnh đã cắt sát trong public/home/cut; 'home/x' = public/home; 'seed/x' = ảnh sản phẩm demo đã chuẩn hóa */
const img = (name) => {
  const [where, file] = name.includes('/') ? name.split('/') : ['cut', name];
  const dir = where === 'seed' ? SEED : where === 'home' ? HOME : join(HOME, 'cut');
  return pathToFileURL(join(dir, `${file}.webp`)).href;
};

const ORANGE = '#EE4D2D';
const HEAD = `<meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
html,body{width:100%;height:100%;overflow:hidden;font-family:'Plus Jakarta Sans',sans-serif;-webkit-font-smoothing:antialiased}
.b{position:relative;width:100%;height:100%;overflow:hidden}
.panel{position:absolute;inset:0 auto 0 0;display:flex;flex-direction:column;justify-content:center;color:#fff}
.k{font-size:var(--k);font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.9}
.t{font-size:var(--t);font-weight:800;line-height:1.05;letter-spacing:-.02em;margin-top:.35em}
.s{font-size:var(--s);font-weight:500;line-height:1.4;margin-top:.8em;opacity:.92}
.cta{display:inline-flex;align-items:center;gap:.5em;margin-top:1.2em;font-size:var(--s);font-weight:700;padding:.75em 1.4em;border-radius:.6em;width:fit-content}
.prod{position:absolute;object-fit:contain;mix-blend-mode:multiply}
.shadow{position:absolute;border-radius:50%;background:rgba(31,41,55,.18);filter:blur(18px)}
</style>`;

/** Banner lớn (khung 2.12:1): mảng màu chéo bên trái chứa chữ, nền sáng bên phải chứa ảnh sản phẩm */
function hero({ color, ink = '#fff', kicker, title, sub, cta, ctaBg, ctaInk, bg, products }) {
  return `<!doctype html><html><head>${HEAD}<style>:root{--k:22px;--t:76px;--s:26px}</style></head><body>
<div class="b" style="background:${bg}">
  <div class="shadow" style="right:12%;bottom:6%;width:46%;height:7%"></div>
  ${products.map((p) => `<img class="prod" src="${img(p.name)}" style="${p.style}">`).join('')}
  <div class="panel" style="width:50%;padding-left:96px;padding-right:150px;background:${color};color:${ink};clip-path:polygon(0 0,100% 0,84% 100%,0 100%)">
    <div class="k">${kicker}</div>
    <div class="t">${title}</div>
    <div class="s">${sub}</div>
    <div class="cta" style="background:${ctaBg};color:${ctaInk}">${cta} →</div>
  </div>
</div></body></html>`;
}

/** Banner nhỏ (khung 2.18:1): nền sáng, chữ đậm bên trái, ảnh sản phẩm bên phải */
function side({ bg, title, sub, link, products }) {
  return `<!doctype html><html><head>${HEAD}<style>:root{--k:18px;--t:46px;--s:22px}</style></head><body>
<div class="b" style="background:${bg}">
  ${products.map((p) => `<img class="prod" src="${img(p.name)}" style="${p.style}">`).join('')}
  <div class="panel" style="width:58%;padding-left:56px;color:#1f2937">
    <div class="t">${title}</div>
    <div class="s" style="color:#555">${sub}</div>
    <div style="margin-top:1em;font-size:22px;font-weight:700;color:${ORANGE}">${link} →</div>
  </div>
</div></body></html>`;
}

const BANNERS = [
  {
    file: 'hero-dien-thoai',
    size: [1680, 792],
    html: hero({
      color: ORANGE,
      kicker: 'Công nghệ cho mỗi ngày',
      title: 'iPhone, Galaxy<br>chính hãng',
      sub: 'Giá tốt mỗi ngày từ các shop đã được sàn kiểm duyệt.',
      cta: 'Mua ngay',
      ctaBg: '#fff',
      ctaInk: ORANGE,
      bg: 'linear-gradient(135deg,#f4f4f6,#e6e7ea)',
      products: [{ name: 'iphone-17-pro-max', style: 'right:8%;bottom:7%;height:86%' }],
    }),
  },
  {
    file: 'hero-laptop',
    size: [1680, 792],
    html: hero({
      color: '#1f2937',
      kicker: 'Laptop và máy tính bảng',
      title: 'Mỏng nhẹ,<br>mạnh mẽ.',
      sub: 'MacBook, iPad và laptop Windows, giao tận nơi qua GHN.',
      cta: 'Khám phá ngay',
      ctaBg: ORANGE,
      ctaInk: '#fff',
      bg: 'linear-gradient(135deg,#f2f4f7,#e3e7ee)',
      products: [
        { name: 'macbook-air-m5', style: 'right:13%;bottom:14%;width:41%' },
        { name: 'ipad-air-m4', style: 'right:3%;bottom:10%;height:58%' },
      ],
    }),
  },
  {
    file: 'hero-am-thanh',
    size: [1680, 792],
    html: hero({
      color: '#fe9c13',
      ink: '#1f2937',
      kicker: 'Âm thanh và đồng hồ',
      title: 'Nghe thật hay,<br>đeo thật chất.',
      sub: 'Tai nghe, đồng hồ thông minh từ các shop uy tín.',
      cta: 'Xem ngay',
      ctaBg: '#1f2937',
      ctaInk: '#fff',
      bg: 'linear-gradient(135deg,#f7f3ee,#ece6de)',
      products: [
        { name: 'airpods-max', style: 'right:26%;bottom:10%;height:74%;transform:rotate(-6deg)' },
        { name: 'apple-watch-s11', style: 'right:5%;bottom:12%;height:60%;transform:rotate(6deg)' },
      ],
    }),
  },
  {
    file: 'hero-phu-kien',
    size: [1680, 792],
    html: hero({
      color: '#ff6633',
      kicker: 'Sạc, cáp, ốp lưng',
      title: 'Phụ kiện<br>chính hãng',
      sub: 'Sạc nhanh, ốp lưng, pin dự phòng từ nhiều shop, chung một giỏ.',
      cta: 'Xem phụ kiện',
      ctaBg: '#fff',
      ctaInk: ORANGE,
      bg: 'linear-gradient(135deg,#f5f5f7,#e8e8ec)',
      products: [
        {
          name: 'home/op-lung-nomad',
          style: 'right:24%;bottom:6%;height:88%;transform:rotate(-8deg)',
        },
        {
          name: 'seed/sac-nhanh-apple-dynamic-40w-60w-mgtu4-1',
          style: 'right:2%;bottom:6%;height:70%;transform:rotate(6deg)',
        },
      ],
    }),
  },
  {
    file: 'side-cod',
    size: [820, 376],
    html: side({
      bg: 'linear-gradient(135deg,#fff1e4,#fde0c6)',
      title: 'Nhận hàng rồi<br>mới trả tiền',
      sub: 'Thanh toán khi nhận hàng (COD).',
      link: 'Mua sắm an tâm',
      products: [
        {
          name: 'home/galaxy-z-flip7',
          style: 'right:4%;top:8%;height:88%;transform:rotate(-6deg)',
        },
      ],
    }),
  },
  {
    file: 'side-nhieu-shop',
    size: [820, 376],
    html: side({
      bg: 'linear-gradient(135deg,#f1f1f4,#e3e4e8)',
      title: 'Một giỏ hàng,<br>nhiều shop',
      sub: 'Thanh toán một lần qua VNPay.',
      link: 'Xem hàng mới',
      products: [
        { name: 'jbl-flip-7', style: 'right:4%;top:30%;width:44%;transform:rotate(-8deg)' },
      ],
    }),
  },
];

mkdirSync(OUT, { recursive: true });
const tmp = join(tmpdir(), `hk-banners-${Date.now()}`);
mkdirSync(tmp, { recursive: true });
try {
  for (const b of BANNERS) {
    const html = join(tmp, `${b.file}.html`);
    const png = join(tmp, `${b.file}.png`);
    writeFileSync(html, b.html);
    execFileSync(CHROME, [
      '--headless=new',
      '--log-level=3',
      '--disable-gpu',
      '--hide-scrollbars',
      '--allow-file-access-from-files',
      `--window-size=${b.size[0]},${b.size[1]}`,
      '--virtual-time-budget=6000',
      `--screenshot=${png}`,
      pathToFileURL(html).href,
    ]);
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-i',
      png,
      '-c:v',
      'libwebp',
      '-quality',
      '86',
      join(OUT, `${b.file}.webp`),
    ]);
    console.log(`  ${b.file}.webp`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`Đã dựng ${BANNERS.length} banner vào apps/web/public/home/banners.`);
