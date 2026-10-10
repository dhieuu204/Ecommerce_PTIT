import { Module } from '@nestjs/common';
import { AdminCategoriesController, CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

/** Danh mục 2 cấp (CAT-01) */
@Module({
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
