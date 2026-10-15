# Kubernetes (k3s)

Dùng khi chạy thử và demo, không dùng khi code hằng ngày (khi code dùng `infra/docker-compose.yml`).

Chưa có file manifest; làm sau khi xong các phase, trước buổi demo. Dockerfile đã có (`services/Dockerfile` dùng chung cho 4 service, `apps/web/Dockerfile`), nên lúc đó chỉ cần thêm Deployment/Service cho 4 service và web, Ingress NGINX chuyển đường theo tiền tố API, Secret cho mật khẩu và khóa.
