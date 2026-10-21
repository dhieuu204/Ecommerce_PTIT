# Máy ảo cho Kubernetes (k3s): cấu hình cần tạo

Dùng cho DEPLOY-01 (chạy thử và demo trên hạ tầng công ty). Lúc code hằng ngày vẫn dùng Docker Compose như cũ.

## 1. Đề xuất: 9 máy ảo, chịu lỗi ở mọi tầng (HA)

| Tên máy | Vai trò | vCPU | RAM | Ổ đĩa | Chạy gì |
| --- | --- | --- | --- | --- | --- |
| `san-master-1`, `-2`, `-3` | Điều khiển k3s | 2 | 4 GB | 50 GB SSD | Bộ điều khiển Kubernetes và etcd (nơi Kubernetes ghi trạng thái), không chạy ứng dụng |
| `san-worker-1`, `-2`, `-3` | Chạy ứng dụng | 4 | 8 GB | 80 GB SSD | 4 service, web, Ingress NGINX; mỗi service 3 bản, mỗi máy một bản |
| `san-data-1`, `-2`, `-3` | Dữ liệu | 4 | 8 GB | 50 GB SSD cho hệ điều hành + **ổ thứ hai 100 GB SSD** cho dữ liệu | PostgreSQL, RabbitMQ, MinIO chạy thành cụm 3 máy; Redis |

Tổng: **30 vCPU, 60 GB RAM, khoảng 840 GB SSD**, cộng **1 IP nội bộ còn trống** làm IP ảo chung cho 3 máy điều khiển.

Tắt hẳn bất kỳ **một** máy nào, sàn vẫn chạy và không mất dữ liệu:

| Tầng | Cách chịu lỗi |
| --- | --- |
| Điều khiển | 3 máy giữ etcd, mất 1 vẫn còn đa số 2/3. Các node nối vào IP ảo nên không phụ thuộc máy nào. |
| Ứng dụng | Mỗi service có 3 bản ở 3 máy. Chat và thông báo vẫn tới đúng người vì Socket.IO dùng Redis. |
| PostgreSQL | 1 máy chính, 2 máy dự phòng chép liên tục. Máy chính chết thì một máy dự phòng tự lên thay. |
| RabbitMQ | Cụm 3 máy, hàng đợi kiểu quorum (chép trên cả 3 máy), mất 1 máy không mất sự kiện. |
| MinIO | Chạy phân tán trên 3 máy, ảnh và biên lai có bản dự phòng. |
| Redis | 1 bản. Redis chỉ chuyển tin realtime, không lưu dữ liệu, nên máy chết thì Kubernetes dựng lại ở máy khác sau vài giây. |

**Bản gọn hơn, nếu công ty muốn tiết kiệm (4 máy):** 1 máy điều khiển 2/4/40, 2 máy ứng dụng 4/8/60, 1 máy dữ liệu 4/8/120. Bản này chỉ chịu lỗi ở tầng ứng dụng; tắt máy điều khiển hoặc máy dữ liệu thì sàn dừng.

## 2. Hệ điều hành và cài đặt chung (mọi máy)

- **Ubuntu Server 24.04 LTS, 64-bit (x86_64)**, cài bản tối giản, bật OpenSSH.
- IP nội bộ **tĩnh**, cùng một mạng con, đặt hostname đúng như bảng trên.
- Đồng bộ giờ (chrony hoặc systemd-timesyncd). Lệch giờ làm hỏng vé đăng nhập và chữ ký VNPay.
- Tắt swap (`swapoff -a` và bỏ dòng swap trong `/etc/fstab`).
- Một tài khoản có quyền sudo, đăng nhập bằng khóa SSH.
- Không cần cài Docker: k3s đã có sẵn containerd.

## 3. Mạng

**Giữa các máy với nhau** (mở trong firewall nội bộ):

| Cổng | Giao thức | Để làm gì |
| --- | --- | --- |
| 6443 | TCP | Các node nói chuyện với máy điều khiển |
| 10250 | TCP | Máy điều khiển gọi tới từng node (xem log, exec) |
| 8472 | UDP | Mạng nội bộ giữa các pod (flannel VXLAN) |
| 2379–2380 | TCP | etcd, chỉ giữa 3 máy điều khiển |

**Từ Internet vào** (chỉ 2 cổng, vào 3 máy ứng dụng, nơi có Ingress NGINX):

| Cổng | Để làm gì |
| --- | --- |
| 80 | HTTP, chuyển sang HTTPS và cấp chứng chỉ Let's Encrypt |
| 443 | HTTPS cho web và API |

Cần thêm:

- **Một tên miền** (ví dụ `san.tencongty.vn`) trỏ vào IP công khai, và IP đó chuyển 80/443 vào 3 máy ứng dụng. Tốt nhất là qua load balancer hoặc reverse proxy của công ty; không có thì trỏ thẳng vào một máy.
- Cần HTTPS và địa chỉ công khai vì **VNPay (IPN) và GHN (webhook) phải gọi được vào sàn**, Google đăng nhập cũng cần đường dẫn chuyển về bằng HTTPS.

**Từ các máy ra Internet** (nếu công ty chặn thì xin mở):

| Đích | Để làm gì |
| --- | --- |
| `ghcr.io`, `registry-1.docker.io`, `get.k3s.io`, `github.com` | Tải k3s và image |
| `dev-online-gateway.ghn.vn` | API GHN môi trường dev |
| `sandbox.vnpayment.vn` | VNPay sandbox |
| `smtp.gmail.com:465` | Gửi email thật (nếu dùng Gmail) |
| `oauth2.googleapis.com`, `accounts.google.com` | Đăng nhập Google |

## 4. Ổ đĩa của máy dữ liệu

- Mỗi máy dữ liệu có ổ thứ hai 100 GB SSD (ví dụ `/dev/sdb`), gắn vào `/data`. Dữ liệu đặt ở đó, cài lại hệ điều hành không mất.
- 100 GB mỗi máy đủ demo nhiều lần: PostgreSQL khoảng 20 GB, MinIO khoảng 50 GB, phần còn lại cho RabbitMQ, log và bản sao lưu.

## 5. Gửi lại cho Claude sau khi tạo xong (không có bí mật)

1. IP nội bộ và hostname của từng máy, và IP ảo dành cho 3 máy điều khiển.
2. Tên miền đã trỏ, và có load balancer hay reverse proxy của công ty phía trước không.
3. Có được cấp chứng chỉ HTTPS của công ty không (không có thì dùng Let's Encrypt).
4. Nơi để image: **GitHub Container Registry (ghcr.io)** của repo (đề xuất, miễn phí) hay registry của công ty.
5. Các cổng ra Internet ở mục 3 đã mở chưa.

Mật khẩu, khóa GHN/VNPay/Google, khóa ký JWT **không gửi qua chat**: sẽ tạo thành Secret của Kubernetes ngay trên máy điều khiển.

## 6. Bước sau

Claude viết file Kubernetes trong `infra/k8s/` và lệnh cài k3s cho từng máy, kèm kịch bản demo chịu lỗi: tắt lần lượt một máy ứng dụng, một máy dữ liệu, một máy điều khiển giữa lúc đặt hàng và chat.

Bản HA cần thêm 4 thành phần hạ tầng mới, sẽ hỏi chủ đồ án trước khi dùng:
- **kube-vip**: IP ảo cho 3 máy điều khiển.
- **CloudNativePG**: tự chép và tự đổi máy chính cho PostgreSQL.
- **RabbitMQ Cluster Operator**: dựng cụm RabbitMQ 3 máy.
- **MinIO chạy phân tán** trên 3 máy.
