/**
 * Dữ liệu DEMO (lệnh `pnpm seed:demo`): 2 seller có shop đã duyệt và 1 buyer, mật khẩu chung.
 * Mỗi service tự nạp phần của mình vào database của mình, dùng chung các mã cố định dưới đây.
 * Chỉ để chạy thử và trình diễn, không dùng cho môi trường thật.
 */
export const DEMO_PASSWORD = 'demo12345';

export const DEMO_USERS = {
  sellerA: {
    id: '00000000-0000-4000-8000-0000000000a1',
    email: 'taoxanh@example.com',
    fullName: 'Trần Minh Khoa',
    phone: '0901000001',
  },
  sellerB: {
    id: '00000000-0000-4000-8000-0000000000b1',
    email: 'galaxyhub@example.com',
    fullName: 'Lê Thu Hà',
    phone: '0901000002',
  },
  buyer: {
    id: '00000000-0000-4000-8000-0000000000c1',
    email: 'buyer@example.com',
    fullName: 'Nguyễn Văn An',
    phone: '0901000003',
  },
} as const;

/** Hai shop demo; tên, mô tả, logo, sản phẩm nằm trong services/marketplace-service/seed */
export const DEMO_SHOPS = {
  A: {
    id: '00000000-0000-4000-8000-0000000000a2',
    owner: DEMO_USERS.sellerA,
    name: 'Táo Xanh Mobile',
    description:
      'Chuyên iPhone, iPad, MacBook và phụ kiện chính hãng. Giao nhanh 2 giờ nội thành Hà Nội.',
    city: 'Hà Nội',
    street: '25 Kim Mã',
    bankAccount: {
      bankName: 'Vietcombank',
      accountNumber: '0011004455667',
      accountName: 'TRAN MINH KHOA',
    },
  },
  B: {
    id: '00000000-0000-4000-8000-0000000000b2',
    owner: DEMO_USERS.sellerB,
    name: 'Galaxy Hub',
    description: 'Điện thoại Android, âm thanh và đồ dùng hằng ngày. Đổi trả trong 7 ngày.',
    city: 'Hồ Chí Minh',
    street: '120 Lê Lợi',
    bankAccount: {
      bankName: 'Techcombank',
      accountNumber: '19035566778899',
      accountName: 'LE THU HA',
    },
  },
} as const;
