import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '@san/nest-common';

/** Sản phẩm đang bán theo API công khai GET /products/{productId} của marketplace (phần dùng tới) */
export interface PublicProductInfo {
  id: string;
  name: string;
  /** Ảnh chung đầu tiên */
  image: string | null;
  shopId: string;
}

/** Phần dùng tới trong trả lời của marketplace */
interface ProductDetailBody {
  id: string;
  name: string;
  images: Array<{ url: string; option1Value: string | null }>;
  shop: { id: string };
}

const DEFAULT_URL = 'http://localhost:3002/api/market/v1';

/**
 * Gọi API công khai của marketplace-service lấy tên, ảnh và shop của sản phẩm khi người mua báo cáo vi phạm
 * (MOD-01, quyết định P6 mục 2 số 11). Không gửi vé đăng nhập: chỉ đọc dữ liệu ai cũng xem được.
 */
@Injectable()
export class MarketplaceClient {
  private readonly logger = new Logger(MarketplaceClient.name);
  private readonly baseUrl = (process.env.MARKETPLACE_API_URL || DEFAULT_URL).replace(/\/+$/, '');

  /** Sản phẩm đang bán; không có hoặc không đang bán → 404 NOT_FOUND; marketplace lỗi → 503 */
  async product(productId: string): Promise<PublicProductInfo> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/products/${encodeURIComponent(productId)}`, {
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      this.logger.error(`Không gọi được marketplace-service: ${(e as Error).message}`);
      throw unavailable();
    }
    if (res.status === 404) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm hoặc sản phẩm không còn bán.');
    }
    if (!res.ok) {
      this.logger.error(`marketplace-service trả HTTP ${res.status} khi lấy sản phẩm ${productId}`);
      throw unavailable();
    }
    const body = (await res.json().catch(() => null)) as ProductDetailBody | null;
    if (!body?.id || !body.shop?.id) {
      this.logger.error(`marketplace-service trả dữ liệu sản phẩm ${productId} không đúng dạng`);
      throw unavailable();
    }
    const general = body.images?.find((img) => img.option1Value === null) ?? body.images?.[0];
    return { id: body.id, name: body.name, image: general?.url ?? null, shopId: body.shop.id };
  }
}

function unavailable(): AppError {
  return new AppError(
    503,
    'MARKETPLACE_SERVICE_UNAVAILABLE',
    'Chưa kiểm tra được sản phẩm, bạn thử lại sau ít phút.',
  );
}
