# marketplace-service [M]

Shop, danh mục, sản phẩm/SKU, tồn kho, tìm kiếm, giỏ, voucher, checkout, đơn hàng, vận chuyển GHN, trả hàng, đánh giá, theo dõi, chat, thông báo.

- Cổng chạy local: `3002`
- Database riêng: `market_db` (không service nào khác được đọc/ghi)
- Kiểm tra sống: `GET http://localhost:3002/health`

```bash
cp .env.example .env
pnpm --filter @san/marketplace-service dev
```
