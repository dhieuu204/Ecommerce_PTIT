/**
 * Tải lại ảnh sản phẩm và logo shop demo lên MinIO sau khi ảnh trong seed/images đổi (ví dụ chạy
 * scripts/normalize-demo-images.mjs), mà không phải xóa database rồi nạp lại.
 *
 * Ảnh demo được `seed-demo` đưa lên với tên `<thư mục shop>/demo-<tên file>`; script này đọc các ảnh sản
 * phẩm đang có trong database, ảnh nào có tên dạng đó và file còn trong seed/images thì ghi đè đúng chỗ cũ
 * (đường dẫn ảnh không đổi). Ảnh do seller tự tải lên không bị đụng tới.
 *
 *   pnpm --filter @san/marketplace-service seed:refresh-images
 */
import '../env';
import { DEMO_SHOPS } from '@san/shared';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppConfig } from '../config';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../uploads/storage.service';
import { shopLogoPrefix } from '../uploads/uploads.controller';

const SEED_IMAGES = join(__dirname, '..', '..', 'seed', 'images');

async function main() {
  const prisma = new PrismaService();
  const config = new AppConfig();
  const storage = new StorageService(config);
  const marker = `/${config.publicBucket}/`;

  try {
    const images = await prisma.productImage.findMany({ select: { url: true } });
    const keys = new Set<string>();
    for (const { url } of images) {
      const at = url.indexOf(marker);
      if (at < 0) continue;
      const key = url.slice(at + marker.length);
      if (/\/demo-[^/]+\.webp$/.test(key)) keys.add(key);
    }

    let done = 0;
    let missing = 0;
    for (const key of keys) {
      const file = key.slice(key.lastIndexOf('/demo-') + '/demo-'.length);
      const path = join(SEED_IMAGES, file);
      if (!existsSync(path)) {
        missing++;
        continue;
      }
      await storage.putPublic(key, readFileSync(path), 'image/webp');
      done++;
    }
    console.log(
      `Đã tải lại ${done} ảnh demo lên MinIO` +
        (missing ? ` (${missing} ảnh không còn file trong seed/images, giữ nguyên).` : '.'),
    );

    // Logo shop demo (`<thư mục logo>/demo-logo.webp` ← seed/images/shop-<mã>-logo.webp); shop đã tự đổi
    // logo khác thì giữ nguyên
    let logos = 0;
    for (const [code, demo] of Object.entries(DEMO_SHOPS)) {
      const key = `${shopLogoPrefix(demo.owner.id)}demo-logo.webp`;
      const shop = await prisma.shop.findUnique({
        where: { id: demo.id },
        select: { logoUrl: true },
      });
      const path = join(SEED_IMAGES, `shop-${code.toLowerCase()}-logo.webp`);
      if (!shop?.logoUrl?.endsWith(key) || !existsSync(path)) continue;
      await storage.putPublic(key, readFileSync(path), 'image/webp');
      logos++;
    }
    console.log(`Đã tải lại ${logos} logo shop demo.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
