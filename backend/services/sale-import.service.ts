/**
 * Importação de vendas históricas (caderno, planilha, outro sistema) a partir de CSV.
 *
 * Decisão (ver docs/extensao-2026-2/02-arquitetura.md):
 * - Cada linha vira uma venda CONCLUÍDA com origem IMPORT, ligada ao lote.
 * - Venda importada NÃO gera movimentação de estoque: o saldo atual (contado/lançado no
 *   sistema) não muda. Ela entra no histórico de vendas, nos relatórios e na previsão de
 *   demanda de produtos.
 * - Só datas até ONTEM (o caixa de hoje não muda) e até 5 anos atrás.
 * - Tudo ou nada: com qualquer erro, nada é importado. O mesmo conteúdo não entra duas vezes
 *   (hash), e importar num período que já tem vendas exige confirmação explícita.
 * - Desfazer = cancelar as vendas do lote (com motivo). Nada é apagado.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { Prisma as P } from '@prisma/client';
import { withContext, type Tx } from '@/config/database';
import {
  saleImportRepository,
  type SaleImportRepository,
} from '@/repositories/sale-import.repository';
import { tenantRepository, type TenantRepository } from '@/repositories/tenant.repository';
import { auditService, type AuditService } from '@/services/audit.service';
import type { AuthContext } from '@/types/auth.types';
import { AppError } from '@/utils/app-error';
import { addDays, startOfDayIn, todayIn } from '@/utils/date';
import { MAX_IMPORT_YEARS } from '@/validations/sale-import.validation';
import {
  contentHash,
  parseRows,
  summarizeRows,
  type SaleImportDTO,
} from '@/services/sale-import-parser';

/** Quantos erros a pré-visualização lista (a contagem total vem em `errorCount`). */
const MAX_ERRORS_SHOWN = 200;

export class SaleImportService {
  constructor(
    private readonly imports: SaleImportRepository,
    private readonly tenants: TenantRepository,
    private readonly audit: AuditService,
  ) {}

  /** Pré-visualização: o mesmo resultado da análise, sem as linhas convertidas (internas). */
  preview(auth: AuthContext, input: SaleImportDTO) {
    return withContext(auth, async (tx) => {
      const a = await this.analyze(tx, auth, input);
      return {
        fileName: a.fileName,
        totalRows: a.totalRows,
        validRows: a.validRows,
        errorCount: a.errorCount,
        errors: a.errors,
        warnings: a.warnings,
        summary: a.summary,
        overlap: a.overlap,
        alreadyImported: a.alreadyImported,
        canImport: a.canImport,
      };
    });
  }

  /** Grava o lote (tudo ou nada), depois de validar de novo no servidor. */
  commit(auth: AuthContext, input: SaleImportDTO) {
    return withContext(auth, async (tx) => {
      const a = await this.analyze(tx, auth, input);
      if (a.errorCount) {
        throw new AppError(
          'O arquivo tem linhas com erro: nada foi importado',
          422,
          'IMPORT_INVALID',
        );
      }
      if (a.alreadyImported) {
        throw new AppError('Este histórico já foi importado', 409, 'IMPORT_DUPLICATE');
      }
      if (a.overlap.existingSales > 0 && !input.allowOverlap) {
        throw new AppError(
          `Já existem ${a.overlap.existingSales} vendas nesse período. Confirme para importar mesmo assim.`,
          409,
          'IMPORT_OVERLAP',
        );
      }

      const { timezone } = a;
      const batch = await this.imports.createBatch(tx, {
        tenantId: auth.tenantId,
        fileName: input.fileName,
        contentHash: a.contentHash,
        rows: a.parsed.length,
        firstDay: new Date(`${a.summary.period.first}T00:00:00Z`),
        lastDay: new Date(`${a.summary.period.last}T00:00:00Z`),
        totalAmount: new P.Decimal(a.summary.totalAmount),
        createdById: auth.userId,
      });

      const sales: Prisma.SaleCreateManyInput[] = [];
      const items: Prisma.SaleItemCreateManyInput[] = [];
      for (const r of a.parsed) {
        const id = randomUUID();
        const [hh, mm] = r.time.split(':').map(Number);
        const soldAt = new Date(startOfDayIn(r.day, timezone).getTime() + (hh * 60 + mm) * 60_000);
        sales.push({
          id,
          tenantId: auth.tenantId,
          channel: r.channel,
          soldAt,
          totalAmount: new P.Decimal(r.total),
          totalWeightG: r.weightG === null ? null : new P.Decimal(r.weightG),
          paymentMethod: r.paymentMethod,
          notes: `Importada (${input.fileName}, linha ${r.line})`.slice(0, 500),
          createdById: auth.userId,
          source: 'IMPORT',
          importId: batch.id,
        });
        items.push({
          tenantId: auth.tenantId,
          saleId: id,
          productId: r.productId,
          quantity: new P.Decimal(r.quantity),
          unitPrice: new P.Decimal(r.total / r.quantity).toDecimalPlaces(2),
          weightG: r.weightG === null ? null : new P.Decimal(r.weightG),
        });
      }
      await this.imports.createSales(tx, sales);
      await this.imports.createItems(tx, items);
      await this.audit.log(tx, auth, 'sales.import', 'sale_import', batch.id, {
        fileName: input.fileName,
        rows: a.parsed.length,
        totalAmount: a.summary.totalAmount,
        first: a.summary.period.first,
        last: a.summary.period.last,
      });
      return { id: batch.id, imported: a.parsed.length, ...a.summary };
    });
  }

  list(auth: AuthContext) {
    return withContext(auth, (tx) => this.imports.list(tx, auth.tenantId));
  }

  undo(auth: AuthContext, id: string) {
    return withContext(auth, async (tx) => {
      const batch = await this.imports.findById(tx, auth.tenantId, id);
      if (!batch) throw new AppError('Importação não encontrada', 404);
      const canceled = await this.imports.undo(tx, auth.tenantId, id, auth.userId);
      if (canceled === null) throw new AppError('Esta importação já foi desfeita', 409);
      await this.audit.log(tx, auth, 'sales.import_undo', 'sale_import', id, { canceled });
      return { id, canceled };
    });
  }

  private async analyze(tx: Tx, auth: AuthContext, input: SaleImportDTO) {
    const timezone = await this.tenants.findTimezone(tx, auth.tenantId);
    const today = todayIn(timezone);
    const maxDay = addDays(today, -1);
    const minDay = addDays(today, -366 * MAX_IMPORT_YEARS);
    const products = await this.imports.listProducts(tx, auth.tenantId);
    const { valid, errors } = parseRows(input.rows, products, input.defaults, { minDay, maxDay });
    const summary = summarizeRows(valid, products);
    const hash = contentHash(valid);
    const alreadyImported = valid.length
      ? await this.imports.findActiveByHash(tx, auth.tenantId, hash)
      : null;
    const existingSales =
      summary.period.first && summary.period.last
        ? await this.imports.countSalesBetween(
            tx,
            auth.tenantId,
            startOfDayIn(summary.period.first, timezone),
            startOfDayIn(addDays(summary.period.last, 1), timezone),
          )
        : 0;

    const warnings: string[] = [];
    if (existingSales > 0)
      warnings.push(
        `Já existem ${existingSales} vendas registradas entre ${summary.period.first} e ${summary.period.last}: importar pode duplicar o histórico.`,
      );
    if (summary.identicalRows > 0)
      warnings.push(
        `${summary.identicalRows} linha(s) idênticas a outra (mesmo dia, hora, produto e valor). Podem ser vendas iguais de verdade ou digitação repetida: confira antes de importar.`,
      );
    if (summary.period.daysWithoutRows > 0)
      warnings.push(
        `${summary.period.daysWithoutRows} dia(s) sem nenhuma venda no período. Se a loja abriu nesses dias, faltam registros (a previsão vai entender como dia sem venda).`,
      );
    if (summary.totalFromPrice > 0)
      warnings.push(
        `${summary.totalFromPrice} linha(s) sem valor: calculado pelo preço ATUAL do produto.`,
      );
    if (alreadyImported) warnings.push('Este mesmo conteúdo já foi importado antes.');

    return {
      timezone,
      parsed: valid,
      contentHash: hash,
      fileName: input.fileName,
      totalRows: input.rows.length,
      validRows: valid.length,
      errorCount: errors.length,
      errors: errors.slice(0, MAX_ERRORS_SHOWN),
      warnings,
      summary,
      overlap: { existingSales },
      alreadyImported,
      canImport: errors.length === 0 && valid.length > 0 && !alreadyImported,
    };
  }
}

export const saleImportService = new SaleImportService(
  saleImportRepository,
  tenantRepository,
  auditService,
);
