import type { Prisma } from '@prisma/client';
import type { Tx } from '@/config/database';

/** Lotes de importação de histórico e as vendas que eles criaram. */
export class SaleImportRepository {
  /** Produtos que podem receber vendas importadas (inclusive inativos: histórico antigo). */
  listProducts(tx: Tx, tenantId: string) {
    return tx.product.findMany({
      where: { tenantId },
      select: { id: true, name: true, pricingMode: true, price: true, active: true },
    });
  }

  /** Lote ATIVO com o mesmo conteúdo (o mesmo arquivo não entra duas vezes). */
  findActiveByHash(tx: Tx, tenantId: string, contentHash: string) {
    return tx.saleImport.findFirst({
      where: { tenantId, contentHash, undoneAt: null },
      select: { id: true, fileName: true, createdAt: true, rows: true },
    });
  }

  /** Vendas concluídas já existentes no período (qualquer origem): risco de duplicar. */
  countSalesBetween(tx: Tx, tenantId: string, from: Date, to: Date) {
    return tx.sale.count({
      where: { tenantId, status: 'COMPLETED', soldAt: { gte: from, lt: to } },
    });
  }

  createBatch(tx: Tx, data: Prisma.SaleImportUncheckedCreateInput) {
    return tx.saleImport.create({ data });
  }

  createSales(tx: Tx, data: Prisma.SaleCreateManyInput[]) {
    return tx.sale.createMany({ data });
  }

  createItems(tx: Tx, data: Prisma.SaleItemCreateManyInput[]) {
    return tx.saleItem.createMany({ data });
  }

  list(tx: Tx, tenantId: string) {
    return tx.saleImport.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  findById(tx: Tx, tenantId: string, id: string) {
    return tx.saleImport.findFirst({ where: { id, tenantId } });
  }

  /** Desfaz um lote: CANCELA as vendas dele (nada é apagado) e marca o lote como desfeito. */
  async undo(tx: Tx, tenantId: string, id: string, userId: string) {
    const now = new Date();
    const marked = await tx.saleImport.updateMany({
      where: { id, tenantId, undoneAt: null },
      data: { undoneAt: now, undoneById: userId },
    });
    if (!marked.count) return null;
    const canceled = await tx.sale.updateMany({
      where: { tenantId, importId: id, status: 'COMPLETED' },
      data: {
        status: 'CANCELED',
        canceledAt: now,
        canceledById: userId,
        cancelReason: 'Importação desfeita',
      },
    });
    return canceled.count;
  }
}

export const saleImportRepository = new SaleImportRepository();
