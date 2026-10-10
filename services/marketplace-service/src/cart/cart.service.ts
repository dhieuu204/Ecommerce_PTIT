import { Injectable } from '@nestjs/common';
import { AppError } from '@san/nest-common';
import { AppConfig } from '../config';
import { PrismaService } from '../prisma.service';
import type { Prisma } from '../../generated/prisma';
import type { AddCartItemDto, CartSelectionDto, UpdateCartItemDto } from './dto/cart.dto';

/**
 * Tình trạng một dòng giỏ:
 * OK; NOT_ENOUGH_STOCK: số lượng trong giỏ lớn hơn số còn bán được; OUT_OF_STOCK: hết hàng;
 * UNAVAILABLE: sản phẩm bị ẩn, biến thể bị bỏ hoặc shop không hoạt động.
 */
export type CartItemState = 'OK' | 'NOT_ENOUGH_STOCK' | 'OUT_OF_STOCK' | 'UNAVAILABLE';

/** Một dòng giỏ (giá luôn là giá hiện tại) */
export interface CartItemView {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  /** Ảnh theo màu (nhóm 1) của biến thể, không có thì ảnh chung đầu tiên */
  image: string | null;
  option1Name: string | null;
  option2Name: string | null;
  /** '' nếu sản phẩm không có nhóm đó */
  option1Value: string;
  option2Value: string;
  price: number;
  originalPrice: number | null;
  /** Số còn bán được (0 khi UNAVAILABLE) */
  available: number;
  quantity: number;
  selected: boolean;
  state: CartItemState;
}

/** Một nhóm shop trong giỏ */
export interface CartShopGroup {
  shop: { id: string; name: string; logoUrl: string | null };
  /** Mới thêm trước */
  items: CartItemView[];
}

export interface CartView {
  /** Nhóm có dòng mới thêm gần nhất đứng trước */
  shops: CartShopGroup[];
  /** Số dòng đang chọn và có state = OK */
  selectedCount: number;
  /** Tổng tiền (đồng) các dòng đang chọn có state = OK */
  selectedTotal: number;
}

/** Kết quả thêm vào giỏ */
export interface AddedCartItem {
  /** Dòng giỏ vừa thêm hoặc cộng thêm */
  itemId: string;
  /** Số lượng của dòng sau khi thêm */
  quantity: number;
  /** Số dòng trong giỏ (cho biểu tượng giỏ) */
  count: number;
}

const variantInclude = {
  product: {
    select: {
      id: true,
      status: true,
      shop: { select: { id: true, ownerId: true, status: true } },
    },
  },
} satisfies Prisma.ProductVariantInclude;

type VariantWithProduct = Prisma.ProductVariantGetPayload<{ include: typeof variantInclude }>;

const sellable = (v: VariantWithProduct) =>
  v.active && v.product.status === 'ACTIVE' && v.product.shop.status === 'ACTIVE';

/** Giỏ hàng (CRT-01). Mỗi người mỗi biến thể một dòng; mọi thay đổi của một người chạy lần lượt. */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async count(userId: string): Promise<{ count: number }> {
    return { count: await this.prisma.cartItem.count({ where: { userId } }) };
  }

  async view(userId: string): Promise<CartView> {
    const items = await this.prisma.cartItem.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        variant: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                status: true,
                option1Name: true,
                option2Name: true,
                images: {
                  select: { url: true, option1Value: true },
                  orderBy: [{ sort: 'asc' }, { id: 'asc' }],
                },
                shop: { select: { id: true, name: true, logoUrl: true, status: true } },
              },
            },
          },
        },
      },
    });

    const groups = new Map<string, CartShopGroup>();
    let selectedCount = 0;
    let selectedTotal = 0;
    for (const item of items) {
      const v = item.variant;
      const p = v.product;
      const unavailable = !v.active || p.status !== 'ACTIVE' || p.shop.status !== 'ACTIVE';
      const available = unavailable ? 0 : Math.max(0, v.stock - v.reserved);
      const state: CartItemState = unavailable
        ? 'UNAVAILABLE'
        : available === 0
          ? 'OUT_OF_STOCK'
          : item.quantity > available
            ? 'NOT_ENOUGH_STOCK'
            : 'OK';
      if (item.selected && state === 'OK') {
        selectedCount += 1;
        selectedTotal += v.price * item.quantity;
      }
      const image =
        (v.option1Value && p.images.find((i) => i.option1Value === v.option1Value)) ||
        p.images.find((i) => !i.option1Value) ||
        p.images[0];

      let group = groups.get(p.shop.id);
      if (!group) {
        group = {
          shop: { id: p.shop.id, name: p.shop.name ?? '', logoUrl: p.shop.logoUrl },
          items: [],
        };
        groups.set(p.shop.id, group);
      }
      group.items.push({
        id: item.id,
        variantId: v.id,
        productId: p.id,
        productName: p.name,
        image: image?.url ?? null,
        option1Name: p.option1Name,
        option2Name: p.option2Name,
        option1Value: v.option1Value,
        option2Value: v.option2Value,
        price: v.price,
        originalPrice: v.originalPrice,
        available,
        quantity: item.quantity,
        selected: item.selected,
        state,
      });
    }
    // Map giữ thứ tự thêm vào, các dòng đã sắp mới nhất trước nên nhóm cũng theo dòng mới nhất
    return { shops: [...groups.values()], selectedCount, selectedTotal };
  }

  /** Thêm vào giỏ: đã có dòng của biến thể thì cộng thêm, tổng không vượt số còn bán được */
  async add(userId: string, dto: AddCartItemDto): Promise<AddedCartItem> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, userId);
      const variant = await this.findVariant(tx, dto.variantId);
      if (!variant) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy phân loại hàng này.');
      if (variant.product.shop.ownerId === userId) {
        throw new AppError(409, 'OWN_PRODUCT', 'Bạn không thể mua hàng của shop mình.');
      }
      this.assertSellable(variant);

      const existing = await tx.cartItem.findUnique({
        where: { userId_variantId: { userId, variantId: variant.id } },
      });
      if (!existing) {
        const lines = await tx.cartItem.count({ where: { userId } });
        if (lines >= this.config.cartMaxItems) {
          throw new AppError(
            409,
            'CART_FULL',
            `Giỏ hàng đã đủ ${this.config.cartMaxItems} sản phẩm. Bạn hãy xóa bớt rồi thêm lại.`,
          );
        }
      }
      const quantity = (existing?.quantity ?? 0) + dto.quantity;
      this.assertStock(variant, quantity, existing?.quantity ?? 0);

      const item = existing
        ? await tx.cartItem.update({
            where: { id: existing.id },
            data: { quantity, selected: true },
          })
        : await tx.cartItem.create({ data: { userId, variantId: variant.id, quantity } });
      const count = await tx.cartItem.count({ where: { userId } });
      return { itemId: item.id, quantity: item.quantity, count };
    });
  }

  /** Đổi số lượng, tick chọn hoặc biến thể của một dòng */
  async update(userId: string, itemId: string, dto: UpdateCartItemDto): Promise<CartView> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, userId);
      const item = await tx.cartItem.findFirst({ where: { id: itemId, userId } });
      if (!item) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm này trong giỏ.');
      const quantity = dto.quantity ?? item.quantity;
      const selected = dto.selected ?? item.selected;

      if (dto.variantId && dto.variantId !== item.variantId) {
        const [current, target] = await Promise.all([
          tx.productVariant.findUniqueOrThrow({
            where: { id: item.variantId },
            select: { productId: true },
          }),
          this.findVariant(tx, dto.variantId),
        ]);
        if (!target || target.productId !== current.productId) {
          throw new AppError(
            400,
            'INVALID_VARIANT',
            'Phân loại này không thuộc sản phẩm trong giỏ.',
          );
        }
        this.assertSellable(target);
        const other = await tx.cartItem.findUnique({
          where: { userId_variantId: { userId, variantId: target.id } },
        });
        if (other) {
          // Đã có dòng của biến thể kia: gộp vào dòng đó, bỏ dòng này
          this.assertStock(target, other.quantity + quantity, 0);
          await tx.cartItem.update({
            where: { id: other.id },
            data: { quantity: other.quantity + quantity, selected },
          });
          await tx.cartItem.delete({ where: { id: item.id } });
        } else {
          this.assertStock(target, quantity, 0);
          await tx.cartItem.update({
            where: { id: item.id },
            data: { variantId: target.id, quantity, selected },
          });
        }
        return;
      }

      if (dto.quantity !== undefined && dto.quantity !== item.quantity) {
        const variant = (await this.findVariant(tx, item.variantId))!;
        this.assertSellable(variant);
        this.assertStock(variant, quantity, 0);
      }
      await tx.cartItem.update({ where: { id: item.id }, data: { quantity, selected } });
    });
    return this.view(userId);
  }

  async remove(userId: string, itemId: string): Promise<CartView> {
    const { count } = await this.prisma.cartItem.deleteMany({ where: { id: itemId, userId } });
    if (count === 0) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm này trong giỏ.');
    return this.view(userId);
  }

  async select(userId: string, dto: CartSelectionDto): Promise<CartView> {
    await this.prisma.cartItem.updateMany({
      where: { userId, id: { in: dto.itemIds } },
      data: { selected: dto.selected },
    });
    return this.view(userId);
  }

  async removeMany(userId: string, itemIds: string[]): Promise<CartView> {
    await this.prisma.cartItem.deleteMany({ where: { userId, id: { in: itemIds } } });
    return this.view(userId);
  }

  // ----- phần dùng chung -----

  /** Các thay đổi giỏ của cùng một người chạy lần lượt (bấm 2 lần không tạo 2 dòng, không vượt giới hạn) */
  private async lockCart(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cart:${userId}`}))`;
  }

  private findVariant(tx: Prisma.TransactionClient, id: string) {
    return tx.productVariant.findUnique({ where: { id }, include: variantInclude });
  }

  private assertSellable(v: VariantWithProduct): void {
    if (!sellable(v)) {
      throw new AppError(409, 'PRODUCT_UNAVAILABLE', 'Sản phẩm này hiện không còn bán.');
    }
  }

  /** Số lượng muốn có không vượt số còn bán được (tồn trừ lượng đang giữ cho đơn) */
  private assertStock(v: VariantWithProduct, quantity: number, inCart: number): void {
    const available = Math.max(0, v.stock - v.reserved);
    if (quantity > available) {
      throw new AppError(
        409,
        'NOT_ENOUGH_STOCK',
        available === 0
          ? 'Sản phẩm này đã hết hàng.'
          : inCart > 0
            ? `Chỉ còn ${available} sản phẩm, giỏ của bạn đã có ${inCart}.`
            : `Chỉ còn ${available} sản phẩm.`,
        { available },
      );
    }
  }
}
