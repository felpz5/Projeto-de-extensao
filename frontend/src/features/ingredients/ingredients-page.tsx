import { Pencil, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { RemoveButton } from '@/components/remove-button';
import { Badge, StockBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/feedback';
import { Checkbox, Input } from '@/components/ui/form';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { useAuth } from '@/features/auth/auth-context';
import { formatMoney, formatQty, UNIT_LABEL } from '@/lib/format';
import { useIngredients } from '@/lib/queries';
import { useDebounced } from '@/lib/use-debounced';
import type { Ingredient } from '@/lib/types';
import { IngredientDialog } from './ingredient-dialog';

export function IngredientsPage() {
  const { isManager } = useAuth();
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const debouncedSearch = useDebounced(search);
  const [editing, setEditing] = useState<Ingredient | null | undefined>(undefined);
  const query = useIngredients({
    search: debouncedSearch.trim() || undefined,
    active: showInactive ? undefined : true,
  });

  return (
    <>
      <PageHeader
        title="Ingredientes"
        description="Insumos controlados no estoque. As quantidades usam a unidade de cada um."
        actions={
          isManager && (
            <Button onClick={() => setEditing(null)}>
              <Plus aria-hidden /> Novo ingrediente
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
              aria-label="Buscar ingrediente"
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
          <EmptyState
            title="Nenhum ingrediente"
            description={isManager ? 'Cadastre os insumos que você quer controlar.' : undefined}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Saldo</Th>
                <Th className="text-right">Mínimo</Th>
                <Th className="text-right">Porção</Th>
                {isManager && <Th className="text-right">Custo</Th>}
                <Th className="text-right">Reposição</Th>
                {isManager && <Th className="sr-only">Ações</Th>}
              </tr>
            </thead>
            <tbody>
              {query.data.map((i) => (
                <Tr key={i.id}>
                  <Td>
                    <p className="flex items-center gap-2 font-medium">
                      {i.name}
                      {!i.active && <Badge>Inativo</Badge>}
                    </p>
                    <p className="text-xs text-muted">
                      {i.category?.name ?? 'Sem categoria'} · {UNIT_LABEL[i.baseUnit]}
                    </p>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="tabular font-semibold">{formatQty(i.stock, i.baseUnit)}</span>
                      <StockBadge status={i.status} />
                    </div>
                  </Td>
                  <Td className="tabular text-right text-muted">{formatQty(i.minStock, i.baseUnit)}</Td>
                  <Td className="tabular text-right text-muted">
                    {i.defaultPortion ? formatQty(i.defaultPortion, i.baseUnit) : '—'}
                  </Td>
                  {isManager && (
                    <Td className="tabular text-right text-muted">
                      {i.costPerUnit ? `${formatMoney(i.costPerUnit)}/${UNIT_LABEL[i.baseUnit]}` : '—'}
                    </Td>
                  )}
                  <Td className="tabular text-right text-muted">{i.leadTimeDays} dia(s)</Td>
                  {isManager && (
                    <Td className="whitespace-nowrap text-right">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(i)} aria-label={`Editar ${i.name}`}>
                        <Pencil aria-hidden />
                      </Button>
                      <RemoveButton
                        path={`/ingredients/${i.id}`}
                        name={i.name}
                        invalidate={['ingredients', 'inventory', 'forecast', 'dashboard']}
                      />
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <IngredientDialog
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
        ingredient={editing ?? undefined}
      />
    </>
  );
}
