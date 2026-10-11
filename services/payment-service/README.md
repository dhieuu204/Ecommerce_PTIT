# payment-service [P]

Giao dịch VNPay, phân bổ tiền, hoàn tiền, sổ tiền seller, phí sàn, đối soát, khóa tiền rút, chi trả.

- Cổng chạy local: `3003`
- Database riêng: `payment_db` (không service nào khác được đọc/ghi)
- Kiểm tra sống: `GET http://localhost:3003/health`
- API P3: `docs/api/README.md` mục 4, P4: mục 5; sự kiện: `docs/api/events.md` mục 4 và 5

```bash
cp .env.example .env
pnpm --filter @san/payment-service dev
```

## Cổng thanh toán: MÔ PHỎNG hay VNPay sandbox

| `.env`                                           | Chạy gì                                                                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VNPAY_TMN_CODE` và `VNPAY_HASH_SECRET` để trống | **Cổng MÔ PHỎNG.** Bấm "Thanh toán" mở trang `/thanh-toan/mo-phong` của web, chọn Thành công / Thất bại / Trả tiền nhưng mất tin báo. Không có tiền thật; giao diện và log ghi "MÔ PHỎNG". |
| Có cả hai                                        | **VNPay sandbox.** Buyer sang trang VNPay, trả bằng thẻ test của VNPay.                                                                                                                    |

Khóa VNPay là bí mật: chỉ ghi trong `services/payment-service/.env` (không commit, không gửi qua chat). Đổi qua lại không sửa code, chỉ khởi động lại service.

Cổng mô phỏng còn có `MOCK_REFUND_RESULT` (`SUCCEEDED`, `FAILED`, `UNKNOWN`) để thử luồng hoàn tiền lỗi → thử lại 3 lần → admin tài chính hoàn tay.

## Nhận IPN của VNPay khi chạy trên máy (cloudflared)

VNPay báo kết quả (IPN) bằng cách gọi vào địa chỉ công khai trên Internet, nên `localhost` không nhận được. Dùng đường hầm cloudflared (miễn phí, không cần tài khoản):

1. Cài cloudflared: <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/> (Windows: `winget install Cloudflare.cloudflared`).
2. Chạy sàn (`pnpm dev`), rồi mở đường hầm tới payment-service:

   ```bash
   cloudflared tunnel --url http://localhost:3003
   ```

   Lệnh in ra địa chỉ dạng `https://abc-xyz.trycloudflare.com` (mỗi lần chạy một địa chỉ mới).

3. Vào trang quản lý merchant sandbox của VNPay, đặt **IPN URL** = `https://abc-xyz.trycloudflare.com/api/payment/v1/webhooks/vnpay/ipn`.
4. Thanh toán thử. Log payment-service ghi `IPN ...`; bảng `payments` chuyển `SUCCEEDED`.

Không chạy tunnel vẫn dùng được: khi buyer quay về trang `/thanh-toan/ket-qua`, payment-service kiểm chữ ký rồi **tra cứu VNPay** (API `querydr`) trước khi ghi "đã trả"; job mỗi phút tra cứu các lần chưa rõ kết quả và các đơn đã quá hạn.

## Quy tắc chính

- Mỗi đơn tối đa `max_payment_attempts` lần (mặc định 3), mỗi lần một mã `vnp_TxnRef` riêng. Còn lần đang chờ thì bấm lại mở đúng link cũ; lần trước "không rõ" thì không tạo lần mới.
- Chỉ ghi "đã trả" khi IPN hợp lệ (đúng chữ ký, đúng số tiền) hoặc tra cứu VNPay báo thành công.
- Tiền về khi đơn đã hết hạn/hủy, hoặc trả trùng → tự tạo khoản hoàn (`LATE_PAYMENT`, `DUPLICATE_PAYMENT`).
- Hủy đơn con đã trả → khoản hoàn đúng số buyer trả cho đơn con đó. Job gửi lệnh hoàn; lỗi thì thử lại sau 5, 15 phút...; đủ `refund_max_tries` lần vẫn lỗi thì chờ admin `FINANCE` hoàn tay (nhập mã giao dịch + ảnh biên lai). Không rõ kết quả thì tra cứu, không gửi lại.
- Phí sàn (`platform_fee_percent_x100`, mặc định 500 = 5%) tính trên tiền hàng sau voucher shop, làm tròn xuống, chụp vào `seller_earnings` khi nhận đơn.
- Tra cứu hoàn tiền của VNPay sandbox dựa trên giao dịch gốc (`querydr`), nên với đơn có nhiều khoản hoàn một phần, kết quả tra cứu chỉ biết "giao dịch đã có hoàn"; trường hợp đó admin kiểm lại trên trang merchant VNPay.

## Ví seller và đối soát (P4)

- **Ví 3 ngăn** (`seller_wallets`): đang giữ (`pending`), khả dụng (`available`), đang khóa (`locked`, dùng ở P5). Mọi biến động ghi một dòng `wallet_transactions` (mỗi đơn con mỗi loại tối đa một dòng, nên sự kiện lặp không ghi tiền hai lần); database có ràng buộc số dư không âm.
- Tiền seller vào **đang giữ** khi đơn trả trước đã thu, hoặc đơn COD đã giao. Sang **khả dụng** khi đơn con hoàn tất **và** tiền đã về sàn (COD: đối soát khớp). Hủy/giao thất bại thì trừ lại; sự cố GHN thì đền vào khả dụng.
- **Đối soát COD**: admin `FINANCE` tải file `.xlsx`/`.csv` của GHN ở trang "Đối soát COD". Hệ thống nhận cột theo tiêu đề (danh sách tên cột ở `src/reconciliation/cod-file.ts`, thêm tên khi có file mẫu thật). Mỗi file nhập một lần. Chưa có file thật thì bấm **"Tải file MÔ PHỎNG"** (gồm các đơn COD đã giao chưa đối soát) rồi tải lên lại.
- **Đối soát VNPay**: job `vnpay-reconcile` chạy 2 giờ sáng (giờ Việt Nam), tra cứu lại giao dịch thành công 2 ngày gần nhất; khoản lệch, chưa rõ, tiền về muộn/trùng hiện ở trang "Đối soát VNPay" để admin ghi chú xử lý. Có nút chạy ngay.
