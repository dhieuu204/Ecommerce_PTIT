# Máy ảo cho Kubernetes (k3s): cấu hình cần tạo

Dùng cho DEPLOY-01 (chạy thử và demo trên hạ tầng công ty). Lúc code hằng ngày vẫn dùng Docker Compose như cũ.

## 1. Đề xuất: 4 máy ảo

| Tên máy | Vai trò | vCPU | RAM | Ổ đĩa | Chạy gì |
| --- | --- | --- | --- | --- | --- |
| `san-master` | Máy điều khiển k3s | 2 | 4 GB | 40 GB SSD | Bộ điều khiển Kubernetes, không chạy ứng dụng |
| `san-worker-1` | Máy chạy ứng dụng | 4 | 8 GB | 60 GB SSD | 4 service, web, Ingress NGINX (mỗi service 2 bản, chia đều 2 máy) |
| `san-worker-2` | Máy chạy ứng dụng | 4 | 8 GB | 60 GB SSD | Như `san-worker-1` |
| `san-data` | Máy dữ liệu | 4 | 8 GB | 50 GB SSD + **ổ thứ hai 100 GB SSD** | PostgreSQL (4 database), RabbitMQ, Redis, MinIO (ảnh, bằng chứng, biên lai) |

Tổng: **14 vCPU, 28 GB RAM, 310 GB SSD**.

Vì sao chia như vậy:

- Hai máy ứng dụng giúp demo phần "chịu lỗi" trong kế hoạch: tắt hẳn một máy, các bản service ở máy kia vẫn phục vụ, Kubernetes tự dựng lại bản bị mất. Chat vẫn tới đúng người vì Socket.IO dùng Redis.
- Dữ liệu nằm riêng một máy: tắt máy ứng dụng không làm mất đơn hàng hay tiền. Máy này vẫn là một node của k3s (có nhãn riêng), nên cả hệ thống vẫn được mô tả bằng file Kubernetes.
- Máy điều khiển tách riêng cho dễ giải thích với hội đồng.

**Đã chốt (21/10/2026): chỉ chịu lỗi (HA) ở tầng ứng dụng.** Đã cân nhắc bản HA đầy đủ 9 máy (3 máy điều khiển, PostgreSQL có máy dự phòng tự lên thay, cụm RabbitMQ và MinIO 3 máy) nhưng không làm, vì cần thêm 4 thành phần hạ tầng mới phải giải thích với hội đồng. Hệ quả: tắt máy điều khiển hoặc máy dữ liệu thì sàn dừng cho tới khi máy bật lại (dữ liệu không mất vì nằm trên ổ).

## 2. Hệ điều hành và cài đặt chung (cả 4 máy)

- **Ubuntu Server 24.04 LTS, 64-bit (x86_64)**, cài bản tối giản, bật OpenSSH.
- IP nội bộ **tĩnh**, cùng một mạng con, đặt hostname đúng như bảng trên.
- Đồng bộ giờ (chrony hoặc systemd-timesyncd). Lệch giờ làm hỏng vé đăng nhập và chữ ký VNPay.
- Tắt swap (`swapoff -a` và bỏ dòng swap trong `/etc/fstab`).
- Một tài khoản có quyền sudo, đăng nhập bằng khóa SSH.
- Không cần cài Docker: k3s đã có sẵn containerd.

## 3. Mạng

**Giữa 4 máy với nhau** (mở trong firewall nội bộ):

| Cổng | Giao thức | Để làm gì |
| --- | --- | --- |
| 6443 | TCP | Các node nói chuyện với máy điều khiển |
| 10250 | TCP | Máy điều khiển gọi tới từng node (xem log, exec) |
| 8472 | UDP | Mạng nội bộ giữa các pod (flannel VXLAN) |

**Từ Internet vào** (chỉ 2 cổng, vào `san-worker-1` và `san-worker-2`, nơi có Ingress NGINX):

| Cổng | Để làm gì |
| --- | --- |
| 80 | HTTP, chuyển sang HTTPS và cấp chứng chỉ Let's Encrypt |
| 443 | HTTPS cho web và API |

Cần thêm:

- **Một tên miền** (ví dụ `san.tencongty.vn`) trỏ vào IP công khai, và IP đó chuyển 80/443 vào 2 máy ứng dụng. Tốt nhất là qua load balancer hoặc reverse proxy của công ty; không có thì trỏ thẳng vào một máy.
- Cần HTTPS và địa chỉ công khai vì **VNPay (IPN) và GHN (webhook) phải gọi được vào sàn**, Google đăng nhập cũng cần đường dẫn chuyển về bằng HTTPS.

**Từ 4 máy ra Internet** (nếu công ty chặn thì xin mở):

| Đích | Để làm gì |
| --- | --- |
| `ghcr.io`, `registry-1.docker.io`, `get.k3s.io`, `github.com` | Tải k3s và image |
| `dev-online-gateway.ghn.vn` | API GHN môi trường dev |
| `sandbox.vnpayment.vn` | VNPay sandbox |
| `smtp.gmail.com:465` | Gửi email thật (nếu dùng Gmail) |
| `oauth2.googleapis.com`, `accounts.google.com` | Đăng nhập Google |

## 4. Ổ đĩa của máy dữ liệu

- Ổ thứ hai 100 GB SSD (ví dụ `/dev/sdb`) gắn vào `/data`. Dữ liệu đặt ở đó, cài lại hệ điều hành không mất.
- 100 GB đủ demo nhiều lần: PostgreSQL khoảng 20 GB, MinIO khoảng 50 GB, phần còn lại cho RabbitMQ, log và bản sao lưu.
- Nên bật chụp ảnh ổ (snapshot) hằng ngày cho máy này nếu hạ tầng công ty hỗ trợ.

## 5. Gửi lại cho Claude sau khi tạo xong (không có bí mật)

1. IP nội bộ và hostname của từng máy.
2. Tên miền đã trỏ, và có load balancer hay reverse proxy của công ty phía trước không.
3. Có được cấp chứng chỉ HTTPS của công ty không (không có thì dùng Let's Encrypt).
4. Nơi để image: **GitHub Container Registry (ghcr.io)** của repo (đề xuất, miễn phí) hay registry của công ty.
5. Các cổng ra Internet ở mục 3 đã mở chưa.

Mật khẩu, khóa GHN/VNPay/Google, khóa ký JWT **không gửi qua chat**: sẽ tạo thành Secret của Kubernetes ngay trên máy điều khiển.

## 6. Bước sau

Claude viết file Kubernetes trong `infra/k8s/`: Deployment 2 bản cho mỗi service, StatefulSet cho dữ liệu, Ingress NGINX, Secret, và lệnh cài k3s cho từng máy. Kèm kịch bản demo chịu lỗi: tắt một máy ứng dụng giữa lúc đặt hàng và chat.
