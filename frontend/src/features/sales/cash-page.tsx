import { useQuery } from '@tanstack/react-query';
import { Ban, Pencil, Plus, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PAYMENT_ICON } from '@/components/payment';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardHeader, Stat } from '@/components/ui/card';
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/form';
import { useAuth } from '@/features/auth/auth-context';
import { api } from '@/lib/api';
import { formatDate, formatMoney, formatNumber, paymentLabel, today, toNumber } from '@/lib/format';
import { qk } from '@/lib/queries';
import type { CashReport, Member, Sale } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CancelSaleDialog } from './cancel-sale-dialog';
import { canEdit, editDeadline, SaleDetailDialog, SaleStatusBadge } from './sale-detail-dialog';

const timeFmt = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/**
 * Fechamento de caixa do dia: quanto entrou em cada forma de pagamento, vendas canceladas e a
 * lista para conferir. Funcionário vê o próprio caixa e corrige a própria venda recente;
 * dono/gerente veem a loja toda ou uma pessoa.
 */
export function CashPage() {
  const { isManager, session } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState(today());
  const [userId, setUserId] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [canceling, setCanceling] = useState<Sale | null>(null);

  const params = { date, userId: isManager ? userId || undefined : undefined };
  const query = useQuery({
    queryKey: qk.cash(params),
    queryFn: () => api<CashReport>('/sales/cash', { query: params }),
    // o prazo de correção do funcionário corre: atualiza a lista de tempos em tempos
    refetchInterval: 60_000,
  });
  const members = useQuery({
    queryKey: ['members'],
    queryFn: () => api<Member[]>('/tenant/members'),
    enabled: isManager,
  });

  const data = query.data;
  const isToday = date === today();
  const who =
    !isManager ? 'Suas vendas' : userId ? members.data?.find((m) => m.user.id === userId)?.user.name : 'Toda a loja';

  return (
    <>
      <PageHeader
        title="Caixa"
        description={`${who ?? ''} · ${isToday ? 'hoje' : formatDate(`${date}T12:00:00`)}`}
        actions={
          <>
            <Button variant="secondary" className="print:hidden" onClick={() => window.print()}>
              <Printer aria-hidden /> Imprimir fechamento
            </Button>
            <Link to="/vender" className={cn(buttonVariants(), 'print:hidden')}>
              <Plus aria-hidden /> Nova venda
            </Link>
          </>
        }
      />

      <Card className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:hidden">
        <Field label="Dia">
          <Input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value || today())} />
        </Field>
        {isManager && (
          <Field label="De quem">
            <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Toda a loja</option>
              {members.data
                ?.filter((m) => m.status !== 'INVITED')
                .map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.name}
                    {m.user.id === session?.user.id ? ' (você)' : ''}
                  </option>
                ))}
            </Select>
          </Field>
        )}
      </Card>

      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Card>
      ) : (
        data && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Total recebido" value={formatMoney(data.revenue)} />
              <Stat label="Vendas" value={formatNumber(data.orders, 0)} hint={`Ticket médio ${formatMoney(data.averageTicket)}`} />
              <Stat
                label="Canceladas"
                value={formatNumber(data.canceled.orders, 0)}
                tone={data.canceled.orders ? 'warning' : 'default'}
                hint={data.canceled.orders ? `${formatMoney(data.canceled.amount)} (fora do total)` : undefined}
              />
              <Stat
                label="Sem forma de pagamento"
                value={formatMoney(data.byPayment.find((p) => !p.method)?.revenue ?? 0)}
                hint="Vendas antigas, sem o campo"
              />
            </div>

            <Card>
              <CardHeader title="Por forma de pagamento" description="Confira com a gaveta, a maquininha e o extrato do Pix." />
              {data.byPayment.length ? (
                <ul className="divide-y divide-navy-800">
                  {data.byPayment.map((p) => {
                    const Icon = p.method ? PAYMENT_ICON[p.method] : null;
                    const pct = toNumber(data.revenue) ? (toNumber(p.revenue) / toNumber(data.revenue)) * 100 : 0;
                    return (
                      <li key={p.method ?? 'none'} className="py-2.5">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex items-center gap-2 font-medium">
                            {Icon && <Icon className="size-4 text-accent" aria-hidden />}
                            {paymentLabel(p.method)}
                            <span className="text-xs text-muted">({p.orders})</span>
                          </span>
                          <span className="tabular font-semibold">{formatMoney(p.revenue)}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-navy-800">
                          <div className="h-1.5 rounded-full bg-accent" style={{ width: `${Math.max(pct, 1)}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState title="Nenhuma venda neste dia" />
              )}
            </Card>

            <Card>
              <CardHeader
                title="Vendas do dia"
                description={
                  !isManager
                    ? `Errou alguma? Você pode corrigir ou cancelar a sua venda nos primeiros ${data.editWindowMinutes} minutos.`
                    : undefined
                }
              />
              {data.sales.length ? (
                <ul className="divide-y divide-navy-800">
                  {data.sales.map((sale) => {
                    const editable = canEdit(sale);
                    const deadline = editDeadline(sale);
                    return (
                      <li key={sale.id} className={cn('flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between', sale.status === 'CANCELED' && 'opacity-60')}>
                        <button type="button" className="min-w-0 text-left" onClick={() => setOpenId(sale.id)}>
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                            <span className="tabular">{timeFmt(sale.soldAt)}</span>
                            <span className="truncate">{sale.items.map((i) => i.product.name).join(', ')}</span>
                            <SaleStatusBadge sale={sale} />
                          </p>
                          <p className="text-xs text-muted">
                            {paymentLabel(sale.paymentMethod)}
                            {isManager && sale.createdByName && ` · ${sale.createdByName}`}
                            {sale.cancelReason && ` · “${sale.cancelReason}”`}
                            {deadline && <span className="text-warning"> · {deadline}</span>}
                          </p>
                        </button>
                        <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end print:hidden">
                          <span className={cn('tabular font-semibold', sale.status === 'CANCELED' && 'line-through')}>
                            {formatMoney(sale.totalAmount)}
                          </span>
                          {editable && (
                            <span className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={() => navigate(`/vender?corrigir=${sale.id}`)}>
                                <Pencil aria-hidden /> Corrigir
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setCanceling(sale)} aria-label="Cancelar venda">
                                <Ban aria-hidden />
                              </Button>
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState title="Nenhuma venda neste dia" />
              )}
              {data.sales.length >= 500 && (
                <p className="mt-2 text-xs text-muted">Mostrando as 500 vendas mais recentes do dia.</p>
              )}
              {!isManager && (
                <p className="mt-3 text-xs text-muted">
                  <Badge>Dica</Badge> Venda mais antiga com erro? Peça ao gerente para corrigir.
                </p>
              )}
            </Card>
          </div>
        )
      )}

      {openId && <SaleDetailDialog id={openId} onClose={() => setOpenId(null)} />}
      {canceling && <CancelSaleDialog sale={canceling} onClose={() => setCanceling(null)} />}
    </>
  );
}
