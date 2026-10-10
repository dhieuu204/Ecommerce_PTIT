import { Injectable } from '@nestjs/common';
import { AppError, writeAudit, type AuthUser } from '@san/nest-common';
import { PrismaService } from '../prisma.service';
import { Prisma, type Category } from '../../generated/prisma';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

/** Danh mục cấp 2 trên menu */
export interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

/** Danh mục cấp 1 kèm danh mục con (GET /categories) */
export interface CategoryNode extends CategoryItem {
  children: CategoryItem[];
}

/** Một danh mục ở trang admin */
export interface AdminCategory {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  icon: string | null;
  sort: number;
  hidden: boolean;
  /** Số sản phẩm đang gắn (mọi trạng thái). Danh mục cấp 1: tổng của các danh mục con */
  productCount: number;
  createdAt: Date;
}

/** Danh mục cấp 1 ở trang admin, kèm danh mục con */
export interface AdminCategoryNode extends AdminCategory {
  children: AdminCategory[];
}

const ORDER: Prisma.CategoryOrderByWithRelationInput[] = [{ sort: 'asc' }, { name: 'asc' }];

const isUniqueViolation = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

const slugTaken = () => new AppError(409, 'SLUG_TAKEN', 'Slug này đã có danh mục khác dùng.');
const notFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy danh mục.');

/** Danh mục 2 cấp (CAT-01): cây cho menu, quản lý ở trang admin */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cây danh mục chưa ẩn cho menu: cấp 1 kèm con, theo thứ tự rồi theo tên */
  async tree(): Promise<CategoryNode[]> {
    const roots = await this.prisma.category.findMany({
      where: { parentId: null, hidden: false },
      orderBy: ORDER,
      include: { children: { where: { hidden: false }, orderBy: ORDER } },
    });
    const item = (c: Category): CategoryItem => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
    });
    return roots.map((r) => ({ ...item(r), children: r.children.map(item) }));
  }

  /** Cả danh mục ẩn, kèm số sản phẩm */
  async adminTree(): Promise<AdminCategoryNode[]> {
    const [all, counts] = await Promise.all([
      this.prisma.category.findMany({ orderBy: ORDER }),
      this.prisma.product.groupBy({ by: ['categoryId'], _count: { _all: true } }),
    ]);
    const countOf = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    const view = (c: Category): AdminCategory => this.adminView(c, countOf.get(c.id) ?? 0);
    return all
      .filter((c) => c.parentId === null)
      .map((root) => {
        const children = all.filter((c) => c.parentId === root.id).map(view);
        const node = view(root);
        node.productCount += children.reduce((sum, c) => sum + c.productCount, 0);
        return { ...node, children };
      });
  }

  async create(admin: AuthUser, dto: CreateCategoryDto): Promise<AdminCategory> {
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        if (dto.parentId) await this.checkParent(tx, dto.parentId);
        await this.ensureSlugFree(tx, dto.slug);
        const category = await tx.category.create({
          data: {
            name: dto.name,
            slug: dto.slug,
            parentId: dto.parentId ?? null,
            icon: dto.icon ?? null,
            sort: dto.sort ?? 0,
          },
        });
        await writeAudit(tx, {
          actor: admin,
          action: 'CREATE_CATEGORY',
          targetType: 'CATEGORY',
          targetId: category.id,
          after: this.auditFields(category),
        });
        return category;
      });
      return this.adminView(created, 0);
    } catch (e) {
      throw isUniqueViolation(e) ? slugTaken() : e;
    }
  }

  async update(admin: AuthUser, id: string, dto: UpdateCategoryDto): Promise<AdminCategory> {
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const before = await tx.category.findUnique({ where: { id } });
        if (!before) throw notFound();

        const data: Prisma.CategoryUncheckedUpdateInput = {};
        if (dto.name != null) data.name = dto.name;
        if (dto.icon !== undefined) data.icon = dto.icon;
        if (dto.sort != null) data.sort = dto.sort;
        if (dto.hidden != null) data.hidden = dto.hidden;
        if (dto.slug != null && dto.slug !== before.slug) {
          await this.ensureSlugFree(tx, dto.slug);
          data.slug = dto.slug;
        }
        if (dto.parentId !== undefined && dto.parentId !== before.parentId) {
          if (dto.parentId === null) {
            // Cấp 2 thành cấp 1: sản phẩm chỉ gắn vào cấp 2 nên danh mục phải chưa có sản phẩm
            if (await tx.product.count({ where: { categoryId: id } })) {
              throw new AppError(
                409,
                'CATEGORY_IN_USE',
                'Danh mục đang có sản phẩm nên không chuyển thành danh mục cấp 1 được.',
              );
            }
          } else {
            if (dto.parentId === id) {
              throw new AppError(400, 'INVALID_PARENT', 'Danh mục không làm cha của chính nó.');
            }
            await this.checkParent(tx, dto.parentId);
            if (await tx.category.count({ where: { parentId: id } })) {
              throw new AppError(
                409,
                'CATEGORY_HAS_CHILDREN',
                'Danh mục cấp 1 đang có danh mục con nên không chuyển thành cấp 2 được.',
              );
            }
          }
          data.parentId = dto.parentId;
        }

        const after = await tx.category.update({ where: { id }, data });
        const changed = Object.keys(data) as Array<keyof Category>;
        if (changed.length > 0) {
          await writeAudit(tx, {
            actor: admin,
            action: 'UPDATE_CATEGORY',
            targetType: 'CATEGORY',
            targetId: id,
            before: Object.fromEntries(changed.map((k) => [k, before[k]])),
            after: Object.fromEntries(changed.map((k) => [k, after[k]])),
          });
        }
        return after;
      });
      return this.adminView(updated, await this.countProducts(updated));
    } catch (e) {
      throw isUniqueViolation(e) ? slugTaken() : e;
    }
  }

  /** Chỉ xóa khi không có danh mục con và chưa sản phẩm nào gắn */
  async remove(admin: AuthUser, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const category = await tx.category.findUnique({ where: { id } });
      if (!category) throw notFound();
      const [children, products] = await Promise.all([
        tx.category.count({ where: { parentId: id } }),
        tx.product.count({ where: { categoryId: id } }),
      ]);
      if (children || products) {
        throw new AppError(
          409,
          'CATEGORY_IN_USE',
          children
            ? 'Danh mục đang có danh mục con nên không xóa được. Bạn có thể ẩn danh mục thay vì xóa.'
            : 'Danh mục đã có sản phẩm nên không xóa được. Bạn có thể ẩn danh mục thay vì xóa.',
        );
      }
      await tx.category.delete({ where: { id } });
      await writeAudit(tx, {
        actor: admin,
        action: 'DELETE_CATEGORY',
        targetType: 'CATEGORY',
        targetId: id,
        before: this.auditFields(category),
      });
    });
  }

  // ----- phần dùng chung -----

  /** Cha phải là danh mục cấp 1 đang có */
  private async checkParent(tx: Prisma.TransactionClient, parentId: string): Promise<void> {
    const parent = await tx.category.findUnique({ where: { id: parentId } });
    if (!parent || parent.parentId !== null) {
      throw new AppError(400, 'INVALID_PARENT', 'Danh mục cha phải là một danh mục cấp 1.');
    }
  }

  private async ensureSlugFree(tx: Prisma.TransactionClient, slug: string): Promise<void> {
    if (await tx.category.findUnique({ where: { slug } })) throw slugTaken();
  }

  private async countProducts(c: Category): Promise<number> {
    return this.prisma.product.count({
      where: c.parentId ? { categoryId: c.id } : { category: { parentId: c.id } },
    });
  }

  private auditFields(c: Category) {
    return {
      name: c.name,
      slug: c.slug,
      parentId: c.parentId,
      icon: c.icon,
      sort: c.sort,
      hidden: c.hidden,
    };
  }

  private adminView(c: Category, productCount: number): AdminCategory {
    return {
      id: c.id,
      parentId: c.parentId,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      sort: c.sort,
      hidden: c.hidden,
      productCount,
      createdAt: c.createdAt,
    };
  }
}
