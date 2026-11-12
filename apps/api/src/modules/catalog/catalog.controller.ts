import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthContext } from '../../common/auth-context';
import { Auth, Roles } from '../../common/decorators';
import { uuid } from '../../common/schemas';
import { ZodPipe } from '../../common/zod.pipe';
import {
  CreateCategoryInput,
  createCategorySchema,
  CreateIngredientInput,
  createIngredientSchema,
  CreateProductInput,
  createProductSchema,
  listCategoriesQuery,
  ListIngredientsQuery,
  listIngredientsQuery,
  ListProductsQuery,
  listProductsQuery,
  SetRecipeInput,
  setRecipeSchema,
  SetWeightMixInput,
  setWeightMixSchema,
  UpdateCategoryInput,
  updateCategorySchema,
  UpdateIngredientInput,
  updateIngredientSchema,
  UpdateProductInput,
  updateProductSchema,
} from './catalog.schemas';
import { CatalogService } from './catalog.service';

const idPipe = new ZodPipe(uuid);
const ADMIN = ['OWNER', 'MANAGER'] as const;

@Controller('categories')
export class CategoriesController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(listCategoriesQuery)) q: z.infer<typeof listCategoriesQuery>,
  ) {
    return this.catalog.listCategories(auth, q.kind);
  }

  @Roles(...ADMIN)
  @Post()
  create(@Auth() auth: AuthContext, @Body(new ZodPipe(createCategorySchema)) body: CreateCategoryInput) {
    return this.catalog.createCategory(auth, body);
  }

  @Roles(...ADMIN)
  @Patch(':id')
  update(
    @Auth() auth: AuthContext,
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(updateCategorySchema)) body: UpdateCategoryInput,
  ) {
    return this.catalog.updateCategory(auth, id, body);
  }

  @Roles(...ADMIN)
  @HttpCode(204)
  @Delete(':id')
  remove(@Auth() auth: AuthContext, @Param('id', idPipe) id: string) {
    return this.catalog.deleteCategory(auth, id);
  }
}

@Controller('ingredients')
export class IngredientsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(@Auth() auth: AuthContext, @Query(new ZodPipe(listIngredientsQuery)) q: ListIngredientsQuery) {
    return this.catalog.listIngredients(auth, q);
  }

  @Get(':id')
  get(@Auth() auth: AuthContext, @Param('id', idPipe) id: string) {
    return this.catalog.getIngredient(auth, id);
  }

  @Roles(...ADMIN)
  @Post()
  create(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(createIngredientSchema)) body: CreateIngredientInput,
  ) {
    return this.catalog.createIngredient(auth, body);
  }

  @Roles(...ADMIN)
  @Patch(':id')
  update(
    @Auth() auth: AuthContext,
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(updateIngredientSchema)) body: UpdateIngredientInput,
  ) {
    return this.catalog.updateIngredient(auth, id, body);
  }

  @Roles(...ADMIN)
  @Delete(':id')
  remove(@Auth() auth: AuthContext, @Param('id', idPipe) id: string) {
    return this.catalog.deleteIngredient(auth, id);
  }
}

@Controller('products')
export class ProductsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(@Auth() auth: AuthContext, @Query(new ZodPipe(listProductsQuery)) q: ListProductsQuery) {
    return this.catalog.listProducts(auth, q);
  }

  @Get(':id')
  get(@Auth() auth: AuthContext, @Param('id', idPipe) id: string) {
    return this.catalog.getProduct(auth, id);
  }

  @Roles(...ADMIN)
  @Post()
  create(@Auth() auth: AuthContext, @Body(new ZodPipe(createProductSchema)) body: CreateProductInput) {
    return this.catalog.createProduct(auth, body);
  }

  @Roles(...ADMIN)
  @Patch(':id')
  update(
    @Auth() auth: AuthContext,
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(updateProductSchema)) body: UpdateProductInput,
  ) {
    return this.catalog.updateProduct(auth, id, body);
  }

  @Roles(...ADMIN)
  @Delete(':id')
  remove(@Auth() auth: AuthContext, @Param('id', idPipe) id: string) {
    return this.catalog.deleteProduct(auth, id);
  }

  @Roles(...ADMIN)
  @Put(':id/recipe')
  setRecipe(
    @Auth() auth: AuthContext,
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(setRecipeSchema)) body: SetRecipeInput,
  ) {
    return this.catalog.setRecipe(auth, id, body);
  }

  @Roles(...ADMIN)
  @Put(':id/weight-mix')
  setWeightMix(
    @Auth() auth: AuthContext,
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(setWeightMixSchema)) body: SetWeightMixInput,
  ) {
    return this.catalog.setWeightMix(auth, id, body);
  }
}
