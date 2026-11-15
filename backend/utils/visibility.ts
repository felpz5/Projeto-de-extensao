import type { Role } from '@prisma/client';

/**
 * Dados financeiros (custo de ingrediente, valor do estoque, custo de compra) são de dono e
 * gerente (planejamento, seção 4.3). Para o funcionário eles saem da RESPOSTA da API como null —
 * esconder só no front não adianta: qualquer um abre o DevTools.
 */
export const canSeeCosts = (role: Role) => role !== 'STAFF';

export function withoutCost<T extends { costPerUnit?: unknown }>(role: Role, item: T): T {
  return canSeeCosts(role) ? item : { ...item, costPerUnit: null };
}

export function withoutStockValue<T extends { stockValue?: unknown }>(role: Role, item: T): T {
  return canSeeCosts(role) ? item : { ...item, stockValue: null };
}

export function withoutUnitCost<T extends { unitCost?: unknown }>(role: Role, item: T): T {
  return canSeeCosts(role) ? item : { ...item, unitCost: null };
}
