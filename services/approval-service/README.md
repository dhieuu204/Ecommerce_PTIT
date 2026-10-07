# approval-service [A]

Hồ sơ duyệt shop/vi phạm, kiểm tra đơn theo luật, quyết định tranh chấp, duyệt rút tiền. Chỉ LƯU quyết định; M và P áp dụng.

- Cổng chạy local: `3004`
- Database riêng: `approval_db` (không service nào khác được đọc/ghi)
- Kiểm tra sống: `GET http://localhost:3004/health`

```bash
cp .env.example .env
pnpm --filter @san/approval-service dev
```
