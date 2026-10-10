import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  ParseIdPipe,
  Public,
  RequirePermissions,
  type AuthUser,
} from '@san/nest-common';
import {
  CategoriesService,
  type AdminCategory,
  type AdminCategoryNode,
  type CategoryNode,
} from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

/** Cây danh mục cho thanh danh mục và mega menu (CAT-01). Không cần đăng nhập. */
@ApiTags('Danh mục')
@Public()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** Danh mục chưa ẩn: cấp 1 (có icon lucide) kèm `children` cấp 2, theo thứ tự */
  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  tree(): Promise<CategoryNode[]> {
    return this.categories.tree();
  }
}

/** Quản lý danh mục (CAT-01): bộ quyền MODERATION, mọi thay đổi ghi nhật ký */
@ApiTags('Admin › Danh mục')
@ApiBearerAuth()
@RequirePermissions('MODERATION')
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  /** Cả danh mục ẩn: cấp 1 kèm `children`, mỗi mục có số sản phẩm đang gắn */
  @Get()
  list(): Promise<AdminCategoryNode[]> {
    return this.categories.adminTree();
  }

  @Post()
  @HttpCode(201)
  @ApiResponse({ status: 400, description: 'INVALID_PARENT: danh mục cha không phải cấp 1' })
  @ApiResponse({ status: 409, description: 'SLUG_TAKEN: slug đã có danh mục khác dùng' })
  create(@CurrentUser() admin: AuthUser, @Body() dto: CreateCategoryDto): Promise<AdminCategory> {
    return this.categories.create(admin, dto);
  }

  /** Sửa tên, slug, icon, thứ tự, ẩn/hiện, đổi danh mục cha */
  @Patch(':categoryId')
  @ApiResponse({ status: 400, description: 'INVALID_PARENT: danh mục cha không phải cấp 1' })
  @ApiResponse({
    status: 409,
    description:
      'SLUG_TAKEN; CATEGORY_HAS_CHILDREN: cấp 1 đang có con không thành cấp 2; CATEGORY_IN_USE: cấp 2 có sản phẩm không thành cấp 1',
  })
  update(
    @CurrentUser() admin: AuthUser,
    @Param('categoryId', ParseIdPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<AdminCategory> {
    return this.categories.update(admin, id, dto);
  }

  /** Chỉ xóa được khi không có danh mục con và chưa sản phẩm nào gắn */
  @Delete(':categoryId')
  @HttpCode(204)
  @ApiResponse({
    status: 409,
    description: 'CATEGORY_IN_USE: còn danh mục con hoặc sản phẩm, hãy ẩn thay vì xóa',
  })
  remove(
    @CurrentUser() admin: AuthUser,
    @Param('categoryId', ParseIdPipe) id: string,
  ): Promise<void> {
    return this.categories.remove(admin, id);
  }
}
