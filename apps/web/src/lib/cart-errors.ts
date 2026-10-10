import { toast } from 'sonner';
import { ApiError } from './api';

/**
 * Câu báo lỗi giỏ hàng theo mã lỗi (POST /cart/items, PATCH /cart/items/{id}).
 * NOT_ENOUGH_STOCK dùng details.available để báo số còn lại.
 */
export function cartErrorText(error: unknown): { title: string; description?: string } {
  if (!(error instanceof ApiError)) return { title: 'Có lỗi xảy ra, bạn thử lại.' };
  switch (error.code) {
    case 'NOT_ENOUGH_STOCK': {
      const available = Number(error.details.available ?? 0);
      if (available <= 0) return { title: 'Sản phẩm này đã hết hàng.' };
      // Câu của máy chủ đã gồm số còn lại (và số đã có trong giỏ nếu có): "Chỉ còn 3 sản phẩm, giỏ của bạn đã có 2."
      return { title: error.message || `Chỉ còn ${available} sản phẩm.` };
    }
    case 'OWN_PRODUCT':
      return {
        title: 'Đây là sản phẩm của shop bạn.',
        description: 'Bạn không thể tự mua hàng của shop mình.',
      };
    case 'PRODUCT_UNAVAILABLE':
      return { title: 'Sản phẩm này hiện không còn bán.' };
    case 'CART_FULL':
      return { title: 'Giỏ hàng đã đầy.', description: error.message };
    case 'INVALID_VARIANT':
      return { title: 'Phân loại này không thuộc sản phẩm trong giỏ.' };
    case 'NOT_FOUND':
      return { title: error.message || 'Không tìm thấy sản phẩm này.' };
    default:
      return { title: error.message };
  }
}

/** Hiện lỗi giỏ hàng thành toast */
export function toastCartError(error: unknown) {
  const { title, description } = cartErrorText(error);
  toast.error(title, description ? { description } : undefined);
}
