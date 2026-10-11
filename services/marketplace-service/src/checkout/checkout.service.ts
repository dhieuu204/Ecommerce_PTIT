import { Injectable } from '@nestjs/common';
import { AppError, EventBus, SettingsService, type AuthUser } from '@san/nest-common';
import { ORDER_PLACED } from '@san/shared';
import { randomInt } from 'node:crypto';
import { AppConfig } from '../config';
import { PrismaService } from '../prisma.service';
import { MarketSetting } from '../settings';
import { UserClient, type BuyerAddress } from '../clients/user.client';
import type { Prisma, Voucher } from '../../generated/prisma';
import type { PreviewCheckoutDto } from './dto/checkout.dto';
import { applyPlatformVoucher, itemDiscounts, voucherDiscount } from './pricing';
import { ShippingFeeService, type ShippingQuote } from './shipping-fee.service';

type Db = Prisma.TransactionClient | PrismaService;

export type LineState = 'OK' | 'NOT_ENOUGH_STOCK' | 'OUT_OF_STOCK' | 'UNAVAILABLE' | 'OWN_PRODUCT';

/** Một dòng hàng trong bản xem trước */
export interface CheckoutLine {
  cartItemId: string;
  variantId: string;
  productId: string;
  productName: string;
  /** Ví dụ "Đen, 128GB"; '' nếu không phân loại */
  variantName: string;
  image: string | null;
  price: number;
  originalPrice: number | null;
  quantity: number;
  /** Khối lượng 1 sản phẩm (gram) */
  weight: number;
  lineTotal: number;
  /** Số còn bán được */
  available: number;
  state: LineState;
}

/** Một voucher buyer chọn được ở checkout */
export interface VoucherOption {
  code: string;
  name: string;
  discountType: 'AMOUNT' | 'PERCENT';
  value: number;
  maxDiscount: number | null;
  minOrder: number;
  endAt: Date;
  /** Số tiền sẽ giảm nếu áp (0 khi chưa đủ điều kiện) */
  discount: number;
  eligible: boolean;
  /** Vì sao chưa dùng được, ví dụ "Mua thêm 50.000đ để dùng mã này" */
  reason: string | null;
}

export interface AppliedVoucher {
  voucherId: string;
  code: string;
  name: string;
  discount: number;
}

export interface CheckoutShop {
  shop: { id: string; name: string; logoUrl: string | null };
  items: CheckoutLine[];
  subtotal: number;
  shopVoucher: AppliedVoucher | null;
  /** Voucher đang chạy của shop (dùng được hoặc chưa) */
  vouchers: VoucherOption[];
  shopDiscount: number;
  shippingFee: number;
  /** GHN: giá GHN; FALLBACK: GHN lỗi, phí dự phòng; FIXED: chưa nối GHN, phí cố định */
  shippingFeeSource: ShippingQuote['source'];
  platformDiscount: number;
  /** Buyer trả cho shop này */
  total: number;
}

export interface CheckoutAddress {
  id: string;
  receiverName: string;
  phone: string;
  provinceId: number;
  districtId: number;
  wardCode: string;
  provinceName: string;
  /** Địa chỉ đầy đủ */
  fullAddress: string;
}

export interface CheckoutProblem {
  cartItemId: string | null;
  message: string;
}

export interface VoucherError {
  /** null = voucher sàn */
  shopId: string | null;
  code: string;
  message: string;
}

/** Bản xem trước (chưa có mã phiên) */
export interface CheckoutData {
  /** VNPAY: trả trước; COD: thanh toán khi nhận hàng */
  paymentMethod: 'VNPAY' | 'COD';
  /** Mọi shop trong đơn đều nhận COD (COD-01) */
  codAvailable: boolean;
  address: CheckoutAddress;
  shops: CheckoutShop[];
  platformVoucher: AppliedVoucher | null;
  platformVouchers: VoucherOption[];
  subtotal: number;
  shopDiscount: number;
  platformDiscount: number;
  shippingFee: number;
  total: number;
  /** Dòng hết hàng, không còn bán, vượt tồn... phải sửa giỏ trước khi đặt */
  problems: CheckoutProblem[];
  /** Mã voucher không áp được (không làm hỏng cả bản xem trước) */
  voucherErrors: VoucherError[];
  canPlace: boolean;
}

export interface CheckoutPreview extends CheckoutData {
  /** Mã phiên: gửi kèm khi đặt hàng; gửi lại cùng mã thì trả đơn đã tạo */
  checkoutId: string;
  expiresAt: Date;
}

/** Lựa chọn của buyer lưu trong checkouts.input (đã đầy đủ: mỗi shop có mã hoặc null) */
interface CheckoutInput {
  itemIds: string[];
  addressId: string;
  shopVouchers: Record<string, string | null>;
  platformVoucherCode: string | null;
  paymentMethod: 'VNPAY' | 'COD';
}

/** Đầu vào của bước tính: undefined = tự chọn voucher giảm nhiều nhất */
interface ComputeInput {
  itemIds: string[];
  shopVouchers?: Record<string, string | null>;
  autoShopVouchers: boolean;
  platformVoucherCode?: string | null;
  paymentMethod: 'VNPAY' | 'COD';
}

export interface PlacedOrder {
  orderId: string;
  code: string;
  total: number;
  /** Trống với đơn COD */
  payBefore: Date | null;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const money = (n: number) => `${n.toLocaleString('vi-VN')}đ`;

/**
 * Checkout nhiều shop (ORD-01, FLOW-02). Bước xem trước tính giá hiện tại, voucher, phí ship và lưu bản
 * chụp vào `checkouts`; bước đặt hàng tính lại trong MỘT giao dịch, giữ tồn, giữ lượt voucher, tạo đơn
 * tổng + đơn con. Lỗi ở bất kỳ shop nào thì không tạo đơn nào.
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly settings: SettingsService,
    private readonly users: UserClient,
    private readonly shipping: ShippingFeeService,
    private readonly events: EventBus,
  ) {}

  async preview(
    buyer: AuthUser,
    authorization: string,
    dto: PreviewCheckoutDto,
  ): Promise<CheckoutPreview> {
    const address = await this.pickAddress(authorization, dto.addressId);
    let shopVouchers: Record<string, string | null> | undefined;
    if (dto.shopVouchers) {
      shopVouchers = {};
      for (const c of dto.shopVouchers) shopVouchers[c.shopId] = c.code ?? null;
    }
    const data = await this.compute(this.prisma, buyer.id, address, undefined, {
      itemIds: dto.itemIds,
      shopVouchers,
      autoShopVouchers: true,
      platformVoucherCode: dto.platformVoucherCode,
      paymentMethod: dto.paymentMethod ?? 'VNPAY',
    });
    const input: CheckoutInput = {
      paymentMethod: data.paymentMethod,
      itemIds: data.shops.flatMap((s) => s.items.map((i) => i.cartItemId)),
      addressId: address.id,
      shopVouchers: Object.fromEntries(
        data.shops.map((s) => [s.shop.id, s.shopVoucher?.code ?? null]),
      ),
      platformVoucherCode: data.platformVoucher?.code ?? null,
    };
    const expiresAt = new Date(Date.now() + this.config.checkoutPreviewMinutes * 60_000);
    const row = await this.prisma.checkout.create({
      data: {
        buyerId: buyer.id,
        input: input as unknown as Prisma.InputJsonValue,
        data: data as unknown as Prisma.InputJsonValue,
        total: data.total,
        expiresAt,
      },
    });
    return { ...data, checkoutId: row.id, expiresAt };
  }

  /**
   * Đặt hàng từ một bản xem trước. Trả `created = false` khi phiên này đã đặt rồi (bấm 2 lần, mạng chập):
   * trả lại đúng đơn cũ, không tạo đơn mới.
   */
  async place(buyer: AuthUser, checkoutId: string): Promise<PlacedOrder & { created: boolean }> {
    return this.prisma.$transaction(
      async (tx) => {
        // Mọi lần đặt hàng của cùng một buyer chạy lần lượt: bấm 2 lần không tạo 2 đơn,
        // giới hạn "mỗi người dùng voucher tối đa N lần" không bị vượt
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`place-order:${buyer.id}`}))`;
        const checkout = await tx.checkout.findFirst({
          where: { id: checkoutId, buyerId: buyer.id },
          include: { order: true },
        });
        if (!checkout) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy phiên đặt hàng.');
        if (checkout.order) {
          const o = checkout.order;
          return {
            orderId: o.id,
            code: o.code,
            total: o.total,
            payBefore: o.payBefore,
            created: false,
          };
        }
        if (checkout.expiresAt < new Date()) {
          throw new AppError(
            409,
            'CHECKOUT_EXPIRED',
            'Phiên đặt hàng đã hết hạn, bạn xem lại đơn rồi đặt lại.',
          );
        }
        const input = checkout.input as unknown as CheckoutInput;
        const snapshot = checkout.data as unknown as CheckoutData;
        const fees = new Map(
          snapshot.shops.map((s) => [
            s.shop.id,
            { fee: s.shippingFee, source: s.shippingFeeSource },
          ]),
        );
        const fresh = await this.compute(tx, buyer.id, snapshot.address, fees, {
          itemIds: input.itemIds,
          shopVouchers: input.shopVouchers,
          autoShopVouchers: false,
          platformVoucherCode: input.platformVoucherCode,
          paymentMethod: input.paymentMethod ?? 'VNPAY',
        });
        const changes = diff(snapshot, fresh);
        if (changes.length > 0) {
          throw new AppError(
            409,
            'CHECKOUT_CHANGED',
            'Đơn hàng có thay đổi so với lúc bạn xem, bạn xem lại rồi đặt lại.',
            { problems: changes },
          );
        }

        const order = await this.createOrder(tx, buyer, checkout.id, fresh);
        await tx.cartItem.deleteMany({ where: { userId: buyer.id, id: { in: input.itemIds } } });
        await tx.checkout.update({ where: { id: checkout.id }, data: { orderId: order.orderId } });
        return { ...order, created: true };
      },
      { timeout: 20_000 },
    );
  }

  // ----- tạo đơn trong giao dịch -----

  private async createOrder(
    tx: Prisma.TransactionClient,
    buyer: AuthUser,
    checkoutId: string,
    d: CheckoutData,
  ): Promise<PlacedOrder> {
    const s = await this.settings.values([
      MarketSetting.paymentMinutes,
      MarketSetting.stockHoldMinutes,
    ]);
    const now = new Date();
    const cod = d.paymentMethod === 'COD';
    // COD không có hạn thanh toán; trả trước: hạn thanh toán và hạn giữ tồn
    const payBefore = cod
      ? null
      : new Date(now.getTime() + s[MarketSetting.paymentMinutes]! * 60_000);
    const holdMinutes = Math.max(
      s[MarketSetting.stockHoldMinutes]!,
      s[MarketSetting.paymentMinutes]!,
    );
    const holdUntil = cod ? null : new Date(now.getTime() + holdMinutes * 60_000);

    // Giữ tồn (trả trước) hoặc trừ tồn ngay (COD): một câu SQL có điều kiện cho mỗi biến thể, nên hai
    // người tranh SKU cuối chỉ một người được
    const needed = new Map<string, { quantity: number; name: string }>();
    for (const line of d.shops.flatMap((x) => x.items)) {
      const cur = needed.get(line.variantId);
      needed.set(line.variantId, {
        quantity: (cur?.quantity ?? 0) + line.quantity,
        name: line.productName,
      });
    }
    for (const [variantId, { quantity, name }] of needed) {
      const ok = cod
        ? await tx.$executeRaw`
            UPDATE product_variants SET stock = stock - ${quantity}
            WHERE id = ${variantId}::uuid AND active AND stock - reserved >= ${quantity}`
        : await tx.$executeRaw`
            UPDATE product_variants SET reserved = reserved + ${quantity}
            WHERE id = ${variantId}::uuid AND active AND stock - reserved >= ${quantity}`;
      if (ok === 0) {
        throw new AppError(409, 'CHECKOUT_CHANGED', `"${name}" không còn đủ hàng.`, {
          problems: [`"${name}" không còn đủ hàng, người khác vừa mua.`],
        });
      }
    }

    // Giữ lượt voucher: chỉ tăng khi còn lượt và voucher đang chạy
    const vouchers = [
      ...d.shops.flatMap((x) => (x.shopVoucher ? [x.shopVoucher] : [])),
      ...(d.platformVoucher ? [d.platformVoucher] : []),
    ];
    for (const v of vouchers) {
      const ok = await tx.$executeRaw`
        UPDATE vouchers SET used_count = used_count + 1, updated_at = now()
        WHERE id = ${v.voucherId}::uuid AND used_count < quantity AND start_at <= now() AND end_at > now()`;
      if (ok === 0) {
        throw new AppError(409, 'CHECKOUT_CHANGED', `Voucher ${v.code} vừa hết lượt.`, {
          problems: [`Voucher ${v.code} vừa hết lượt hoặc hết hạn.`],
        });
      }
    }

    const code = await this.newOrderCode(tx, now);
    const shopRows = await tx.shop.findMany({
      where: { id: { in: d.shops.map((x) => x.shop.id) } },
      select: { id: true, ownerId: true },
    });
    const owners = new Map(shopRows.map((r) => [r.id, r.ownerId]));

    const order = await tx.order.create({
      data: {
        code,
        buyerId: buyer.id,
        buyerName: buyer.name,
        buyerEmail: buyer.email,
        receiverName: d.address.receiverName,
        receiverPhone: d.address.phone,
        provinceId: d.address.provinceId,
        districtId: d.address.districtId,
        wardCode: d.address.wardCode,
        address: d.address.fullAddress,
        platformVoucherId: d.platformVoucher?.voucherId ?? null,
        platformVoucherCode: d.platformVoucher?.code ?? null,
        platformDiscount: d.platformDiscount,
        subtotal: d.subtotal,
        shippingFee: d.shippingFee,
        total: d.total,
        paymentMethod: d.paymentMethod,
        paymentStatus: cod ? 'COD' : 'UNPAID',
        payBefore,
        holdUntil,
      },
    });
    if (d.platformVoucher) {
      await tx.voucherUsage.create({
        data: {
          voucherId: d.platformVoucher.voucherId,
          userId: buyer.id,
          orderId: order.id,
          amount: d.platformVoucher.discount,
        },
      });
    }

    const placed = [];
    for (const [i, shop] of d.shops.entries()) {
      const so = await tx.shopOrder.create({
        data: {
          code: `${code}-${i + 1}`,
          orderId: order.id,
          shopId: shop.shop.id,
          shopName: shop.shop.name,
          subtotal: shop.subtotal,
          shopVoucherId: shop.shopVoucher?.voucherId ?? null,
          shopVoucherCode: shop.shopVoucher?.code ?? null,
          shopDiscount: shop.shopDiscount,
          platformDiscount: shop.platformDiscount,
          shippingFee: shop.shippingFee,
          shippingFeeSource: shop.shippingFeeSource,
          total: shop.total,
          codAmount: cod ? shop.total : 0,
        },
      });
      if (cod) {
        // COD: tồn đã trừ hẳn lúc đặt, ghi lịch sử tồn và số đã bán
        for (const l of shop.items) {
          const v = await tx.productVariant.findUniqueOrThrow({
            where: { id: l.variantId },
            select: { stock: true },
          });
          await tx.stockHistory.create({
            data: {
              variantId: l.variantId,
              change: -l.quantity,
              stockAfter: v.stock,
              reason: `Bán đơn ${so.code} (COD)`,
              createdBy: buyer.id,
              orderId: order.id,
            },
          });
          await tx.$executeRaw`
            UPDATE products SET sold_count = sold_count + ${l.quantity}
            WHERE id = ${l.productId}::uuid`;
        }
      }
      const discounts = itemDiscounts(
        shop.items.map((l) => l.lineTotal),
        shop.shopDiscount + shop.platformDiscount,
      );
      await tx.orderItem.createMany({
        data: shop.items.map((l, j) => ({
          shopOrderId: so.id,
          productId: l.productId,
          variantId: l.variantId,
          productName: l.productName,
          variantName: l.variantName,
          image: l.image,
          price: l.price,
          originalPrice: l.originalPrice,
          quantity: l.quantity,
          weight: l.weight,
          discount: discounts[j]!,
        })),
      });
      await tx.orderHistory.create({
        data: {
          shopOrderId: so.id,
          toStatus: 'PENDING',
          actorType: 'BUYER',
          actorId: buyer.id,
          actorName: buyer.name,
          note: 'Đặt hàng',
        },
      });
      if (shop.shopVoucher) {
        await tx.voucherUsage.create({
          data: {
            voucherId: shop.shopVoucher.voucherId,
            userId: buyer.id,
            orderId: order.id,
            shopOrderId: so.id,
            amount: shop.shopVoucher.discount,
          },
        });
      }
      placed.push({
        shopOrderId: so.id,
        code: so.code,
        shopId: shop.shop.id,
        shopName: shop.shop.name,
        ownerId: owners.get(shop.shop.id)!,
        subtotal: shop.subtotal,
        shopDiscount: shop.shopDiscount,
        platformDiscount: shop.platformDiscount,
        shippingFee: shop.shippingFee,
        total: shop.total,
        items: shop.items.map((l) => ({
          name: l.productName,
          variant: l.variantName,
          price: l.price,
          quantity: l.quantity,
        })),
      });
    }

    await this.events.publish(tx, ORDER_PLACED, {
      orderId: order.id,
      code,
      buyer: { userId: buyer.id, name: buyer.name, email: buyer.email },
      paymentMethod: d.paymentMethod,
      total: order.total,
      payBefore: payBefore?.toISOString() ?? null,
      shippingProvince: d.address.provinceName,
      shopOrders: placed,
      placedAt: order.createdAt.toISOString(),
    });
    return { orderId: order.id, code, total: order.total, payBefore };
  }

  /** Mã đơn: ngày đặt theo giờ Việt Nam (YYMMDD) + 6 ký tự ngẫu nhiên, ví dụ 261011ABC123 */
  private async newOrderCode(tx: Prisma.TransactionClient, now: Date): Promise<string> {
    const vn = new Date(now.getTime() + 7 * 3600_000).toISOString();
    const day = vn.slice(2, 4) + vn.slice(5, 7) + vn.slice(8, 10);
    for (;;) {
      let rand = '';
      for (let i = 0; i < 6; i++) rand += CODE_CHARS[randomInt(CODE_CHARS.length)];
      const code = day + rand;
      if (!(await tx.order.findUnique({ where: { code }, select: { id: true } }))) return code;
    }
  }

  // ----- tính bản xem trước -----

  private async pickAddress(authorization: string, addressId?: string): Promise<CheckoutAddress> {
    const list = await this.users.addresses(authorization);
    if (list.length === 0) {
      throw new AppError(
        409,
        'ADDRESS_REQUIRED',
        'Bạn chưa có địa chỉ nhận hàng, hãy thêm địa chỉ.',
      );
    }
    const a: BuyerAddress | undefined = addressId
      ? list.find((x) => x.id === addressId)
      : (list.find((x) => x.isDefault) ?? list[0]);
    if (!a) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy địa chỉ này trong sổ địa chỉ.');
    return {
      id: a.id,
      receiverName: a.receiverName,
      phone: a.phone,
      provinceId: a.provinceId,
      districtId: a.districtId,
      wardCode: a.wardCode,
      provinceName: a.provinceName,
      fullAddress: [a.street, a.wardName, a.districtName, a.provinceName].join(', '),
    };
  }

  /**
   * Tính toàn bộ bản xem trước. `fees` có giá trị (lúc đặt hàng) thì dùng đúng phí ship đã chụp,
   * không gọi GHN lại.
   */
  private async compute(
    db: Db,
    buyerId: string,
    address: CheckoutAddress,
    fees: Map<string, ShippingQuote> | undefined,
    input: ComputeInput,
  ): Promise<CheckoutData> {
    const rows = await db.cartItem.findMany({
      where: { userId: buyerId, id: { in: input.itemIds } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        variant: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                status: true,
                weight: true,
                option1Name: true,
                images: {
                  select: { url: true, option1Value: true },
                  orderBy: [{ sort: 'asc' }, { id: 'asc' }],
                },
                shop: {
                  select: {
                    id: true,
                    name: true,
                    logoUrl: true,
                    status: true,
                    ownerId: true,
                    pickupDistrictId: true,
                    pickupWardCode: true,
                    codEnabled: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (rows.length === 0) {
      throw new AppError(400, 'EMPTY_CHECKOUT', 'Chưa chọn sản phẩm nào để đặt hàng.');
    }

    const problems: CheckoutProblem[] = [];
    const groups = new Map<
      string,
      { shop: (typeof rows)[number]['variant']['product']['shop']; items: CheckoutLine[] }
    >();
    for (const row of rows) {
      const v = row.variant;
      const p = v.product;
      const unavailable = !v.active || p.status !== 'ACTIVE' || p.shop.status !== 'ACTIVE';
      const available = unavailable ? 0 : Math.max(0, v.stock - v.reserved);
      const state: LineState =
        p.shop.ownerId === buyerId
          ? 'OWN_PRODUCT'
          : unavailable
            ? 'UNAVAILABLE'
            : available === 0
              ? 'OUT_OF_STOCK'
              : row.quantity > available
                ? 'NOT_ENOUGH_STOCK'
                : 'OK';
      const message = {
        OK: null,
        OWN_PRODUCT: `"${p.name}" là hàng của shop bạn, không mua được.`,
        UNAVAILABLE: `"${p.name}" hiện không còn bán.`,
        OUT_OF_STOCK: `"${p.name}" đã hết hàng.`,
        NOT_ENOUGH_STOCK: `"${p.name}" chỉ còn ${available} sản phẩm.`,
      }[state];
      if (message) problems.push({ cartItemId: row.id, message });

      const image =
        (v.option1Value && p.images.find((i) => i.option1Value === v.option1Value)) ||
        p.images.find((i) => !i.option1Value) ||
        p.images[0];
      let g = groups.get(p.shop.id);
      if (!g) {
        g = { shop: p.shop, items: [] };
        groups.set(p.shop.id, g);
      }
      g.items.push({
        cartItemId: row.id,
        variantId: v.id,
        productId: p.id,
        productName: p.name,
        variantName: [v.option1Value, v.option2Value].filter(Boolean).join(', '),
        image: image?.url ?? null,
        price: v.price,
        originalPrice: v.originalPrice,
        quantity: row.quantity,
        weight: p.weight,
        lineTotal: v.price * row.quantity,
        available,
        state,
      });
    }

    // Voucher đang chạy của các shop trong đơn + voucher sàn, kèm số lượt buyer đã dùng
    const now = new Date();
    const shopIds = [...groups.keys()];
    const running = await db.voucher.findMany({
      where: {
        OR: [{ shopId: { in: shopIds } }, { shopId: null }],
        startAt: { lte: now },
        endAt: { gt: now },
      },
      orderBy: [{ endAt: 'asc' }, { id: 'asc' }],
    });
    const typedCodes = [
      ...Object.values(input.shopVouchers ?? {}),
      input.platformVoucherCode ?? null,
    ].filter((c): c is string => Boolean(c));
    const typed = await db.voucher.findMany({ where: { code: { in: typedCodes } } });
    const allVouchers = [...running, ...typed.filter((t) => !running.some((r) => r.id === t.id))];
    const usage = await db.voucherUsage.groupBy({
      by: ['voucherId'],
      where: {
        userId: buyerId,
        returnedAt: null,
        voucherId: { in: allVouchers.map((v) => v.id) },
      },
      _count: { _all: true },
    });
    const usedByMe = new Map(usage.map((u) => [u.voucherId, u._count._all]));
    const evaluate = (v: Voucher, base: number) =>
      evaluateVoucher(v, base, now, usedByMe.get(v.id) ?? 0);

    const voucherErrors: VoucherError[] = [];
    const shops: CheckoutShop[] = [];
    for (const [shopId, g] of groups) {
      const subtotal = g.items.reduce((a, l) => a + l.lineTotal, 0);
      const options = running
        .filter((v) => v.shopId === shopId)
        .map((v) => toOption(v, evaluate(v, subtotal)));
      let applied: AppliedVoucher | null = null;
      const chosen = input.shopVouchers?.[shopId];
      if (chosen) {
        const v = typed.find((x) => x.code === chosen);
        const result = v && v.shopId === shopId ? evaluate(v, subtotal) : null;
        if (!v || v.shopId !== shopId) {
          voucherErrors.push({
            shopId,
            code: chosen,
            message: 'Mã này không phải voucher của shop.',
          });
        } else if (!result!.eligible) {
          voucherErrors.push({ shopId, code: chosen, message: result!.reason! });
        } else {
          applied = { voucherId: v.id, code: v.code, name: v.name, discount: result!.discount };
        }
      } else if (chosen === undefined && input.autoShopVouchers) {
        applied = best(
          running.filter((v) => v.shopId === shopId),
          (v) => evaluate(v, subtotal),
        );
      }

      const quote =
        fees?.get(shopId) ??
        (await this.shipping.quote({
          fromDistrictId: g.shop.pickupDistrictId ?? 0,
          fromWardCode: g.shop.pickupWardCode ?? '',
          toDistrictId: address.districtId,
          toWardCode: address.wardCode,
          weight: Math.max(
            1,
            g.items.reduce((a, l) => a + l.weight * l.quantity, 0),
          ),
        }));
      shops.push({
        shop: { id: shopId, name: g.shop.name ?? '', logoUrl: g.shop.logoUrl },
        items: g.items,
        subtotal,
        shopVoucher: applied,
        vouchers: options,
        shopDiscount: applied?.discount ?? 0,
        shippingFee: quote.fee,
        shippingFeeSource: quote.source,
        platformDiscount: 0,
        total: 0,
      });
    }

    // Voucher sàn: tính trên tổng tiền hàng sau voucher shop
    const base = shops.reduce((a, s) => a + s.subtotal - s.shopDiscount, 0);
    const platformRunning = running.filter((v) => v.shopId === null);
    const platformVouchers = platformRunning.map((v) => toOption(v, evaluate(v, base)));
    let platformVoucher: AppliedVoucher | null = null;
    const platformCode = input.platformVoucherCode;
    if (platformCode) {
      const v = typed.find((x) => x.code === platformCode);
      const result = v && v.shopId === null ? evaluate(v, base) : null;
      if (!v) {
        voucherErrors.push({
          shopId: null,
          code: platformCode,
          message: 'Mã voucher không tồn tại.',
        });
      } else if (v.shopId !== null) {
        voucherErrors.push({
          shopId: null,
          code: platformCode,
          message: 'Đây là voucher của shop, hãy chọn ở phần voucher của shop đó.',
        });
      } else if (!result!.eligible) {
        voucherErrors.push({ shopId: null, code: platformCode, message: result!.reason! });
      } else {
        platformVoucher = {
          voucherId: v.id,
          code: v.code,
          name: v.name,
          discount: result!.discount,
        };
      }
    } else if (platformCode === undefined) {
      platformVoucher = best(platformRunning, (v) => evaluate(v, base));
    }

    const totals = applyPlatformVoucher(shops, platformVoucher?.discount ?? 0);
    totals.shops.forEach((t, i) => {
      shops[i]!.platformDiscount = t.platformDiscount;
      shops[i]!.total = t.total;
    });

    // COD-01: chỉ chọn COD được khi mọi shop trong đơn đều nhận COD
    const noCod = [...groups.values()].filter((g) => !g.shop.codEnabled);
    if (input.paymentMethod === 'COD') {
      for (const g of noCod) {
        problems.push({
          cartItemId: null,
          message: `Shop "${g.shop.name ?? ''}" không nhận thanh toán khi nhận hàng (COD).`,
        });
      }
    }
    return {
      paymentMethod: input.paymentMethod,
      codAvailable: noCod.length === 0,
      address,
      shops,
      platformVoucher,
      platformVouchers,
      subtotal: shops.reduce((a, s) => a + s.subtotal, 0),
      shopDiscount: shops.reduce((a, s) => a + s.shopDiscount, 0),
      platformDiscount: platformVoucher?.discount ?? 0,
      shippingFee: shops.reduce((a, s) => a + s.shippingFee, 0),
      total: totals.total,
      problems,
      voucherErrors,
      canPlace: problems.length === 0,
    };
  }
}

interface VoucherResult {
  eligible: boolean;
  discount: number;
  reason: string | null;
}

/** Voucher có dùng được cho khoản `base` không, giảm bao nhiêu, nếu không thì vì sao */
export function evaluateVoucher(
  v: Voucher,
  base: number,
  now: Date,
  usedByMe: number,
): VoucherResult {
  const no = (reason: string): VoucherResult => ({ eligible: false, discount: 0, reason });
  if (now < v.startAt) return no('Voucher chưa bắt đầu.');
  if (now >= v.endAt) return no('Voucher đã hết hạn.');
  if (v.usedCount >= v.quantity) return no('Voucher đã hết lượt.');
  if (usedByMe >= v.perUserLimit) return no('Bạn đã dùng hết lượt của voucher này.');
  if (base < v.minOrder) return no(`Mua thêm ${money(v.minOrder - base)} để dùng mã này.`);
  const discount = voucherDiscount(v, base);
  if (discount <= 0) return no('Voucher không giảm được cho đơn này.');
  return { eligible: true, discount, reason: null };
}

function toOption(v: Voucher, r: VoucherResult): VoucherOption {
  return {
    code: v.code,
    name: v.name,
    discountType: v.discountType,
    value: v.value,
    maxDiscount: v.maxDiscount,
    minOrder: v.minOrder,
    endAt: v.endAt,
    discount: r.discount,
    eligible: r.eligible,
    reason: r.reason,
  };
}

/** Voucher giảm nhiều nhất trong số dùng được (bằng nhau thì cái hết hạn sớm hơn) */
function best(list: Voucher[], evaluate: (v: Voucher) => VoucherResult): AppliedVoucher | null {
  let pick: AppliedVoucher | null = null;
  for (const v of list) {
    const r = evaluate(v);
    if (r.eligible && (!pick || r.discount > pick.discount)) {
      pick = { voucherId: v.id, code: v.code, name: v.name, discount: r.discount };
    }
  }
  return pick;
}

/** Những điểm khác giữa bản xem trước và lúc đặt (câu tiếng Việt cho buyer) */
function diff(before: CheckoutData, now: CheckoutData): string[] {
  const out: string[] = [];
  for (const p of now.problems) out.push(p.message);
  for (const e of now.voucherErrors) out.push(`Voucher ${e.code}: ${e.message}`);
  if (out.length > 0) return out;

  const key = (d: CheckoutData) =>
    JSON.stringify(
      d.shops.map((s) => [
        s.shop.id,
        s.items.map((i) => [i.variantId, i.quantity, i.price]),
        s.shopVoucher?.code ?? null,
        s.shopDiscount,
        s.platformDiscount,
        s.shippingFee,
        s.total,
      ]),
    );
  if (key(before) !== key(now) || before.total !== now.total) {
    const lines = new Map(before.shops.flatMap((s) => s.items.map((i) => [i.cartItemId, i])));
    for (const s of now.shops) {
      for (const i of s.items) {
        const old = lines.get(i.cartItemId);
        if (!old) out.push(`Giỏ hàng có thay đổi ở "${i.productName}".`);
        else if (old.price !== i.price) {
          out.push(`Giá "${i.productName}" đổi từ ${money(old.price)} thành ${money(i.price)}.`);
        } else if (old.quantity !== i.quantity) {
          out.push(`Số lượng "${i.productName}" trong giỏ đã đổi.`);
        }
      }
    }
    if (before.shops.flatMap((s) => s.items).length !== now.shops.flatMap((s) => s.items).length) {
      out.push('Giỏ hàng có dòng mới thêm hoặc vừa bị xóa.');
    }
    if (out.length === 0)
      out.push(`Tổng tiền đổi từ ${money(before.total)} thành ${money(now.total)}.`);
  }
  return out;
}
