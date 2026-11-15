import { ClipboardCheck, PackageMinus, PackagePlus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { StockBadge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, Stat } from '@/components/ui/card';
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/form';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { useAuth } from '@/features/auth/auth-context';
import { formatMoney, formatQty, toNumber } from '@/lib/format';
import { useLevels } from '@/lib/queries';
import type { ManualMovementType, StockStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { MovementDialog } from './movement-dialog';

export function StockPage() {
  const { isManager } = useAuth();
  const levels = useLevels();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StockStatus | ''>('');
  const [dialog, setDialog] = useState<{ type: ManualMovementType; ingredientId?: string } | null>(
    params.get('entrada') ? { type: 'PURCHASE' } : null,
  );

  const closeDialog = (open: boolean) => {
    if (open) return;
    setDialog(null);
    if (params.has('entrada')) setParams({}, { replace: true });
  };

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return (levels.data ?? []).filter(
      (l) =>
        (!term || l.name.toLocaleLowerCase('pt-BR').includes(term)) &&
        (!status || l.status === status),
    );
  }, [levels.data, search, status]);

  const totals = useMemo(() => {
    const data = levels.data ?? [];
    return {
      value: data.reduce((s, l) => s + toNumber(l.stockValue), 0),
      low: data.filter((l) => l.status === 'LOW').length,
      out: data.filter((l) => l.status === 'OUT').length,
    };
  }, [levels.data]);

  return (
    <>
      <PageHeader
        title="Estoque"
        description="Saldo atual de cada ingrediente (soma de todas as movimentações)."
        actions={
          <>
            <Button onClick={() => setDialog({ type: 'PURCHASE' })}>
              <PackagePlus aria-hidden /> Registrar entrada
            </Button>
            {isManager && (
              <>
                <Button variant="secondary" onClick={() => setDialog({ type: 'LOSS' })}>
                  <PackageMinus aria-hidden /> Saída / perda
                </Button>
                <Link to="/estoque/contagem" className={buttonVariants({ variant: 'secondary' })}>
                  <ClipboardCheck aria-hidden /> Contagem
                </Link>
              </>
            )}
          </>
        }
      />

      {levels.data && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Stat label="Valor estimado" value={formatMoney(totals.value)} />
          <Stat label="Baixo" value={totals.low} tone={totals.low ? 'warning' : 'default'} />
          <Stat label="Zerado" value={totals.out} tone={totals.out ? 'danger' : 'default'} />
        </div>
      )}

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input
              type="search"
              placeholder="Buscar ingrediente"
              aria-label="Buscar ingrediente"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select aria-label="Situação" className="sm:w-48" value={status} onChange={(e) => setStatus(e.target.value as StockStatus | '')}>
            <option value="">Todas as situações</option>
            <option value="OUT">Zerado</option>
            <option value="LOW">Baixo</option>
            <option value="OK">Normal</option>
          </Select>
        </div>

        {levels.isPending ? (
          <Spinner />
        ) : levels.isError ? (
          <ErrorState error={levels.error} onRetry={() => levels.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={levels.data.length ? 'Nenhum ingrediente encontrado' : 'Nenhum ingrediente cadastrado'}
            action={
              !levels.data.length &&
              isManager && (
                <Link to="/ingredientes" className={buttonVariants()}>
                  Cadastrar ingredientes
                </Link>
              )
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Ingrediente</Th>
                <Th className="text-right">Saldo</Th>
                <Th>Situação</Th>
                <Th className="text-right">Mínimo</Th>
                <Th className="text-right">Valor</Th>
                <Th className="sr-only">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <Tr key={l.ingredientId}>
                  <Td>
                    <p className="font-medium">{l.name}</p>
                    {l.category && <p className="text-xs text-muted">{l.category.name}</p>}
                  </Td>
                  <Td className={cn('tabular whitespace-nowrap text-right font-semibold', toNumber(l.stock) < 0 && 'text-danger')}>
                    {formatQty(l.stock, l.baseUnit)}
                  </Td>
                  <Td>
                    <StockBadge status={l.status} />
                  </Td>
                  <Td className="tabular text-right text-muted">{formatQty(l.minStock, l.baseUnit)}</Td>
                  <Td className="tabular text-right text-muted">{l.stockValue ? formatMoney(l.stockValue) : '—'}</Td>
                  <Td className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDialog({ type: 'PURCHASE', ingredientId: l.ingredientId })}
                    >
                      Entrada
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {levels.data?.some((l) => toNumber(l.stock) < 0) && (
          <p className="mt-3 text-xs text-muted">
            Saldo negativo = as baixas (algumas estimadas) passaram do que foi registrado de entrada.
            Faça uma contagem para corrigir.
          </p>
        )}
      </Card>

      <MovementDialog
        open={dialog !== null}
        onOpenChange={closeDialog}
        ingredientId={dialog?.ingredientId}
        initialType={dialog?.type}
      />
    </>
  );
}
