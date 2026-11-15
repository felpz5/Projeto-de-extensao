import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { setDisplayTimeZone } from '@/lib/format';
import type {
  Category,
  CategoryKind,
  Ingredient,
  Me,
  Product,
  StockLevel,
  Tenant,
} from '@/lib/types';

/**
 * Chaves do cache do TanStack Query. Ao trocar de estabelecimento o cache inteiro é limpo
 * (auth-context), então as chaves não precisam incluir o tenant.
 */
export const qk = {
  me: ['me'] as const,
  tenant: ['tenant'] as const,
  members: ['members'] as const,
  categories: (kind?: CategoryKind) => ['categories', kind ?? 'all'] as const,
  ingredients: (params?: object) => ['ingredients', params ?? {}] as const,
  ingredient: (id: string) => ['ingredient', id] as const,
  products: (params?: object) => ['products', params ?? {}] as const,
  product: (id: string) => ['product', id] as const,
  levels: ['inventory', 'levels'] as const,
  movements: (params: object) => ['inventory', 'movements', params] as const,
  sales: (params: object) => ['sales', 'list', params] as const,
  sale: (id: string) => ['sales', 'detail', id] as const,
  salesSummary: (params: object) => ['sales', 'summary', params] as const,
  topProducts: (params: object) => ['sales', 'top', params] as const,
  dashboard: (params: object) => ['dashboard', params] as const,
  productForecast: (horizon: number) => ['forecast', 'products', horizon] as const,
  reorder: (coverage: number) => ['forecast', 'reorder', coverage] as const,
  cash: (params: object) => ['cash', params] as const,
  stockReport: (params: object) => ['inventory', 'report', params] as const,
  counts: (params: object) => ['inventory', 'counts', params] as const,
  audit: (params: object) => ['audit', params] as const,
  stores: (days: number) => ['stores', days] as const,
};

export function useMe() {
  return useQuery({ queryKey: qk.me, queryFn: () => api<Me>('/auth/me') });
}

/** Dados do estabelecimento ativo. Também define o fuso usado para mostrar datas. */
export function useTenant() {
  const query = useQuery({
    queryKey: qk.tenant,
    queryFn: () => api<Tenant>('/tenant'),
    staleTime: 5 * 60_000,
  });
  // Definido já durante a renderização (é idempotente): se fosse num useEffect, as páginas filhas
  // renderizariam antes, com o fuso do navegador, e não seriam atualizadas.
  setDisplayTimeZone(query.data?.timezone);
  return query;
}

export function useCategories(kind?: CategoryKind) {
  return useQuery({
    queryKey: qk.categories(kind),
    queryFn: () => api<Category[]>('/categories', { query: { kind } }),
    staleTime: 60_000,
  });
}

export function useIngredients(params: { active?: boolean; search?: string } = {}) {
  return useQuery({
    queryKey: qk.ingredients(params),
    queryFn: () => api<Ingredient[]>('/ingredients', { query: params }),
  });
}

export function useProducts(params: { active?: boolean; search?: string } = {}) {
  return useQuery({
    queryKey: qk.products(params),
    queryFn: () => api<Product[]>('/products', { query: params }),
  });
}

export function useLevels() {
  return useQuery({
    queryKey: qk.levels,
    queryFn: () => api<StockLevel[]>('/inventory/levels'),
  });
}

/**
 * Depois de qualquer mudança no estoque ou nas vendas, saldos, alertas, dashboard e previsão
 * ficam desatualizados: invalida tudo que depende deles.
 */
export function useInvalidateStock() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      // compras mudam o custo do ingrediente → margem dos produtos também
      ['inventory', 'ingredients', 'ingredient', 'dashboard', 'forecast', 'sales', 'cash', 'products', 'product', 'stores'].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
}
