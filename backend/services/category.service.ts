import type { CategoryKind } from '@prisma/client';
import { withContext, type Tx } from '@/config/database';
import { categoryRepository, type CategoryRepository } from '@/repositories/category.repository';
import type { AuthContext } from '@/types/auth.types';
import type { CreateCategoryDTO, UpdateCategoryDTO } from '@/types/category.types';
import { AppError } from '@/utils/app-error';

export class CategoryService {
  constructor(private readonly repository: CategoryRepository) {}

  list(auth: AuthContext, kind?: CategoryKind) {
    return withContext(auth, (tx) => this.repository.list(tx, auth.tenantId, kind));
  }

  create(auth: AuthContext, input: CreateCategoryDTO) {
    return withContext(auth, (tx) =>
      this.repository.create(tx, { ...input, tenantId: auth.tenantId }),
    );
  }

  update(auth: AuthContext, id: string, input: UpdateCategoryDTO) {
    return withContext(auth, async (tx) => {
      await this.getOrFail(tx, auth.tenantId, id);
      return this.repository.update(tx, id, input);
    });
  }

  remove(auth: AuthContext, id: string) {
    return withContext(auth, async (tx) => {
      await this.getOrFail(tx, auth.tenantId, id);
      await this.repository.delete(tx, id);
    });
  }

  /** Garante que a categoria existe NESTE estabelecimento e é do tipo certo (FK sozinha não garante). */
  async ensureExists(
    tx: Tx,
    tenantId: string,
    categoryId: string | null | undefined,
    kind: CategoryKind,
  ): Promise<void> {
    if (!categoryId) return;
    const category = await this.repository.findById(tx, tenantId, categoryId, kind);
    if (!category) throw new AppError('Categoria inválida', 400);
  }

  private async getOrFail(tx: Tx, tenantId: string, id: string) {
    const category = await this.repository.findById(tx, tenantId, id);
    if (!category) throw new AppError('Registro não encontrado', 404);
    return category;
  }
}

export const categoryService = new CategoryService(categoryRepository);
