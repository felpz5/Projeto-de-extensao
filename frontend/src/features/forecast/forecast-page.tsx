import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ChartFrame, ForecastChart } from '@/components/charts';
import { Badge, EstimatedBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Notice, PageHeader, Spinner } from '@/components/ui/feedback';
import { Field, Select } from '@/components/ui/form';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import {
  CONFIDENCE_LABEL,
  formatDay,
  formatMoney,
  formatNumber,
  formatQty,
} from '@/lib/format';
import { qk } from '@/lib/queries';
import type { Forecast, ProductForecastResponse, ReorderItem, ReorderResponse, ReorderUrgency } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ShoppingListDialog } from './shopping-list-dialog';
import { UrgencyBadge } from './urgency-badge';

const URGENCY_ORDER: ReorderUrgency[] = ['OUT_OF_STOCK', 'URGENT', 'BUY', 'LOW_STOCK_NO_HISTORY', 'OK', 'NO_HISTORY'];

export function ForecastPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('aba') === 'demanda' ? 'demanda' : 'reposicao';

  return (
    <>
      <PageHeader
        title="Previsão"
        description="Estimativas a partir do histórico registrado — servem para planejar, não são valores exatos."
      />
      <div className="mb-4 flex gap-1 border-b border-navy-700" role="tablist">
        {(
          [
            ['reposicao', 'Reposição de ingredientes'],
            ['demanda', 'Demanda de produtos'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams(key === 'reposicao' ? {} : { aba: key }, { replace: true })}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-semibold',
              tab === key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-white',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'reposicao' ? <ReorderTab /> : <DemandTab />}
    </>
  );
}

function ConfidenceBadge({ forecast }: { forecast: Pick<Forecast, 'confidence' | 'historyDays'> }) {
  if (!forecast.confidence) return <Badge>{forecast.historyDays} dia(s) de histórico</Badge>;
  return (
    <Badge tone={forecast.confidence === 'HIGH' ? 'success' : forecast.confidence === 'MEDIUM' ? 'accent' : 'warning'}>
      {CONFIDENCE_LABEL[forecast.confidence]} · {forecast.historyDays} dias
    </Badge>
  );
}

function ReorderTab() {
  const [coverage, setCoverage] = useState(7);
  const [shopping, setShopping] = useState(false);
  const query = useQuery({
    queryKey: qk.reorder(coverage),
    queryFn: () => api<ReorderResponse>('/forecast/reorder', { query: { coverageDays: coverage } }),
  });

  const items = [...(query.data?.items ?? [])].sort(
    (a, b) => URGENCY_ORDER.indexOf(a.recommendation.urgency) - URGENCY_ORDER.indexOf(b.recommendation.urgency),
  );
  const totalCost = items.reduce((s, i) => s + (i.recommendation.estimatedCost ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Field label="Comprar para quantos dias" hint="Além do prazo de entrega de cada ingrediente." className="sm:w-64">
          <Select value={coverage} onChange={(e) => setCoverage(Number(e.target.value))}>
            {[7, 14, 30].map((d) => (
              <option key={d} value={d}>
                {d} dias
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {totalCost > 0 && (
            <p className="text-sm text-muted">
              Custo estimado das sugestões: <span className="tabular font-semibold text-white">{formatMoney(totalCost)}</span>
            </p>
          )}
          <Button onClick={() => setShopping(true)} disabled={!query.data}>
            <ShoppingCart aria-hidden /> Montar lista de compras
          </Button>
        </div>
      </Card>
      {shopping && <ShoppingListDialog items={items} onClose={() => setShopping(false)} />}

      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState title="Nenhum ingrediente ativo" />
        </Card>
      ) : (
        <>
          <Notice>{query.data.disclaimer}</Notice>
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <ReorderCard key={item.ingredient.id} item={item} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ReorderCard({ item }: { item: ReorderItem }) {
  const [open, setOpen] = useState(false);
  const { ingredient: ing, recommendation: rec, forecast } = item;
  return (
    <li>
      <Card className="p-0 sm:p-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full flex-col gap-3 p-4 text-left sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-semibold">
              {ing.name}
              <UrgencyBadge urgency={rec.urgency} />
              {item.usesEstimatedData && <EstimatedBadge />}
            </p>
            <p className="mt-1 text-sm text-muted">
              Saldo {formatQty(item.stock, ing.baseUnit)}
              {forecast.averageDaily !== null && ` · consumo ~${formatQty(forecast.averageDaily, ing.baseUnit)}/dia`}
              {rec.daysUntilStockout !== null && ` · dura ~${formatNumber(rec.daysUntilStockout, 0)} dia(s)`}
              {` · entrega em ${ing.leadTimeDays} dia(s)`}
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 sm:justify-end">
            <div className="text-right">
              <p className="text-xs text-muted">Sugestão de compra</p>
              <p className="tabular text-lg font-bold">
                {rec.suggestedQuantity !== null ? formatQty(rec.suggestedQuantity, ing.baseUnit) : '—'}
              </p>
              {rec.estimatedCost ? <p className="tabular text-xs text-muted">≈ {formatMoney(rec.estimatedCost)}</p> : null}
            </div>
            <ChevronDown className={cn('size-5 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
          </div>
        </button>
        {open && (
          <div className="flex flex-col gap-2 border-t border-navy-700 p-4 text-sm">
            <p>{rec.explanation}</p>
            <div className="flex flex-wrap gap-2">
              <ConfidenceBadge forecast={forecast} />
              {forecast.total && (
                <Badge>
                  Demanda prevista {formatQty(forecast.total.low, ing.baseUnit)} – {formatQty(forecast.total.high, ing.baseUnit)}
                </Badge>
              )}
              {rec.safetyStock !== null && <Badge>Margem de segurança {formatQty(rec.safetyStock, ing.baseUnit)}</Badge>}
            </div>
            <p className="text-xs text-muted">{forecast.message}</p>
          </div>
        )}
      </Card>
    </li>
  );
}

function DemandTab() {
  const [horizon, setHorizon] = useState(7);
  const query = useQuery({
    queryKey: qk.productForecast(horizon),
    queryFn: () => api<ProductForecastResponse>('/forecast/products', { query: { horizonDays: horizon } }),
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <Field label="Prever os próximos" className="sm:w-64">
          <Select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
            {[7, 14, 30].map((d) => (
              <option key={d} value={d}>
                {d} dias
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Card>
      ) : query.data.items.length === 0 ? (
        <Card>
          <EmptyState title="Nenhum produto ativo" />
        </Card>
      ) : (
        <>
          <Notice>{query.data.disclaimer}</Notice>
          <div className="grid gap-4 lg:grid-cols-2">
            {query.data.items.map(({ product, forecast }) => {
              const unit = product.pricingMode === 'WEIGHT' ? 'vendas' : 'un';
              const fmt = (v: number) => `${formatNumber(v, 0)}`;
              return (
                <Card key={product.id}>
                  {forecast.status === 'OK' && forecast.daily?.length ? (
                    <ChartFrame
                      title={product.name}
                      description={
                        <span className="flex flex-wrap items-center gap-2">
                          {forecast.total &&
                            `${fmt(forecast.total.expected)} ${unit} previstas (${fmt(forecast.total.low)}–${fmt(forecast.total.high)})`}
                          <ConfidenceBadge forecast={forecast} />
                        </span>
                      }
                      chart={<ForecastChart data={forecast.daily} formatX={(d) => formatDay(d)} formatY={fmt} />}
                      table={
                        <Table>
                          <thead>
                            <tr>
                              <Th>Dia</Th>
                              <Th className="text-right">Esperado</Th>
                              <Th className="text-right">Faixa</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {forecast.daily.map((d) => (
                              <Tr key={d.date}>
                                <Td>{formatDay(d.date)}</Td>
                                <Td className="tabular text-right">{formatNumber(d.expected, 1)}</Td>
                                <Td className="tabular text-right text-muted">
                                  {formatNumber(d.low, 1)} – {formatNumber(d.high, 1)}
                                </Td>
                              </Tr>
                            ))}
                          </tbody>
                        </Table>
                      }
                    />
                  ) : (
                    <>
                      <h2 className="font-semibold">{product.name}</h2>
                      <EmptyState title="Histórico insuficiente" description={forecast.message} />
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
