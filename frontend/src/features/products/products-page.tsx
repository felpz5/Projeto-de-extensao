import { ChevronRight, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Badge, EstimatedBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/feedback';
import { Checkbox, Input } from '@/components/ui/form';
import { useAuth } from '@/features/auth/auth-context';
import { formatMoney } from '@/lib/format';
import { useProducts } from '@/lib/queries';
import { useDebounced } from '@/lib/use-debounced';
import type { Product } from '@/lib/types';
import { ProductDialog } from './product-dialog';

export function compositionLabel(p: Pick<Product, 'pricingMode' | '_count'>) {
  if (p.pricingMode === 'UNIT') {
    return p._count.recipeItems ? `Receita com ${p._count.recipeItems} ingrediente(s)` : 'Sem receita';
  }
  return p._count.weightMix ? `Composição média com ${p._count.weightMix} ingrediente(s)` : 'Sem composição';
}

export function ProductsPage() {
  const { isManager } = useAuth();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const debouncedSearch = useDebounced(search);
  const [creating, setCreating] = useState(false);
  const query = useProducts({
    search: debouncedSearch.trim() || undefined,
    active: showInactive ? undefined : true,
  });

  return (
    <>
      <PageHeader
        title="Produtos"
        description="O que você vende. A composição define a baixa de estoque de cada venda."
        actions={
          isManager && (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden /> Novo produto
            </Button>
          )
        }
      />

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input
              type="search"
              placeholder="Buscar"
              aria-label="Buscar produto"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Checkbox label="Mostrar inativos" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        </div>

        {query.isPending ? (
          <Spinner />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState title="Nenhum produto" />
        ) : (
          <ul className="divide-y divide-navy-800">
            {query.data.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/produtos/${p.id}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 hover:bg-navy-800/50"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {p.name}
                      {!p.active && <Badge>Inativo</Badge>}
                      <Badge tone="accent">{p.pricingMode === 'WEIGHT' ? 'Por peso' : 'Por unidade'}</Badge>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {p.category?.name ?? 'Sem categoria'} · {compositionLabel(p)}
                      {p.pricingMode === 'WEIGHT' && p._count.weightMix > 0 && <EstimatedBadge />}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular font-semibold">
                      {formatMoney(p.price)}
                      {p.pricingMode === 'WEIGHT' && <span className="text-xs text-muted">/kg</span>}
                    </span>
                    <ChevronRight className="size-4 text-muted" aria-hidden />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ProductDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
