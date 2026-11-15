import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Pagination } from '@/components/pagination';
import { Badge, EstimatedBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { useAuth } from '@/features/auth/auth-context';
import { api, errorMessage } from '@/lib/api';
import { MovementLine } from './movement-row';
import { formatDateTime, formatMoney, formatSignedQty, MOVEMENT_LABEL, toNumber } from '@/lib/format';
import { qk, useIngredients, useInvalidateStock } from '@/lib/queries';
import type { Movement, MovementType, Page } from '@/lib/types';
import { cn } from '@/lib/utils';

const TAKE = 30;

/** Livro-razão do estoque: nada é apagado; lançamento errado é estornado. */
export function MovementsPage() {
  const { isManager } = useAuth();
  const ingredients = useIngredients();
  const [ingredientId, setIngredientId] = useState('');
  const [type, setType] = useState<MovementType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [skip, setSkip] = useState(0);
  const [reversing, setReversing] = useState<Movement | null>(null);

  const params = {
    ingredientId: ingredientId || undefined,
    type: type || undefined,
    from: from || undefined,
    to: to || undefined,
    take: TAKE,
    skip,
  };
  const query = useQuery({
    queryKey: qk.movements(params),
    queryFn: () => api<Page<Movement>>('/inventory/movements', { query: params }),
    placeholderData: keepPreviousData,
  });

  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setSkip(0);
  };

  return (
    <>
      <PageHeader
        title="Movimentações"
        description="Todo o histórico de entradas, saídas, consumo das vendas e ajustes."
      />

      <Card className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Ingrediente">
          <Select value={ingredientId} onChange={(e) => filter(setIngredientId)(e.target.value)}>
            <option value="">Todos</option>
            {ingredients.data?.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tipo">
          <Select value={type} onChange={(e) => filter(setType)(e.target.value as MovementType | '')}>
            <option value="">Todos</option>
            {(Object.keys(MOVEMENT_LABEL) as MovementType[]).map((t) => (
              <option key={t} value={t}>
                {MOVEMENT_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="De">
          <Input type="date" value={from} onChange={(e) => filter(setFrom)(e.target.value)} />
        </Field>
        <Field label="Até">
          <Input type="date" value={to} onChange={(e) => filter(setTo)(e.target.value)} />
        </Field>
      </Card>

      <Card>
        {query.isPending ? (
          <Spinner />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data.items.length === 0 ? (
          <EmptyState title="Nenhuma movimentação encontrada" />
        ) : (
          <>
            {/* Celular: linha compacta + estorno */}
            <ul className="divide-y divide-navy-800 md:hidden">
              {query.data.items.map((m) => {
                const canReverse = isManager && m.type !== 'SALE_CONSUMPTION' && !m.reversedAt && !m.reversesId;
                return (
                  <li key={m.id} className={cn(m.reversedAt && 'opacity-60')}>
                    <ul>
                      <MovementLine m={m} />
                    </ul>
                    {(m.note || canReverse) && (
                      <div className="-mt-1 flex items-center justify-between gap-2 pb-2.5">
                        <p className="min-w-0 truncate text-xs text-muted">{m.note}</p>
                        {canReverse && (
                          <Button variant="ghost" size="sm" onClick={() => setReversing(m)}>
                            <Undo2 aria-hidden /> Estornar
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="hidden md:block">
            <Table>
              <thead>
                <tr>
                  <Th>Ingrediente</Th>
                  <Th className="text-right">Quantidade</Th>
                  <Th>Tipo</Th>
                  {isManager && <Th className="text-right">Custo</Th>}
                  <Th>Observação</Th>
                  {isManager && <Th className="sr-only">Ações</Th>}
                </tr>
              </thead>
              <tbody>
                {query.data.items.map((m) => {
                  const canReverse =
                    isManager && m.type !== 'SALE_CONSUMPTION' && !m.reversedAt && !m.reversesId;
                  return (
                    <Tr key={m.id} className={cn(m.reversedAt && 'opacity-60')}>
                      <Td>
                        <p className="font-medium">{m.ingredient.name}</p>
                        <p className="whitespace-nowrap text-xs text-muted">{formatDateTime(m.occurredAt)}</p>
                      </Td>
                      <Td
                        className={cn(
                          'tabular whitespace-nowrap text-right font-semibold',
                          toNumber(m.quantity) > 0 && 'text-success',
                          m.reversedAt && 'line-through',
                        )}
                      >
                        {formatSignedQty(m.quantity, m.ingredient.baseUnit)}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {MOVEMENT_LABEL[m.type]}
                          {m.isEstimated && <EstimatedBadge />}
                          {m.reversedAt && <Badge>Estornado</Badge>}
                          {m.reversesId && <Badge tone="accent">Estorno</Badge>}
                        </div>
                      </Td>
                      {isManager && (
                        <Td className="tabular text-right text-muted">{m.unitCost ? formatMoney(m.unitCost) : '—'}</Td>
                      )}
                      <Td className="max-w-56 truncate text-muted" title={m.note ?? undefined}>
                        {m.note ?? '—'}
                      </Td>
                      {isManager && (
                        <Td className="text-right">
                          {canReverse && (
                            <Button variant="ghost" size="sm" onClick={() => setReversing(m)}>
                              <Undo2 aria-hidden /> Estornar
                            </Button>
                          )}
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            </div>
            <Pagination skip={skip} take={TAKE} total={query.data.total} onChange={setSkip} />
          </>
        )}
      </Card>

      {reversing && <ReverseDialog movement={reversing} onClose={() => setReversing(null)} />}
    </>
  );
}

function ReverseDialog({ movement, onClose }: { movement: Movement; onClose: () => void }) {
  const [note, setNote] = useState('');
  const invalidate = useInvalidateStock();
  const mutation = useMutation({
    mutationFn: () =>
      api(`/inventory/movements/${movement.id}/reverse`, {
        method: 'POST',
        body: { note: note.trim() || undefined },
      }),
    onSuccess: () => {
      toast.success('Lançamento estornado.');
      invalidate();
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Estornar lançamento?"
      description={`${MOVEMENT_LABEL[movement.type]} de ${formatSignedQty(movement.quantity, movement.ingredient.baseUnit)} em ${movement.ingredient.name}. Será criado um lançamento inverso; o original continua no histórico.`}
      confirmLabel="Estornar"
      destructive
      loading={mutation.isPending}
      onConfirm={() => mutation.mutate()}
    >
      <Field label="Motivo (opcional)">
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: digitado errado" />
      </Field>
    </ConfirmDialog>
  );
}
