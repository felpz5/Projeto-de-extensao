import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Pagination } from '@/components/pagination';
import { PeriodSelect, periodRange, type PeriodDays } from '@/components/period-select';
import { Badge, EstimatedBadge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, Stat } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/feedback';
import { Select } from '@/components/ui/form';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { MovementLine } from '@/features/inventory/movement-row';
import { api, errorMessage } from '@/lib/api';
import {
  CHANNEL_LABEL,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatQty,
  SOURCE_LABEL,
  toNumber,
} from '@/lib/format';
import { qk, useInvalidateStock } from '@/lib/queries';
import type { Channel, SaleDetail, SalesPage as SalesPageData, SalesSummary } from '@/lib/types';

const TAKE = 25;

export function SalesPage() {
  const [days, setDays] = useState<PeriodDays>(30);
  const [channel, setChannel] = useState<Channel | ''>('');
  const [skip, setSkip] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const range = periodRange(days);
  const params = { ...range, channel: channel || undefined, take: TAKE, skip };

  const list = useQuery({
    queryKey: qk.sales(params),
    queryFn: () => api<SalesPageData>('/sales', { query: params }),
    placeholderData: keepPreviousData,
  });
  // Excluiu a última venda da página? Volta uma página em vez de mostrar "nenhuma venda".
  const pageEmpty = list.data && list.data.items.length === 0 && skip > 0;
  useEffect(() => {
    if (pageEmpty) setSkip((s) => Math.max(0, s - TAKE));
  }, [pageEmpty]);

  const summary = useQuery({
    queryKey: qk.salesSummary(range),
    queryFn: () => api<SalesSummary>('/sales/summary', { query: range }),
  });

  return (
    <>
      <PageHeader
        title="Vendas"
        description="Histórico e totais do período."
        actions={
          <Link to="/vender" className={buttonVariants()}>
            <Plus aria-hidden /> Nova venda
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <PeriodSelect
          value={days}
          onChange={(d) => {
            setDays(d);
            setSkip(0);
          }}
        />
        <Select
          aria-label="Canal"
          className="w-auto"
          value={channel}
          onChange={(e) => {
            setChannel(e.target.value as Channel | '');
            setSkip(0);
          }}
        >
          <option value="">Todos os canais</option>
          <option value="IN_STORE">Balcão</option>
          <option value="ONLINE">Online</option>
        </Select>
      </div>

      {summary.data && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Faturamento" value={formatMoney(summary.data.revenue)} />
          <Stat label="Pedidos" value={formatNumber(summary.data.orders, 0)} />
          <Stat label="Ticket médio" value={formatMoney(summary.data.averageTicket)} />
          <Stat
            label="Online"
            value={formatMoney(summary.data.byChannel.find((c) => c.channel === 'ONLINE')?.revenue ?? 0)}
            hint={`Balcão ${formatMoney(summary.data.byChannel.find((c) => c.channel === 'IN_STORE')?.revenue ?? 0)}`}
          />
        </div>
      )}

      <Card>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState title="Nenhuma venda encontrada" description="Mude o período ou o canal." />
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              {formatNumber(list.data.total, 0)} venda(s) · total {formatMoney(list.data.totalAmount)}
            </p>
            <Table>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Canal</Th>
                  <Th>Itens</Th>
                  <Th className="text-right">Peso</Th>
                  <Th className="text-right">Valor</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((s) => (
                  <Tr key={s.id} className="cursor-pointer" onClick={() => setOpenId(s.id)}>
                    <Td className="whitespace-nowrap">
                      <button type="button" className="text-left hover:underline" onClick={() => setOpenId(s.id)}>
                        {formatDateTime(s.soldAt)}
                      </button>
                    </Td>
                    <Td>
                      <Badge tone={s.channel === 'ONLINE' ? 'accent' : 'neutral'}>{CHANNEL_LABEL[s.channel]}</Badge>
                    </Td>
                    <Td className="max-w-64 truncate">
                      {s.items.map((i) => `${formatNumber(i.quantity, 3)}× ${i.product.name}`).join(', ')}
                    </Td>
                    <Td className="tabular text-right">{s.totalWeightG ? formatQty(s.totalWeightG, 'G') : '—'}</Td>
                    <Td className="tabular text-right font-semibold">{formatMoney(s.totalAmount)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination skip={skip} take={TAKE} total={list.data.total} onChange={setSkip} />
          </>
        )}
      </Card>

      {openId && <SaleDetailDialog id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function SaleDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const queryClient = useQueryClient();
  const invalidate = useInvalidateStock();
  const query = useQuery({ queryKey: qk.sale(id), queryFn: () => api<SaleDetail>(`/sales/${id}`) });
  const del = useMutation({
    mutationFn: () => api(`/sales/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Venda excluída e estoque devolvido.');
      // Fecha e descarta o detalhe ANTES de recarregar: senão ele seria buscado de novo (404).
      onClose();
      queryClient.removeQueries({ queryKey: qk.sale(id) });
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const sale = query.data;

  return (
    <>
      <Dialog
        open
        onOpenChange={(o) => !o && onClose()}
        title="Detalhes da venda"
        description={sale && `${CHANNEL_LABEL[sale.channel]} · ${formatDateTime(sale.soldAt)}`}
        footer={
          sale && (
            <Button variant="outlineDanger" onClick={() => setConfirm(true)}>
              Excluir venda
            </Button>
          )
        }
      >
        {query.isPending ? (
          <Spinner />
        ) : query.isError ? (
          <ErrorState error={query.error} />
        ) : (
          sale && (
            <div className="flex flex-col gap-5">
              <div className="flex items-baseline justify-between">
                <span className="text-muted">Total</span>
                <span className="tabular text-2xl font-bold">{formatMoney(sale.totalAmount)}</span>
              </div>
              {sale.totalWeightG && (
                <p className="text-sm text-muted">Peso total: {formatQty(sale.totalWeightG, 'G')}</p>
              )}
              {sale.notes && <p className="rounded-lg bg-navy-800 p-3 text-sm">{sale.notes}</p>}

              <section>
                <h3 className="mb-2 text-sm font-semibold">Itens</h3>
                <ul className="flex flex-col gap-3">
                  {sale.items.map((item) => (
                    <li key={item.id} className="rounded-lg border border-navy-700 p-3">
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="font-medium">
                          {formatNumber(item.quantity, 3)}× {item.product.name}
                        </span>
                        <span className="tabular">
                          {formatMoney(toNumber(item.unitPrice) * toNumber(item.quantity))}
                        </span>
                      </div>
                      {item.weightG && <p className="text-xs text-muted">{formatQty(item.weightG, 'G')}</p>}
                      {item.ingredients && item.ingredients.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {item.ingredients.map((ing) => (
                            <li key={ing.ingredientId}>
                              <Badge tone={ing.quantitySource === 'MEASURED' || ing.quantitySource === 'RECIPE' ? 'neutral' : 'warning'}>
                                {ing.ingredient.name}
                                {ing.quantity ? ` · ${formatQty(ing.quantity, ing.ingredient.baseUnit)}` : ''} (
                                {SOURCE_LABEL[ing.quantitySource]})
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  Baixa de estoque
                  {sale.movements.some((m) => m.isEstimated) && <EstimatedBadge />}
                </h3>
                {sale.movements.length ? (
                  <ul className="divide-y divide-navy-800">
                    {sale.movements.map((m) => (
                      <MovementLine key={m.id} m={m} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">
                    Esta venda não baixou estoque (sem receita, composição ou porção padrão). O
                    consumo é corrigido pela contagem de inventário.
                  </p>
                )}
              </section>
            </div>
          )
        )}
      </Dialog>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Excluir esta venda?"
        description="A baixa de estoque da venda é desfeita. A exclusão fica registrada na auditoria."
        confirmLabel="Excluir"
        destructive
        loading={del.isPending}
        onConfirm={() => del.mutate()}
      />
    </>
  );
}
