import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, ParseIdPipe, type AuthUser } from '@san/nest-common';
import {
  AddCartItemDto,
  CartSelectionDto,
  RemoveCartItemsDto,
  UpdateCartItemDto,
} from './dto/cart.dto';
import { CartService, type AddedCartItem, type CartView } from './cart.service';

const stockErrors = ApiResponse({
  status: 409,
  description:
    'NOT_ENOUGH_STOCK (details.available: số còn bán được), PRODUCT_UNAVAILABLE: hàng không còn bán, ' +
    'OWN_PRODUCT: hàng của shop mình, CART_FULL: giỏ đã đủ số dòng tối đa',
});

/** Giỏ hàng của người đang đăng nhập (CRT-01) */
@ApiTags('Giỏ hàng')
@ApiBearerAuth()
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  /** Giỏ chia theo shop, mỗi dòng có giá hiện tại, số còn bán được và tình trạng; tổng các dòng đang chọn */
  @Get()
  get(@CurrentUser() user: AuthUser): Promise<CartView> {
    return this.cart.view(user.id);
  }

  /** Số dòng trong giỏ (biểu tượng giỏ trên header) */
  @Get('count')
  count(@CurrentUser() user: AuthUser): Promise<{ count: number }> {
    return this.cart.count(user.id);
  }

  /** Thêm vào giỏ; đã có dòng của biến thể đó thì cộng thêm số lượng */
  @Post('items')
  @HttpCode(201)
  @ApiResponse({ status: 404, description: 'NOT_FOUND: không có biến thể này' })
  @stockErrors
  add(@CurrentUser() user: AuthUser, @Body() dto: AddCartItemDto): Promise<AddedCartItem> {
    return this.cart.add(user.id, dto);
  }

  /** Đổi số lượng, tick chọn, hoặc đổi sang biến thể khác của cùng sản phẩm. Trả giỏ mới */
  @Patch('items/:itemId')
  @ApiResponse({
    status: 400,
    description: 'INVALID_VARIANT: biến thể không thuộc cùng sản phẩm',
  })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: dòng giỏ không phải của bạn' })
  @stockErrors
  update(
    @CurrentUser() user: AuthUser,
    @Param('itemId', ParseIdPipe) itemId: string,
    @Body() dto: UpdateCartItemDto,
  ): Promise<CartView> {
    return this.cart.update(user.id, itemId, dto);
  }

  /** Xóa một dòng. Trả giỏ mới */
  @Delete('items/:itemId')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: dòng giỏ không phải của bạn' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('itemId', ParseIdPipe) itemId: string,
  ): Promise<CartView> {
    return this.cart.remove(user.id, itemId);
  }

  /** Chọn/bỏ chọn nhiều dòng (cả shop, cả giỏ). Trả giỏ mới */
  @Post('selection')
  @HttpCode(200)
  select(@CurrentUser() user: AuthUser, @Body() dto: CartSelectionDto): Promise<CartView> {
    return this.cart.select(user.id, dto);
  }

  /** Xóa nhiều dòng một lần. Trả giỏ mới */
  @Post('items/remove')
  @HttpCode(200)
  removeMany(@CurrentUser() user: AuthUser, @Body() dto: RemoveCartItemsDto): Promise<CartView> {
    return this.cart.removeMany(user.id, dto.itemIds);
  }
}
