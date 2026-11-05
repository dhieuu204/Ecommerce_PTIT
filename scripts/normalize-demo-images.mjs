#!/usr/bin/env node
/**
 * Chuẩn hóa ảnh sản phẩm demo để các thẻ sản phẩm đặt cạnh nhau trông đều: tìm khung vật thể (so từng điểm
 * ảnh với màu nền lấy ở 4 góc, nên nhận được cả đồ trắng trên nền trắng), cắt sát, phóng để cạnh dài của
 * vật thể chiếm FILL khung vuông SIZE, rồi đặt vào giữa trên nền cũ. Chạy lại nhiều lần cho cùng kết quả.
 *
 * SIZE 1200 để ảnh lớn ở trang chi tiết vẫn nét trên màn hình độ phân giải cao. Ảnh mới nên xuất sẵn ở 1200
 * từ ảnh gốc lớn (cắt sát và thu MỘT lần); script này chỉ sửa ảnh lệch cỡ, mỗi lần sửa là một lần lấy mẫu
 * lại nên đừng chạy cho ảnh nhỏ hơn 1200 (ảnh sẽ bị phóng, không nét hơn). Logo shop không bị đụng tới.
 *
 * Mặc định chuẩn hóa services/marketplace-service/seed/images và apps/web/public/home (không đụng
 * public/home/cut, ảnh đã cắt riêng cho banner). Cần ffmpeg.
 *
 *   node scripts/normalize-demo-images.mjs              # chuẩn hóa
 *   node scripts/normalize-demo-images.mjs --dry-run    # chỉ in tỉ lệ trước/sau
 *
 * Sau khi chuẩn hóa, dữ liệu đang chạy cần tải lại ảnh lên MinIO:
 *   pnpm --filter @san/marketplace-service seed:refresh-images
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = [
  join(ROOT, 'services', 'marketplace-service', 'seed', 'images'),
  join(ROOT, 'apps', 'web', 'public', 'home'),
];
const SIZE = 1200;
/** Cạnh dài của vật thể chiếm bao nhiêu phần khung */
const FILL = 0.8;
/** Không phóng quá mức này để ảnh nhỏ khỏi vỡ */
const MAX_UPSCALE = 2;
/** Điểm ảnh khác màu nền hơn ngưỡng này (0–255, theo kênh lệch nhiều nhất) thì tính là vật thể */
const THRESHOLD = 12;
/** Một hàng/cột phải có ít nhất chừng này điểm vật thể mới tính, để bỏ qua nhiễu */
const MIN_PIXELS = 3;
const DRY_RUN = process.argv.includes('--dry-run');

/** Đọc ảnh thành mảng RGB, kéo về SIZE×SIZE nếu khác cỡ */
function readRgb(file) {
  const buf = execFileSync(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      '-i',
      file,
      '-vf',
      `scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease,pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2:color=white`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgb24',
      '-',
    ],
    { maxBuffer: SIZE * SIZE * 3 + 1024 },
  );
  return buf;
}

/** Màu nền: trung bình 4 ô 8×8 ở 4 góc */
function background(rgb) {
  const sum = [0, 0, 0];
  let n = 0;
  for (const [cx, cy] of [
    [0, 0],
    [SIZE - 8, 0],
    [0, SIZE - 8],
    [SIZE - 8, SIZE - 8],
  ]) {
    for (let y = cy; y < cy + 8; y++) {
      for (let x = cx; x < cx + 8; x++) {
        const i = (y * SIZE + x) * 3;
        sum[0] += rgb[i];
        sum[1] += rgb[i + 1];
        sum[2] += rgb[i + 2];
        n++;
      }
    }
  }
  return sum.map((v) => Math.round(v / n));
}

/** Khung vật thể {x, y, w, h}; null khi ảnh trống */
function subjectBox(rgb, bg) {
  const rows = new Uint32Array(SIZE);
  const cols = new Uint32Array(SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 3;
      const d = Math.max(
        Math.abs(rgb[i] - bg[0]),
        Math.abs(rgb[i + 1] - bg[1]),
        Math.abs(rgb[i + 2] - bg[2]),
      );
      if (d > THRESHOLD) {
        rows[y]++;
        cols[x]++;
      }
    }
  }
  const first = (a) => a.findIndex((c) => c >= MIN_PIXELS);
  const last = (a) => SIZE - 1 - [...a].reverse().findIndex((c) => c >= MIN_PIXELS);
  const y0 = first(rows);
  const x0 = first(cols);
  if (y0 < 0 || x0 < 0) return null;
  const y1 = last(rows);
  const x1 = last(cols);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const hex = (c) => c.map((v) => v.toString(16).padStart(2, '0')).join('');

let changed = 0;
for (const dir of DIRS) {
  for (const name of readdirSync(dir).filter(
    (f) => f.endsWith('.webp') && !/^shop-.*-logo\.webp$/.test(f),
  )) {
    const file = join(dir, name);
    const rgb = readRgb(file);
    const bg = background(rgb);
    const box = subjectBox(rgb, bg);
    if (!box) {
      console.log(`  bỏ qua (không thấy vật thể): ${name}`);
      continue;
    }
    const before = Math.max(box.w, box.h) / SIZE;
    const scale = Math.min((FILL * SIZE) / Math.max(box.w, box.h), MAX_UPSCALE);
    const w = Math.max(1, Math.round(box.w * scale));
    const h = Math.max(1, Math.round(box.h * scale));
    const after = Math.max(w, h) / SIZE;
    // Đã đúng cỡ và nằm giữa thì thôi (chạy lại không làm ảnh mờ thêm)
    const centred =
      Math.abs(box.x + box.w / 2 - SIZE / 2) < SIZE * 0.008 &&
      Math.abs(box.y + box.h / 2 - SIZE / 2) < SIZE * 0.008;
    if (Math.abs(after - before) < 0.02 && centred) continue;
    console.log(`  ${name}: ${before.toFixed(2)} → ${after.toFixed(2)}`);
    changed++;
    if (DRY_RUN) continue;
    // Cắt từ ảnh RGB đã đọc (đầu vào là luồng raw) rồi phóng, đặt giữa nền cũ
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        '-s',
        `${SIZE}x${SIZE}`,
        '-i',
        '-',
        '-vf',
        `crop=${box.w}:${box.h}:${box.x}:${box.y},scale=${w}:${h}:flags=lanczos,pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2:color=0x${hex(bg)}`,
        '-c:v',
        'libwebp',
        '-quality',
        '90',
        file,
      ],
      { input: rgb },
    );
  }
}
console.log(DRY_RUN ? `${changed} ảnh sẽ đổi.` : `Đã chuẩn hóa ${changed} ảnh.`);
