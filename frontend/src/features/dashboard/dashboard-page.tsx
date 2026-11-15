import { useQuery } from '@tanstack/react-query';
import { ArrowRight, PackagePlus, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ChartFrame, DailyBars, RankBars } from '@/components/charts';
import { PeriodSelect, periodRange, type PeriodDays } from '@/components/period-select';
import { StockBadge, EstimatedBadge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardHeader, Stat } from '@/components/ui/card';
import { EmptyState, ErrorState, Notice, PageHeader, Skeleton } from '@/components/ui/feedback';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { useAuth } from '@/features/auth/auth-context';
import { UrgencyBadge } from '@/features/forecast/urgency-badge';
import { MovementLine } from '@/features/inventory/movement-row';
import { api } from '@/lib/api';
import {
  CHANNEL_LABEL,
  formatDay,
  formatMoney,
  formatNumber,
  formatQty,
  toNumber,
} from '@/lib/format';
import { qk } from '@/lib/queries';
import type { Dashboard } from '@/lib/types';
import { cn } from '@/lib/utils';

export function DashboardPage() {
  const { session, isManager } = useAuth();
  const [days, setDays] = useState<PeriodDays>(30);
  const range = periodRange(days);
  const query = useQuery({
    queryKey: qk.dashboard(range),
    queryFn: () => api<Dashboard>('/dashboard', { query: range }),
  });

  const firstName = session?.user.name.split(' ')[0];

  return (
    <>
      <PageHeader
        title={`Olá, ${firstName}`}
        description={isManager ? 'Resumo do estabelecimento.' : 'Situação do estoque agora.'}
        actions={isManager && <PeriodSelect value={days} onChange={setDays} />}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:flex">
        <Link to="/vender" className={cn(buttonVariants({ size: 'lg' }), 'sm:w-auto')}>
          <ShoppingCart aria-hidden /> Nova venda
        </Link>
        <Link
          to="/estoque?entrada=1"
          className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'sm:w-auto')}
        >
          <PackagePlus aria-hidden /> Registrar entrada
        </Link>
      </div>

      {query.isPending ? (
        <DashboardSkeleton />
      ) : query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Card>
      ) : (
        <DashboardContent data={query.data} days={days} />
      )}
    </>
  );
}

function DashboardContent({ data, days }: { data: Dashboard; days: number }) {
  const { sales, topProducts, stock, recentMovements, reorderSuggestions } = data;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {sales && (
          <>
            <Stat label="Faturamento" value={formatMoney(sales.revenue)} hint={`Últimos ${days} dias`} />
            <Stat label="Pedidos" value={formatNumber(sales.orders, 0)} hint={`Ticket médio ${formatMoney(sales.averageTicket)}`} />
          </>
        )}
        <Stat
          label="Estoque baixo"
          value={stock.low}
          tone={stock.low ? 'warning' : 'default'}
          hint={`de ${stock.totalIngredients} ingredientes`}
        />
        <Stat
          label="Sem estoque"
          value={stock.out}
          tone={stock.out ? 'danger' : 'default'}
          hint={`Valor em estoque ${formatMoney(stock.estimatedValue)}`}
        />
      </div>

      {sales && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <ChartFrame
              title="Faturamento por dia"
              description={sales.byChannel
                .map((c) => `${CHANNEL_LABEL[c.channel]}: ${formatMoney(c.revenue)} (${c.orders})`)
                .join(' · ')}
              chart={
                <DailyBars
                  data={sales.byDay.map((d) => ({ ...d, value: toNumber(d.revenue) }))}
                  xKey="day"
                  yKey="value"
                  formatX={(v) => formatDay(v, false)}
                  formatY={(v) => formatMoney(v).replace(',00', '')}
                  tooltipRows={(d) => [
                    { label: 'Faturamento', value: formatMoney(d.value) },
                    { label: 'Pedidos', value: String(d.orders) },
                  ]}
                />
              }
              table={
                <Table>
                  <thead>
                    <tr>
                      <Th>Dia</Th>
                      <Th className="text-right">Pedidos</Th>
                      <Th className="text-right">Faturamento</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.byDay.map((d) => (
                      <Tr key={d.day}>
                        <Td>{formatDay(d.day)}</Td>
                        <Td className="tabular text-right">{d.orders}</Td>
                        <Td className="tabular text-right">{formatMoney(d.revenue)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              }
            />
          </Card>

          <Card>
            <CardHeader title="Mais vendidos" description="Por faturamento no período" />
            {topProducts && topProducts.length ? (
              <RankBars
                data={topProducts.map((p) => ({
                  label: p.name,
                  value: toNumber(p.revenue),
                  hint: `${formatNumber(p.quantity, 0)} vendidos${p.weightG ? ` · ${formatQty(p.weightG, 'G')}` : ''}`,
                }))}
                formatValue={formatMoney}
              />
            ) : (
              <EmptyState title="Nenhuma venda no período" />
            )}
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {reorderSuggestions && (
          <Card>
            <CardHeader
              title="Sugestões de compra"
              description="Para os próximos 7 dias + prazo de entrega"
              action={
                <Link to="/previsao" className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
                  Ver tudo <ArrowRight className="size-4" aria-hidden />
                </Link>
              }
            />
            {reorderSuggestions.items.length ? (
              <ul className="divide-y divide-navy-800">
                {reorderSuggestions.items.map((item) => (
                  <li key={item.ingredient.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        {item.ingredient.name}
                        {item.usesEstimatedData && <EstimatedBadge />}
                      </p>
                      <p className="text-xs text-muted">
                        Saldo {formatQty(item.stock, item.ingredient.baseUnit)}
                        {item.recommendation.daysUntilStockout !== null &&
                          ` · acaba em ~${formatNumber(item.recommendation.daysUntilStockout, 0)} dia(s)`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <UrgencyBadge urgency={item.recommendation.urgency} />
                      {item.recommendation.suggestedQuantity !== null && (
                        <span className="tabular text-sm font-semibold">
                          {formatQty(item.recommendation.suggestedQuantity, item.ingredient.baseUnit)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nada para comprar agora" description="O estoque cobre a demanda prevista." />
            )}
            <Notice className="mt-3">{reorderSuggestions.disclaimer}</Notice>
          </Card>
        )}

        <Card>
          <CardHeader
            title="Alertas de estoque"
            action={
              <Link to="/estoque" className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
                Estoque <ArrowRight className="size-4" aria-hidden />
              </Link>
            }
          />
          {stock.alerts.length ? (
            <ul className="divide-y divide-navy-800">
              {stock.alerts.map((a) => (
                <li key={a.ingredientId} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.name}</p>
                    <p className="text-xs text-muted">Mínimo {formatQty(a.minStock, a.baseUnit)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="tabular text-sm font-semibold">{formatQty(a.stock, a.baseUnit)}</span>
                    <StockBadge status={a.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Tudo certo" description="Nenhum ingrediente abaixo do mínimo." />
          )}
        </Card>

        <Card className={cn(!reorderSuggestions && 'lg:col-span-1')}>
          <CardHeader
            title="Últimas movimentações"
            action={
              <Link to="/movimentacoes" className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
                Histórico <ArrowRight className="size-4" aria-hidden />
              </Link>
            }
          />
          {recentMovements.length ? (
            <ul className="divide-y divide-navy-800">
              {recentMovements.map((m) => (
                <MovementLine key={m.id} m={m} />
              ))}
            </ul>
          ) : (
            <EmptyState title="Nenhuma movimentação ainda" />
          )}
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}
