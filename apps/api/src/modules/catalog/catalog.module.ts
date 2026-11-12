import { Module } from '@nestjs/common';
import {
  CategoriesController,
  IngredientsController,
  ProductsController,
} from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [CategoriesController, IngredientsController, ProductsController],
  providers: [CatalogService],
})
export class CatalogModule {}
