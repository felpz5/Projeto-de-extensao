import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  ClipboardCheck,
  FileBarChart,
  type LucideIcon,
  PackagePlus,
  Percent,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ChartFrame, DailyBars, RankBars } from '@/components/charts';
import { PAYMENT_ICON } from '@/components/payment';
import { PeriodSelect, periodRange, type PeriodDays } from '@/components/period-select';
import { EstimatedBadge, StockBadge } from '@/components/ui/badge';
import { Card, CardHeader, type ChipColor, IconChip, Stat, StockMeter } from '@/components/ui/card';
import { EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/feedback';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { useAuth } from '@/features/auth/auth-context';
import { UrgencyBadge } from '@/features/forecast/urgency-badge';
import { MovementLine } from '@/features/inventory/movement-row';
import { editDeadline } from '@/features/sales/sale-detail-dialog';
import { api } from '@/lib/api';
import {
  CHANNEL_LABEL,
  formatDay,
  formatMoney,
  formatNumber,
  formatPct,
  formatQty,
  paymentLabel,
  today,
  toNumber,
} from '@/lib/format';
import { qk, useTenant } from '@/lib/queries';
import type { CashReport, Dashboard } from '@/lib/types';
import { cn } from '@/lib/utils';

export function DashboardPage() {
  const { isManager } = useAuth();
  return isManager ? <ManagerDashboard /> : <StaffDashboard />;
}

// ---------------------------------------------------------------------------------------------
// Partes comuns

function greeting(timeZone?: string) {
  const hour = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hour12: false, timeZone }).format(new Date()));
  return hour < 5 ? 'Boa noite' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
}

/** Cartão de abertura: saudação, data e (opcional) um resumo de hoje. */
function Hero({ children, aside }: { children?: ReactNode; aside?: ReactNode }) {
  const { session } = useAuth();
  const tenant = useTenant();
  const tz = tenant.data?.timezone;
  const date = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(new Date());
  return (
    <section className="relative mb-6 overflow-hidden rounded-3xl border border-navy-700 bg-gradient-to-br from-[#0E2A5C] via-navy-900 to-navy-950 p-5 sm:p-7">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-accent/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 size-64 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm capitalize text-muted">{date}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            {greeting(tz)}, {session?.user.name.split(' ')[0]}!
          </h1>
          <p className="mt-1 text-sm text-muted">{session?.tenant.name}</p>
        </div>
        {aside}
      </div>
      {children && <div className="relative mt-6">{children}</div>}
    </section>
  );
}

/** Mini-indicador dentro do Hero. */
/** Mini-indicador dentro do Hero (compacto no celular: 3 lado a lado). */
function HeroStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.04] p-2.5 backdrop-blur sm:p-3">
      <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent sm:flex" aria-hidden>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] text-muted sm:text-xs">{label}</p>
        <p className="tabular truncate text-base font-bold sm:text-lg">{value}</p>
      </div>
    </div>
  );
}

/**
 * Atalho com ícone (grade de ações rápidas).
 * Celular: ícone em cima e nome embaixo, 3 por linha (cabe "Nova venda" inteiro em 360px).
 */
function QuickAction({ to, icon, label, hint, color = 'sky' }: { to: string; icon: LucideIcon; label: string; hint?: string; color?: ChipColor }) {
  return (
    <Link
      to={to}
      className="group flex flex-col items-center gap-2 rounded-2xl border border-navy-800 bg-navy-900/80 px-2 py-3 text-center transition-all hover:-translate-y-0.5 hover:border-navy-600 hover:bg-navy-800/80 active:scale-[0.98] sm:flex-row sm:gap-3 sm:p-4 sm:text-left"
    >
      <IconChip icon={icon} color={color} className="transition-transform group-hover:scale-110" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold leading-tight sm:truncate sm:text-sm">{label}</span>
        {hint && <span className="hidden truncate text-xs text-muted sm:block">{hint}</span>}
      </span>
      <ArrowRight className="hidden size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-white lg:block" aria-hidden />
    </Link>
  );
}

function SeeAll({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-semibold text-accent hover:underline">
      {children} <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}

/** Ingredientes em alerta, com a barra de nível. */
function StockAlerts({ alerts }: { alerts: Dashboard['stock']['alerts'] }) {
  return (
    <Card>
      <CardHeader title="Alertas de estoque" icon={AlertTriangle} action={<SeeAll to="/estoque">Estoque</SeeAll>} />
      {alerts.length ? (
        <ul className="flex flex-col gap-3">
          {alerts.slice(0, 6).map((a) => (
            <li key={a.ingredientId}>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium">{a.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular text-sm font-semibold">{formatQty(a.stock, a.baseUnit)}</span>
                  <StockBadge status={a.status} />
                </span>
              </div>
              <StockMeter stock={toNumber(a.stock)} min={toNumber(a.minStock)} />
              <p className="mt-1 text-xs text-muted">Mínimo {formatQty(a.minStock, a.baseUnit)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Tudo certo" description="Nenhum ingrediente abaixo do mínimo." />
      )}
    </Card>
  );
}

function RecentMovements({ movements }: { movements: Dashboard['recentMovements'] }) {
  return (
    <Card>
      <CardHeader title="Últimas movimentações" icon={ClipboardCheck} action={<SeeAll to="/movimentacoes">Histórico</SeeAll>} />
      {movements.length ? (
        <ul className="divide-y divide-navy-800">
          {movements.slice(0, 8).map((m) => (
            <MovementLine key={m.id} m={m} />
          ))}
        </ul>
      ) : (
        <EmptyState title="Nenhuma movimentação ainda" />
      )}
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-44 rounded-3xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}

const useCashToday = () =>
  useQuery({
    queryKey: qk.cash({ date: today() }),
    queryFn: () => api<CashReport>('/sales/cash', { query: { date: today() } }),
    refetchInterval: 60_000,
  });

// ---------------------------------------------------------------------------------------------
// Dono e gerente

function ManagerDashboard() {
  const [days, setDays] = useState<PeriodDays>(30);
  const range = periodRange(days);
  const query = useQuery({ queryKey: qk.dashboard(range), queryFn: () => api<Dashboard>('/dashboard', { query: range }) });
  const cash = useCashToday();

  if (query.isPending) return <DashboardSkeleton />;
  if (query.isError)
    return (
      <Card>
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </Card>
    );

  const { sales, topProducts, stock, recentMovements, reorderSuggestions } = query.data;
  const critical = stock.low + stock.out;
  const margin = sales && toNumber(sales.revenue) > 0 ? (toNumber(sales.grossProfit) / toNumber(sales.revenue)) * 100 : null;

  return (
    <>
      <Hero aside={<PeriodSelect value={days} onChange={setDays} />}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Hoje</p>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <HeroStat icon={Wallet} label="Recebido" value={cash.data ? formatMoney(cash.data.revenue) : '—'} />
          <HeroStat icon={Receipt} label="Vendas" value={cash.data ? formatNumber(cash.data.orders, 0) : '—'} />
          <HeroStat icon={BadgeDollarSign} label="Ticket médio" value={cash.data ? formatMoney(cash.data.averageTicket) : '—'} />
        </div>
      </Hero>

      <section aria-label="Atalhos" className="mb-6 grid grid-cols-3 gap-2 sm:gap-3 2xl:grid-cols-6">
        <QuickAction to="/vender" icon={ShoppingCart} label="Nova venda" color="sky" />
        <QuickAction to="/estoque?entrada=1" icon={PackagePlus} label="Entrada" hint="Mercadoria" color="emerald" />
        <QuickAction to="/caixa" icon={Wallet} label="Caixa" hint="Fechamento" color="sky" />
        <QuickAction to="/estoque/contagem" icon={ClipboardCheck} label="Contagem" color="emerald" />
        <QuickAction to="/previsao" icon={ShoppingBag} label="Compras" hint="Sugestões" color="violet" />
        <QuickAction to="/relatorios" icon={FileBarChart} label="Relatórios" color="violet" />
      </section>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {sales && (
            <>
              <Stat icon={TrendingUp} color="sky" label={`Faturamento · ${days} dias`} value={formatMoney(sales.revenue)} hint={`${formatNumber(sales.orders, 0)} pedidos`} />
              <Stat
                icon={Percent}
                color="emerald"
                label="Lucro bruto (est.)"
                value={formatMoney(sales.grossProfit)}
                hint={margin !== null ? `Margem ${formatPct(margin)}` : 'Faturamento − custo'}
              />
              <Stat icon={BadgeDollarSign} color="violet" label="Ticket médio" value={formatMoney(sales.averageTicket)} hint={sales.byChannel.map((c) => `${CHANNEL_LABEL[c.channel]} ${c.orders}`).join(' · ')} />
            </>
          )}
          <Stat
            icon={AlertTriangle}
            color={stock.out ? 'rose' : critical ? 'amber' : 'emerald'}
            label="Estoque crítico"
            value={critical}
            tone={stock.out ? 'danger' : critical ? 'warning' : 'default'}
            hint={`${stock.out} zerado(s) · ${stock.low} baixo(s)${stock.estimatedValue !== null ? ` · ${formatMoney(stock.estimatedValue)} em estoque` : ''}`}
          />
        </div>

        {sales && (
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <ChartFrame
                title="Faturamento por dia"
                description={`Últimos ${days} dias`}
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
              <CardHeader title="Mais vendidos" icon={ShoppingBag} description="Por faturamento no período" />
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
              {sales.byPayment.length > 0 && (
                <div className="mt-5 border-t border-navy-800 pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Por forma de pagamento</p>
                  <div className="flex flex-wrap gap-2">
                    {sales.byPayment.map((p) => {
                      const Icon = p.method ? PAYMENT_ICON[p.method] : Wallet;
                      return (
                        <span key={p.method ?? 'none'} className="inline-flex items-center gap-1.5 rounded-full bg-navy-800 px-2.5 py-1 text-xs">
                          <Icon className="size-3.5 text-accent" aria-hidden />
                          {paymentLabel(p.method)} <b className="tabular">{formatMoney(p.revenue)}</b>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {reorderSuggestions && (
            <Card>
              <CardHeader title="Sugestões de compra" icon={ShoppingBag} description="Próximos 7 dias + prazo de entrega" action={<SeeAll to="/previsao">Ver tudo</SeeAll>} />
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
          <StockAlerts alerts={stock.alerts} />
        </div>

        <RecentMovements movements={recentMovements} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Funcionário: painel de tarefas

function StaffDashboard() {
  const range = periodRange(7);
  const query = useQuery({ queryKey: qk.dashboard(range), queryFn: () => api<Dashboard>('/dashboard', { query: range }) });
  const cash = useCashToday();

  return (
    <>
      <Hero>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            to="/vender"
            className="group flex items-center gap-4 rounded-2xl bg-gradient-to-br from-accent to-accent-strong p-4 text-navy-950 shadow-lg shadow-accent/20 transition-transform active:scale-[0.98] sm:p-5"
          >
            <span className="flex size-12 items-center justify-center rounded-xl bg-navy-950/15">
              <ShoppingCart className="size-6" aria-hidden />
            </span>
            <span className="flex-1">
              <span className="block text-lg font-bold">Nova venda</span>
              <span className="block text-sm opacity-80">Balcão ou online</span>
            </span>
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
          <Link
            to="/estoque?entrada=1"
            className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4 transition-colors hover:bg-white/[0.08] sm:p-5"
          >
            <span className="flex size-12 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">
              <PackagePlus className="size-6" aria-hidden />
            </span>
            <span className="flex-1">
              <span className="block text-lg font-bold">Registrar compra</span>
              <span className="block text-sm text-muted">Mercadoria que chegou</span>
            </span>
            <ArrowRight className="size-5 text-muted transition-transform group-hover:translate-x-1" aria-hidden />
          </Link>
        </div>
      </Hero>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Meu caixa de hoje" icon={Wallet} action={<SeeAll to="/caixa">Abrir caixa</SeeAll>} />
          {cash.isPending ? (
            <Skeleton className="h-32" />
          ) : cash.isError ? (
            <ErrorState error={cash.error} onRetry={() => cash.refetch()} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-navy-800/70 p-3">
                  <p className="text-xs text-muted">Recebido</p>
                  <p className="tabular text-2xl font-bold">{formatMoney(cash.data.revenue)}</p>
                </div>
                <div className="rounded-xl bg-navy-800/70 p-3">
                  <p className="text-xs text-muted">Vendas</p>
                  <p className="tabular text-2xl font-bold">{cash.data.orders}</p>
                </div>
              </div>
              {cash.data.byPayment.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {cash.data.byPayment.map((p) => {
                    const Icon = p.method ? PAYMENT_ICON[p.method] : Wallet;
                    return (
                      <span key={p.method ?? 'none'} className="inline-flex items-center gap-1.5 rounded-full bg-navy-800 px-2.5 py-1 text-xs">
                        <Icon className="size-3.5 text-accent" aria-hidden />
                        {paymentLabel(p.method)} <b className="tabular">{formatMoney(p.revenue)}</b>
                      </span>
                    );
                  })}
                </div>
              )}
              {cash.data.sales.length > 0 ? (
                <ul className="mt-4 divide-y divide-navy-800">
                  {cash.data.sales.slice(0, 4).map((s) => (
                    <li key={s.id} className={cn('flex items-center justify-between gap-3 py-2.5 text-sm', s.status === 'CANCELED' && 'opacity-50')}>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{s.items.map((i) => i.product.name).join(', ')}</span>
                        <span className="text-xs text-muted">
                          {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(s.soldAt))} ·{' '}
                          {paymentLabel(s.paymentMethod)}
                          {editDeadline(s) && <span className="text-warning"> · {editDeadline(s)}</span>}
                        </span>
                      </span>
                      <span className={cn('tabular shrink-0 font-semibold', s.status === 'CANCELED' && 'line-through')}>{formatMoney(s.totalAmount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Nenhuma venda sua hoje" description="As vendas que você registrar aparecem aqui." />
              )}
            </>
          )}
        </Card>

        {query.isPending ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : query.isError ? (
          <Card>
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          </Card>
        ) : (
          <StockAlerts alerts={query.data.stock.alerts} />
        )}
      </div>

      {query.data && (
        <div className="mt-4">
          <RecentMovements movements={query.data.recentMovements} />
        </div>
      )}
    </>
  );
}
