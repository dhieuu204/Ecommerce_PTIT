/**
 * Đổi tên màu sản phẩm (tiếng Việt, do shop đặt) sang mã màu để vẽ chấm màu trên thẻ và khối tiêu điểm.
 * Đây là màu của **hàng hóa**, không phải bảng màu giao diện (bảng màu giao diện ở index.css). Tên lạ
 * không đoán được thì trả null và web hiện chữ như cũ.
 */

/** Từ khóa → mã màu, xét theo thứ tự: cụm dài, cụ thể đứng trước */
const RULES: Array<[RegExp, string]> = [
  [/cam vũ trụ/, '#d9672c'],
  [/đỏ burgundy|burgundy/, '#6e2a35'],
  [/xanh băng/, '#cfe0e8'],
  [/xanh cobalt/, '#2747c4'],
  [/xám graphite|graphite/, '#4a4c50'],
  [/titan vàng/, '#cdb89a'],
  [/titan xám|titan/, '#8a8782'],
  [/đen không gian/, '#2e2f33'],
  [/xanh lam khói/, '#7d8fa3'],
  [/xanh lá xô thơm/, '#a9b7a0'],
  [/xanh lưu ly/, '#3d5a98'],
  [/xanh navy|xanh đen/, '#1f2a44'],
  [/xanh rêu/, '#5a6b4c'],
  [/xanh mòng két/, '#2f7f86'],
  [/xanh da trời nhạt|xanh dương nhạt|xanh nhạt/, '#b9d3ea'],
  [/xanh da trời/, '#8fb8de'],
  [/xanh đậm/, '#2b3f5c'],
  [/xanh dương/, '#3b6fb6'],
  [/xanh lá/, '#6fa37b'],
  [/tím oải hương/, '#c4b5e0'],
  [/tím/, '#9a86c8'],
  [/vàng hồng/, '#e8c3b0'],
  [/vàng nhạt/, '#f1e2b0'],
  [/vàng/, '#e8cf8a'],
  [/hồng nhạt/, '#f3d3db'],
  [/hồng/, '#eaa7b8'],
  [/đỏ/, '#c8323b'],
  [/cam/, '#ef7d3c'],
  [/trắng starlight/, '#efe9df'],
  [/trắng kem|kem|^be$/, '#ece2cf'],
  [/trắng/, '#f4f4f2'],
  [/bạc/, '#d9dadc'],
  [/xám/, '#8e8e93'],
  [/đen/, '#25262a'],
];

/** "Cam Vũ Trụ" → "#d9672c"; tên ghép "Đen - Xám" lấy màu đầu; không đoán được → null */
export function swatchColor(name: string): string | null {
  const key = name
    .toLowerCase()
    .split(/\s+-\s+/)[0]!
    .trim();
  for (const [re, color] of RULES) if (re.test(key)) return color;
  return null;
}

/** Nhóm 1 là màu sắc và mọi lựa chọn đều đổi được sang mã màu thì vẽ chấm màu */
export function isColorOption(optionName: string | null, values: string[]): boolean {
  return (
    !!optionName &&
    /màu/i.test(optionName) &&
    values.length > 0 &&
    values.every((v) => !!swatchColor(v))
  );
}
