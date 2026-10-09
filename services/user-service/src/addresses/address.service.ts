import { Injectable } from '@nestjs/common';
import { AppError } from '@san/nest-common';
import { AppConfig } from '../config';
import { PrismaService } from '../prisma.service';
import type { Address, Prisma } from '../../generated/prisma';
import type { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import { LocationsClient } from './locations.client';

/** Địa chỉ trả về (không có userId) */
export type AddressView = Omit<Address, 'userId'>;

function view({ userId: _userId, ...rest }: Address): AddressView {
  return rest;
}

/**
 * Sổ địa chỉ (ACC-04): tối đa 10 địa chỉ, luôn đúng 1 địa chỉ mặc định khi sổ không rỗng.
 * Database có chỉ mục "mỗi người tối đa 1 địa chỉ mặc định" làm chốt chặn cuối.
 */
@Injectable()
export class AddressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly locations: LocationsClient,
  ) {}

  /** Mặc định lên đầu, còn lại mới nhất trước */
  async list(userId: string): Promise<AddressView[]> {
    const rows = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map(view);
  }

  async create(userId: string, dto: CreateAddressDto): Promise<AddressView> {
    const names = await this.locations.resolve(dto.provinceId, dto.districtId, dto.wardCode);
    const { isDefault, ...fields } = dto;
    return this.prisma.$transaction(async (tx) => {
      // Khóa dòng user để hai lần thêm cùng lúc không vượt giới hạn hoặc cùng thành mặc định
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const count = await tx.address.count({ where: { userId } });
      if (count >= this.config.maxAddresses) {
        throw new AppError(
          409,
          'ADDRESS_LIMIT',
          `Bạn đã có ${this.config.maxAddresses} địa chỉ. Hãy xóa bớt trước khi thêm.`,
        );
      }
      const makeDefault = count === 0 || isDefault === true;
      if (makeDefault) await this.clearDefault(tx, userId);
      const row = await tx.address.create({
        data: { ...fields, ...names, userId, isDefault: makeDefault },
      });
      return view(row);
    });
  }

  async update(userId: string, addressId: string, dto: UpdateAddressDto): Promise<AddressView> {
    await this.findOwn(userId, addressId);
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined && v !== null),
    ) as UpdateAddressDto;
    const { provinceId, districtId, wardCode } = changes;
    const locationParts = [provinceId, districtId, wardCode].filter((v) => v !== undefined);
    let names = {};
    if (locationParts.length > 0) {
      if (locationParts.length < 3) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
          fields: { wardCode: 'Đổi khu vực thì chọn đủ tỉnh/thành, quận/huyện, phường/xã.' },
        });
      }
      names = await this.locations.resolve(provinceId!, districtId!, wardCode!);
    }
    const row = await this.prisma.address.update({
      where: { id: addressId },
      data: { ...changes, ...names },
    });
    return view(row);
  }

  /** Xóa. Xóa địa chỉ mặc định thì địa chỉ mới nhất còn lại thành mặc định. */
  async remove(userId: string, addressId: string): Promise<void> {
    const address = await this.findOwn(userId, addressId);
    await this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id: addressId } });
      if (!address.isDefault) return;
      const newest = await tx.address.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      if (newest) await tx.address.update({ where: { id: newest.id }, data: { isDefault: true } });
    });
  }

  async setDefault(userId: string, addressId: string): Promise<void> {
    const address = await this.findOwn(userId, addressId);
    if (address.isDefault) return;
    await this.prisma.$transaction(async (tx) => {
      await this.clearDefault(tx, userId);
      await tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
    });
  }

  private clearDefault(tx: Prisma.TransactionClient, userId: string) {
    return tx.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
  }

  /** Địa chỉ của người khác cũng trả 404, không lộ là có tồn tại. */
  private async findOwn(userId: string, addressId: string): Promise<Address> {
    const address = await this.prisma.address.findFirst({ where: { id: addressId, userId } });
    if (!address) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy địa chỉ.');
    return address;
  }
}
