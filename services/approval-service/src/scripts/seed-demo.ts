/**
 * Nạp hồ sơ mở shop ĐÃ DUYỆT cho 2 shop demo (để approval-service biết shop, ví dụ khi đình chỉ).
 * Chạy cùng các phần khác bằng `pnpm seed:demo` ở thư mục gốc. Chạy lại không tạo trùng.
 */
import '../env';
import { DEMO_SHOPS, type ShopApplicationData } from '@san/shared';
import { PrismaService } from '../prisma.service';

/** Mã tỉnh/huyện/xã của dữ liệu MẪU (chưa có token GHN); chỉ để admin xem hồ sơ */
const SAMPLE_PICKUP = {
  'Hà Nội': {
    provinceId: 90001,
    districtId: 90101,
    wardCode: '9010102',
    districtName: 'Quận Ba Đình',
    wardName: 'Phường Kim Mã',
  },
  'Hồ Chí Minh': {
    provinceId: 90002,
    districtId: 90201,
    wardCode: '9020101',
    districtName: 'Quận 1',
    wardName: 'Phường Bến Nghé',
  },
};

async function main() {
  const prisma = new PrismaService();
  try {
    for (const shop of Object.values(DEMO_SHOPS)) {
      const exists = await prisma.shopApproval.findFirst({ where: { shopId: shop.id } });
      if (exists) {
        console.log(`Đã có hồ sơ của ${shop.name}, bỏ qua.`);
        continue;
      }
      const p = SAMPLE_PICKUP[shop.city];
      const data: ShopApplicationData = {
        name: shop.name,
        description: shop.description,
        logoUrl: null,
        phone: shop.owner.phone,
        pickupAddress: { ...p, provinceName: shop.city, street: shop.street },
        bankAccount: { ...shop.bankAccount },
      };
      const now = new Date();
      await prisma.shopApproval.create({
        data: {
          shopId: shop.id,
          version: 1,
          type: 'REGISTER',
          status: 'APPROVED',
          ownerId: shop.owner.id,
          ownerName: shop.owner.fullName,
          ownerEmail: shop.owner.email,
          data: data as object,
          submittedAt: now,
          decidedByName: 'Dữ liệu demo',
          decidedAt: now,
        },
      });
      console.log(`Đã tạo hồ sơ đã duyệt của ${shop.name}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
