# Làm việc nhóm

1. Nhận việc: mỗi việc là một Issue theo mẫu "Việc cần làm", có mã chức năng (ví dụ ACC-01) và người làm.
2. Tạo nhánh từ `main`: `feat/ACC-01-dang-ky-email` (sửa lỗi: `fix/...`).
3. Code theo [`CLAUDE.md`](CLAUDE.md) (luật kiến trúc mục 4, quy ước mục 7).
4. Commit có mã chức năng: `feat(user): ACC-01 đăng ký bằng email`.
5. Trước khi push: `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
6. Mở Pull Request theo mẫu, gắn Issue. CI xanh + 1 người duyệt thì merge.
7. Đụng tới API, sự kiện hoặc database của service người khác: nhắc người phụ trách service đó trong PR.

Gặp điểm nghiệp vụ chưa chốt (danh sách ở `CLAUDE.md` mục 9): hỏi trong nhóm trước, không tự quyết.
