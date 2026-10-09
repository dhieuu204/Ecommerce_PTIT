/**
 * Danh sách tỉnh/huyện/xã MẪU dùng khi chưa có token GHN (mô phỏng, chỉ để chạy thử trên máy).
 * Mã ở đây KHÔNG phải mã GHN thật (đánh từ 90001 để không trùng); có GHN_TOKEN thì lần đồng bộ
 * tiếp theo thay toàn bộ bằng dữ liệu GHN.
 */
export const SAMPLE_LOCATIONS = [
  {
    id: 90001,
    name: 'Hà Nội',
    districts: [
      {
        id: 90101,
        name: 'Quận Ba Đình',
        wards: ['Phường Điện Biên', 'Phường Kim Mã', 'Phường Ngọc Hà'],
      },
      {
        id: 90102,
        name: 'Quận Cầu Giấy',
        wards: ['Phường Dịch Vọng', 'Phường Mai Dịch', 'Phường Nghĩa Đô'],
      },
    ],
  },
  {
    id: 90002,
    name: 'Hồ Chí Minh',
    districts: [
      {
        id: 90201,
        name: 'Quận 1',
        wards: ['Phường Bến Nghé', 'Phường Bến Thành', 'Phường Đa Kao'],
      },
      { id: 90202, name: 'Quận Bình Thạnh', wards: ['Phường 1', 'Phường 2', 'Phường 3'] },
    ],
  },
  {
    id: 90003,
    name: 'Đà Nẵng',
    districts: [
      {
        id: 90301,
        name: 'Quận Hải Châu',
        wards: ['Phường Hải Châu I', 'Phường Thạch Thang', 'Phường Bình Hiên'],
      },
      {
        id: 90302,
        name: 'Quận Sơn Trà',
        wards: ['Phường An Hải Bắc', 'Phường Mân Thái', 'Phường Phước Mỹ'],
      },
    ],
  },
];
