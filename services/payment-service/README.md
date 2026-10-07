# payment-service [P]

Giao dịch VNPay, phân bổ tiền, hoàn tiền, sổ tiền seller, phí sàn, đối soát, khóa tiền rút, chi trả.

- Cổng chạy local: `3003`
- Database riêng: `payment_db` (không service nào khác được đọc/ghi)
- Kiểm tra sống: `GET http://localhost:3003/health`

```bash
cp .env.example .env
pnpm --filter @san/payment-service dev
```
