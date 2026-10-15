# Tổng kết P5: trả hàng, tranh chấp, rút tiền

Ngày 15/10/2026. Nhánh `feat/P5-hau-mai-va-rut-tien` (tạo từ `main` ở `501a4dd`).

## 1. Trạng thái

- **Code P5 đã xong**, kèm test và tài liệu. Toàn bộ thay đổi đang nằm trong thư mục làm việc, **chưa commit**: máy này chưa cấu hình tên/email cho git, và chưa có lệnh commit từ chủ đồ án.
- Kiểm tra tự động đều qua: `lint`, `typecheck`, `build`, **431 test** (nest-common 28, user 59, approval 50, payment 76, marketplace 218), sau lượt rà soát ở mục 10.
- Đã chạy thử thật cả 4 service, sự kiện đi qua RabbitMQ: **5 luồng P5 đều đạt** (mục 5).

## 2. Chức năng đã làm

| Mã | Nội dung | Service |
| --- | --- | --- |
| RET-01 | Người mua yêu cầu trả hàng cho đơn con đã giao (chọn món, lý do, mô tả, 1–6 ảnh bằng chứng) | M |
| RET-02 | Shop chấp nhận, từ chối có lý do, hoặc "hoàn tiền ngay, không cần gửi trả"; quá hạn 48 giờ thì tự chấp nhận | M |
| RET-03 | Vận đơn trả GHN do sàn tạo và chịu phí (MÔ PHỎNG khi chưa có `GHN_TOKEN`); shop kiểm hàng và chọn dòng nhập lại kho | M |
| RET-04 | Kết thúc yêu cầu thì đơn con hoàn tất ngay; tiền, số lượng trả, tồn kho, trạng thái khớp nhau | M, P |
| DIS-01 | Người mua khiếu nại khi shop từ chối, shop khiếu nại khi hàng trả về không đúng; admin Hỗ trợ phân xử (chấp nhận trả / hoàn toàn bộ / hoàn một phần / không hoàn) | A, M |
| DIS-02 | Điều chỉnh ví sau giải ngân: admin Tài chính lập, một admin Tài chính khác duyệt; payment chỉ thực thi khi đủ số dư | A, P |
| REF-02 | Hoàn một phần: tiền hoàn = tiền hàng phần trả sau voucher; seller bị trừ theo tỉ lệ, phí sàn tính lại | P |
| FIN-02 | Có yêu cầu trả hàng mở thì tiền seller của đơn con bị giữ | P |
| FIN-04..06 | Rút tiền (tối thiểu 50.000đ, mỗi shop một yêu cầu đang xử lý), duyệt ở approval, chi trả có mã giao dịch và ảnh biên lai; chuyển lỗi thì mở khóa tiền | P, A |
| Đơn COD | Hoàn bằng chuyển khoản tay: người mua nhập tài khoản, admin Tài chính nhập mã giao dịch và biên lai | M, P |

Quy tắc đầy đủ (10 quyết định của chủ đồ án và các điểm Claude tự chọn): `docs/phan-tich/12-quyet-dinh-p5.md`.

## 3. Thay đổi theo phần

- **Tài liệu**: `docs/phan-tich/12-quyet-dinh-p5.md` (mới, có bảng trạng thái STATE-03); `docs/api/README.md` mục 6 (API P5, Swagger chuyển sang mục 7); `docs/api/events.md` mục 6 (9 sự kiện mới); `docs/erd/README.md` (cột bảng P5); sơ đồ trạng thái mới `docs/so-do/16-state03-tra-hang-tranh-chap.png` (mã nguồn PlantUML trong `docs/so-do/plantuml`); cập nhật `CLAUDE.md` (trạng thái P5, phase tiếp theo P6) và `README.md` (cách thử P5).
- **packages/shared**: kiểu sự kiện mới `events/return.ts`, `events/finance.ts`.
- **marketplace-service**: module `src/returns` (yêu cầu trả hàng, job hết hạn, nhận quyết định tranh chấp); vận đơn trả dùng chung `ShipmentsService`; ảnh bằng chứng trong bucket MinIO **riêng tư**, chỉ xem qua API có kiểm quyền; bảng `returns`, `return_items`, cột `order_items.returned_quantity`.
- **payment-service**: giữ/trừ tiền khi trả hàng, hoàn một phần, hoàn chuyển khoản tay; module `src/withdrawals` (rút tiền, chi trả), `src/adjustments` (thực thi DIS-02); bảng `withdrawals`, thêm cột cho `refunds`, `seller_earnings`, `wallet_transactions`.
- **approval-service**: module `src/disputes` (tranh chấp và điều chỉnh ví), `src/withdrawal-approvals` (duyệt rút); bảng `disputes`, `withdrawal_approvals`.
- **web**: trang mới cho người mua (yêu cầu trả hàng, danh sách và chi tiết), seller (Trả hàng, Rút tiền trong Ví), admin (Trả hàng, Tranh chấp, Rút tiền, Điều chỉnh ví); sửa trang Hoàn tiền, GHN mô phỏng, Cấu hình.
- **Test**: `services/*/package.json` đặt `testTimeout` 30 giây. Lý do: một lần `pnpm test` chạy song song 4 service bị quá ngưỡng 5 giây mặc định (chạy riêng thì qua), và CI cũng chạy song song như vậy.

Không thêm thư viện mới.

## 4. Database và cấu hình

- 3 migration mới: `20261014230921_p5_returns` (M), `20261014232730_p5_returns_withdrawals` (P), `20261014233839_p5_disputes_withdrawals` (A). Đã rà lại: chỉ tạo bảng mới, thêm cột có giá trị mặc định và ràng buộc mà dữ liệu cũ đều thỏa, nên áp lên database đã có dữ liệu P3/P4 vẫn an toàn.
- Cấu hình mới trong bảng `settings` (admin sửa ở Quản trị › Cấu hình chính sách): `return_response_hours` 48, `return_ship_days` 3, `return_inspect_hours` 48, `return_dispute_hours` 48 (M); `dispute_sla_hours` 72 (A); `withdraw_min_amount` 50.000 (P).
- `.env` mới (đều có giá trị mặc định trong code): marketplace `MINIO_PRIVATE_BUCKET`, `RETURN_IMAGE_MAX_MB`, `RETURN_MAX_IMAGES`; payment `MARKETPLACE_API_URL` (đã thêm vào `infra/docker-compose.yml` cho `pnpm app:up`).

## 5. Đã chạy thử thật (4 service + RabbitMQ, dữ liệu demo)

1. Trả hàng gửi về shop → shop kiểm đúng → hoàn qua cổng (VNPay mô phỏng) → yêu cầu "Đã hoàn tiền", đơn con hoàn tất, seller bị trừ đúng, phí sàn được đảo.
2. Đơn hoàn tất → tiền khả dụng → rút tiền → duyệt ở approval → admin nhập mã giao dịch và biên lai → "Đã chi", ví khớp.
3. Shop từ chối → người mua khiếu nại → admin hoàn một nửa → payment hoàn đúng phần đã quyết, seller bị trừ theo tỉ lệ.
4. Đơn COD → hoàn ngay không gửi trả → khoản hoàn chuyển khoản chờ admin → admin hoàn tay → "Đã hoàn tiền".
5. Điều chỉnh ví DIS-02: người lập tự duyệt bị chặn; admin thứ hai duyệt → payment trừ ví, tạo khoản hoàn thêm → approval ghi "Đã thực thi".

Log 4 service không có lỗi, chỉ có cảnh báo đúng thiết kế về chế độ mô phỏng. Khi chạy thử phát hiện tài liệu ghi lệch code ở 3 chỗ nhỏ (tên tham số ảnh, thiếu API chi tiết điều chỉnh, tên trường `reason`) và đã sửa tài liệu cho khớp code.

## 6. Trang cần mở xem (không chạy trình duyệt tự động theo `CLAUDE.md`)

- **Người mua**: Tài khoản › Đơn mua › chi tiết đơn đã giao (nút "Trả hàng/Hoàn tiền"); `/tai-khoan/tra-hang` và chi tiết yêu cầu.
- **Seller**: Kênh người bán › Trả hàng/Hoàn tiền và chi tiết; Ví và rút tiền (nút Rút tiền, tab Rút tiền); chi tiết đơn có yêu cầu trả.
- **Admin**: Hỗ trợ › Trả hàng, Tranh chấp, GHN mô phỏng (nhãn "Hàng trả về shop"); Tài chính › Rút tiền, Điều chỉnh ví, Hoàn tiền; Hệ thống › Cấu hình chính sách (nhóm có thêm hạn trả hàng, tranh chấp, rút tiền).

Cách thử từng bước: `README.md`, đoạn "Trả hàng, tranh chấp và rút tiền (P5)". Điều chỉnh ví cần hai admin Tài chính khác nhau (dữ liệu demo chỉ có một): cấp bộ quyền Tài chính cho tài khoản khác ở Quản trị › Người dùng và quyền.

## 7. Việc bạn cần làm

1. Đặt danh tính git trên máy này: `git config user.name "..."` và `git config user.email "..."`.
2. Xem lại thay đổi, rồi bảo Claude commit. Dự kiến tách: `docs` → `feat(market)` (kèm `packages/shared`) → `feat(payment)` (kèm docker-compose) → `feat(approval)` → `feat(web)` → `docs: cập nhật trạng thái P5`.
3. Mở PR theo `.github/pull_request_template.md`. PR này đổi API, sự kiện và database của cả M, P, A, nên báo người phụ trách từng service.
4. Thành viên khác sau khi kéo code: `pnpm install`, `pnpm infra:up`, `pnpm db:migrate`, chép các biến `.env` mới ở mục 4.

## 8. Lưu ý về máy này

- Database dev trên máy này giờ có dữ liệu demo (`pnpm seed:demo`) và vài đơn thử của mục 5. Muốn sạch thì xóa volume Docker rồi `pnpm db:migrate` lại.
- Lúc thử DIS-02, tài khoản `galaxyhub@example.com` được cấp tạm bộ quyền Tài chính rồi đã thu hồi; hai lần đổi quyền đều có trong Nhật ký thao tác.
- `services/user-service/.env` chưa có `JWT_PRIVATE_KEY`, nên mỗi lần khởi động lại service thì phải đăng nhập lại. Tạo khóa bằng `node scripts/gen-jwt-key.mjs`.
- Không chạy `pnpm format` cho cả repo trên Windows: lệnh đổi xuống dòng CRLF→LF của hàng trăm file không liên quan. Chỉ format các file đã sửa.

## 9. Để P6

Thông báo khi yêu cầu trả hàng, tranh chấp, rút tiền đổi trạng thái (MSG-02); báo cáo tài chính tổng hợp hoàn tiền, phí sàn đã đảo (RPT-02); chi trả qua API ngân hàng (giữ adapter, chưa làm).

## 10. Rà soát và sửa (15/10/2026)

Rà lại code P5 của 3 service và web theo `12-quyet-dinh-p5.md`, tiêu chí mục 5 của kế hoạch và luật `CLAUDE.md` mục 4. Đã sửa:

| Mức | Chỗ | Lỗi | Cách sửa |
| --- | --- | --- | --- |
| Cao | M `shipping/shipments.service.ts` | Người mua hủy yêu cầu trong lúc GHN đang tạo vận đơn trả: GHN trả lời muộn ghi đè thành "chờ lấy hàng", vận đơn sống tiếp dù yêu cầu đã hủy | Chỉ chuyển trạng thái khi vận đơn còn đang tạo; đã hủy thì giữ mã GHN để job báo hủy. Áp cho cả vận đơn giao hàng |
| Vừa | M `returns/return.jobs.ts` | Yêu cầu có vận đơn trả lỗi/đang về shop vẫn chiếm 200 lượt mỗi lần quét quá hạn, yêu cầu hủy được có thể không tới lượt | Lọc ngay trong câu truy vấn |
| Vừa | P `refunds/refunds.service.ts` | Tra cứu VNPay chỉ biết "giao dịch đã có hoàn": khoản hoàn không rõ có thể bị ghi "đã hoàn" nhờ khoản hoàn khác của cùng giao dịch | Cùng giao dịch đã có khoản hoàn thành công thì chuyển hoàn tay, không ghi "đã hoàn" |
| Vừa | P rút tiền, hoàn tay | Ghi "đã chi"/"đã hoàn tay" khi biên lai chưa thật sự tải lên hoặc đã dùng cho khoản khác | Kiểm file có trong MinIO và chưa dùng |
| Vừa | Web `admin/adjustments.tsx` | Đổi mã đơn sau khi tra cứu vẫn lập điều chỉnh cho đơn cũ | Đổi mã thì bắt tra lại |
| Thấp | P `payments/order.events.ts` | Tiền hoàn chỉ chặn trần theo số người mua đã trả (gồm phí ship); khoản trừ seller được ghi dù ví không bị trừ | Chặn thêm theo `maxRefundAmount`; chỉ ghi khoản trừ khi đã trừ thật |
| Thấp | M `returns/return-money.ts` | Chia voucher shop theo dòng phụ thuộc thứ tự database trả về (lệch 1đ khi hai dòng bằng tiền) | Xếp theo mã dòng trước khi chia, không vượt phần giảm giá của dòng |
| Thấp | M, P, A | Idempotency-Key dài hơn 64 ký tự gây lỗi 500; approval bấm hai lần cùng lúc cũng lỗi 500 | Báo 400; bấm trùng thì trả đề nghị cũ |
| Thấp | A danh sách | Phân trang không ổn định khi trùng thời điểm | Thêm khóa sắp xếp phụ |
| Thấp | Web | Hiện nút duyệt/phân xử cho admin là chủ shop/người mua (backend đã chặn); chữ "payment-service" trên giao diện; nút của seller gắn theo trạng thái thay vì quyền backend trả về | Ẩn nút và ghi lý do; đổi chữ; dùng `actions` |

Test mới: vận đơn trả tạo xong sau khi người mua hủy, câu truy vấn quá hạn, chia voucher khi hai dòng bằng tiền, biên lai chưa tải lên, mã chống gửi lặp quá dài, tra cứu hoàn không phân biệt được, approval gửi trùng đồng thời và sai bộ quyền.

Tài liệu cũ đã cập nhật: `docs/README.md`, báo cáo tiến độ (trạng thái P3–P5, kết quả, kế hoạch, rủi ro, sơ đồ 16), README của approval/marketplace/payment, `infra/k8s/README.md`, câu về `REFUNDED` trong `docs/api/events.md`.

**Điểm mới chốt khi rà soát** (quyết định P5 số 11): vận đơn trả bị GHN từ chối mà người mua không bấm "Tạo lại vận đơn" thì trước đây yêu cầu nằm ở "Chờ gửi hàng trả" mãi, tiền seller bị giữ. Chủ đồ án chọn đẩy cho admin Hỗ trợ: quá hạn giao hàng trả thì yêu cầu có nhãn đỏ "Vận đơn trả lỗi quá hạn" ở Quản trị › Trả hàng; trong trang chi tiết, admin chọn **Hủy yêu cầu** hoặc **Hoàn tiền, không cần gửi trả** (API `POST /admin/returns/{id}/failed-shipment`, có test).
