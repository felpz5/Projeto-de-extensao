import { useQuery } from '@tanstack/react-query';
import { ChevronDown, LineChart, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { ChartFrame, HistoryForecastChart } from '@/components/charts';
import { Badge, EstimatedBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Notice, PageHeader, Spinner } from '@/components/ui/feedback';
import { Field, Select } from '@/components/ui/form';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import {
  ACCURACY_LABEL,
  HISTORY_LEVEL_LABEL,
  MODEL_SHORT_LABEL,
  formatDay,
  formatMoney,
  formatNumber,
  formatPctFraction,
  formatQty,
} from '@/lib/format';
import { qk } from '@/lib/queries';
import type {
  AccuracyReport,
  AccuracySummary,
  Forecast,
  HorizonResult,
  ModelId,
  ProductForecastDetail,
  ProductForecastItem,
  ProductForecastResponse,
  ReorderItem,
  ReorderResponse,
  ReorderUrgency,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { ShoppingListDialog } from './shopping-list-dialog';
import { UrgencyBadge } from './urgency-badge';

const URGENCY_ORDER: ReorderUrgency[] = ['OUT_OF_STOCK', 'URGENT', 'BUY', 'LOW_STOCK_NO_HISTORY', 'OK', 'NO_HISTORY'];
const MODELS: ModelId[] = ['gestock', 'seasonal-naive', 'naive', 'holt-winters'];
const TABS = [
  ['reposicao', 'Reposição de ingredientes'],
  ['demanda', 'Demanda de produtos'],
  ['precisao', 'Precisão do modelo'],
] as const;
type Tab = (typeof TABS)[number][0];

export function ForecastPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS.find(([k]) => k === params.get('aba'))?.[0] ?? 'reposicao') as Tab;

  return (
    <>
      <PageHeader
        title="Previsão"
        description="Estimativas a partir do histórico registrado — servem para planejar, não são valores exatos."
      />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-navy-700" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams(key === 'reposicao' ? {} : { aba: key }, { replace: true })}
            className={cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-semibold',
              tab === key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-white',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'reposicao' ? <ReorderTab /> : tab === 'demanda' ? <DemandTab /> : <AccuracyTab />}
    </>
  );
}

// ---------- Selos e avisos ----------

function HistoryBadge({ forecast }: { forecast: Pick<Forecast, 'historyLevel' | 'historyDays'> }) {
  return (
    <Badge title="Quantidade de dados usados (não é a precisão)">
      {forecast.historyDays} dia(s) de histórico
      {forecast.historyLevel && ` · ${HISTORY_LEVEL_LABEL[forecast.historyLevel]}`}
    </Badge>
  );
}

/** Precisão MEDIDA no backtesting (nunca deduzida só da quantidade de dias). */
function AccuracyBadge({ accuracy }: { accuracy?: AccuracySummary }) {
  if (!accuracy || accuracy.evidence === 'INSUFFICIENT') {
    return <Badge title="Histórico insuficiente para avaliar a precisão.">Precisão ainda não avaliada</Badge>;
  }
  const g = accuracy.gestock;
  const tone = accuracy.label === 'GOOD' ? 'success' : accuracy.label === 'MODERATE' ? 'accent' : 'warning';
  const value = g?.wape != null ? `erro ${formatPctFraction(g.wape, 0)}` : `erro ~${formatNumber(g?.mae ?? 0, 1)}/dia`;
  return (
    <Badge tone={accuracy.label ? tone : 'neutral'} title={accuracy.message}>
      {accuracy.label ? ACCURACY_LABEL[accuracy.label] : 'Precisão medida'} · {value}
      {accuracy.evidence === 'LIMITED' && ' (preliminar)'}
    </Badge>
  );
}

/** Avisos do item. O de "ambiente de demonstração" já aparece no topo de toda tela. */
function Warnings({ items }: { items?: string[] }) {
  items = items?.filter((w) => !w.startsWith('Ambiente de demonstração'));
  if (!items?.length) return null;
  return (
    <Notice tone="warning">
      <ul className="flex list-disc flex-col gap-0.5 pl-4">
        {items.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </Notice>
  );
}

function SelectNumber({
  label,
  value,
  options,
  onChange,
  suffix = 'dias',
  hint,
}: {
  label: string;
  value: number;
  options: number[];
  onChange: (v: number) => void;
  suffix?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint} className="sm:w-56">
      <Select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {options.map((d) => (
          <option key={d} value={d}>
            {d} {suffix}
          </option>
        ))}
      </Select>
    </Field>
  );
}

// ---------- Reposição ----------

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
        <SelectNumber
          label="Comprar para quantos dias"
          hint="Até a próxima compra, além do prazo de entrega."
          value={coverage}
          options={[7, 14, 30]}
          onChange={setCoverage}
        />
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
              <HistoryBadge forecast={forecast} />
              <AccuracyBadge accuracy={item.accuracy} />
              {forecast.total && (
                <Badge>
                  Demanda prevista {formatQty(forecast.total.low, ing.baseUnit)} – {formatQty(forecast.total.high, ing.baseUnit)}
                </Badge>
              )}
              {rec.safetyStock !== null && <Badge>Margem de segurança {formatQty(rec.safetyStock, ing.baseUnit)}</Badge>}
            </div>
            {item.accuracy && item.accuracy.evidence !== 'INSUFFICIENT' && (
              <p className="text-xs text-muted">{item.accuracy.message}</p>
            )}
            <Warnings items={item.warnings} />
          </div>
        )}
      </Card>
    </li>
  );
}

// ---------- Demanda de produtos ----------

const unitOf = (p: ProductForecastItem['product']) => (p.pricingMode === 'WEIGHT' ? 'vendas' : 'un');

function DemandTab() {
  const [params, setParams] = useSearchParams();
  const [horizon, setHorizon] = useState(7);
  const selected = params.get('produto');
  const query = useQuery({
    queryKey: qk.productForecast(horizon),
    queryFn: () => api<ProductForecastResponse>('/forecast/products', { query: { horizonDays: horizon } }),
  });
  const select = (id: string | null) =>
    setParams(id ? { aba: 'demanda', produto: id } : { aba: 'demanda' }, { replace: true });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SelectNumber label="Prever os próximos" value={horizon} options={[7, 14, 30]} onChange={setHorizon} />
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
          {selected && (
            <ProductDetail
              id={selected}
              horizon={horizon}
              products={query.data.items}
              onSelect={select}
            />
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {query.data.items.map((item) => (
              <ProductCard key={item.product.id} item={item} active={item.product.id === selected} onOpen={() => select(item.product.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProductCard({ item, active, onOpen }: { item: ProductForecastItem; active: boolean; onOpen: () => void }) {
  const { product, forecast } = item;
  const unit = unitOf(product);
  const fmt = (v: number) => formatNumber(v, 0);
  return (
    <Card className={cn('flex flex-col gap-2', active && 'ring-2 ring-accent')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{product.name}</h2>
          <p className="text-xs text-muted">{item.measure}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onOpen} aria-label={`Ver detalhes de ${product.name}`}>
          <LineChart aria-hidden /> Detalhes
        </Button>
      </div>
      {forecast.status === 'OK' && forecast.total ? (
        <p className="text-sm">
          <span className="tabular text-lg font-bold">{fmt(forecast.total.expected)}</span> {unit} previstas
          <span className="text-muted"> (faixa {fmt(forecast.total.low)}–{fmt(forecast.total.high)})</span>
        </p>
      ) : (
        <p className="text-sm text-muted">{forecast.message}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <HistoryBadge forecast={forecast} />
        <AccuracyBadge accuracy={item.accuracy} />
        {item.importedShare > 0 && <Badge>{formatPctFraction(item.importedShare, 0)} importado</Badge>}
      </div>
    </Card>
  );
}

function ProductDetail({
  id,
  horizon,
  products,
  onSelect,
}: {
  id: string;
  horizon: number;
  products: ProductForecastItem[];
  onSelect: (id: string | null) => void;
}) {
  const [lookback, setLookback] = useState(120);
  const query = useQuery({
    queryKey: qk.productForecastDetail(id, horizon, lookback),
    queryFn: () =>
      api<ProductForecastDetail>(`/forecast/products/${id}`, { query: { horizonDays: horizon, lookbackDays: lookback } }),
  });
  const d = query.data;
  const fmt = (v: number) => formatNumber(v, 1);

  return (
    <Card className="flex flex-col gap-4" aria-live="polite">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Field label="Produto" className="sm:w-72">
          <Select value={id} onChange={(e) => onSelect(e.target.value)}>
            {products.map((p) => (
              <option key={p.product.id} value={p.product.id}>
                {p.product.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end gap-2">
          <SelectNumber
            label="Histórico analisado"
            value={lookback}
            options={[60, 120, 180, 365]}
            onChange={setLookback}
            hint="Mais dias = mais simulações de teste."
          />
          <Button variant="ghost" onClick={() => onSelect(null)}>
            Fechar
          </Button>
        </div>
      </div>

      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        d && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{d.product.name}</h2>
              <HistoryBadge forecast={d.forecast} />
              <AccuracyBadge accuracy={d.accuracy} />
              {d.importedShare > 0 && <Badge>{formatPctFraction(d.importedShare, 0)} do histórico importado</Badge>}
            </div>
            <p className="-mt-2 text-sm text-muted">
              Variável prevista: {d.measure} · horizonte de {d.horizonDays} dias · previsão a partir de{' '}
              {formatDay(d.generatedFor)}
            </p>

            {d.forecast.status === 'OK' && d.forecast.daily?.length ? (
              <ChartFrame
                title="Histórico e previsão"
                description={
                  d.forecast.total &&
                  `Total previsto: ${fmt(d.forecast.total.expected)} (faixa ${fmt(d.forecast.total.low)}–${fmt(d.forecast.total.high)})`
                }
                height={280}
                chart={
                  <HistoryForecastChart
                    history={d.history.slice(-56)}
                    forecast={d.forecast.daily}
                    formatX={(v) => formatDay(v, false)}
                    formatY={(v) => formatNumber(v, 0)}
                  />
                }
                table={
                  <Table>
                    <thead>
                      <tr>
                        <Th>Dia</Th>
                        <Th>Tipo</Th>
                        <Th className="text-right">Valor</Th>
                        <Th className="text-right">Faixa</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.history.slice(-28).map((h) => (
                        <Tr key={h.date}>
                          <Td>{formatDay(h.date)}</Td>
                          <Td className="text-muted">Real</Td>
                          <Td className="tabular text-right">{h.value === null ? 'sem estoque' : fmt(h.value)}</Td>
                          <Td />
                        </Tr>
                      ))}
                      {d.forecast.daily.map((f) => (
                        <Tr key={f.date}>
                          <Td>{formatDay(f.date)}</Td>
                          <Td className="text-accent">Previsto</Td>
                          <Td className="tabular text-right">{fmt(f.expected)}</Td>
                          <Td className="tabular text-right text-muted">
                            {fmt(f.low)} – {fmt(f.high)}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                }
              />
            ) : (
              <EmptyState title="Histórico insuficiente" description={d.forecast.message} />
            )}

            <Warnings items={d.warnings} />

            <section aria-labelledby="como-calcula">
              <h3 id="como-calcula" className="mb-1 font-semibold">
                Como esta previsão é calculada
              </h3>
              <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
                {d.explanation.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </section>

            <EvaluationTable detail={d} />
          </>
        )
      )}
    </Card>
  );
}

/** Backtesting do produto: cada modelo × horizonte, nas mesmas datas. */
function EvaluationTable({ detail }: { detail: ProductForecastDetail }) {
  const ev = detail.evaluation;
  const horizons = [...new Set(Object.values(ev.models).flatMap((hs) => (hs ?? []).map((h) => h.horizon)))].sort(
    (a, b) => a - b,
  );
  const get = (m: ModelId, h: number): HorizonResult | undefined => ev.models[m]?.find((r) => r.horizon === h);
  const g7 = get('gestock', horizons.find((h) => (get('gestock', h)?.daily.n ?? 0) > 0) ?? 7);

  return (
    <section aria-labelledby="precisao-produto" className="flex flex-col gap-2">
      <h3 id="precisao-produto" className="font-semibold">
        Precisão nas avaliações históricas (backtesting)
      </h3>
      {ev.status !== 'OK' ? (
        <p className="text-sm text-muted">Histórico insuficiente para avaliar a precisão.</p>
      ) : (
        <>
          <p className="text-sm text-muted">
            O sistema "voltou no tempo" a cada {ev.step} dias, previu usando só os dados até aquela data e comparou
            com o que aconteceu ({ev.evaluatedFrom && formatDay(ev.evaluatedFrom, false)} a{' '}
            {ev.evaluatedTo && formatDay(ev.evaluatedTo, false)}). {detail.accuracy.message}
          </p>
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Modelo</Th>
                  {horizons.map((h) => (
                    <Th key={h} className="text-right">
                      {h} dias
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODELS.filter((m) => ev.models[m]).map((m) => (
                  <Tr key={m}>
                    <Td className={cn(m === 'gestock' && 'font-semibold')} title={ev.labels[m]}>
                      {MODEL_SHORT_LABEL[m]}
                      {m !== 'gestock' && m !== 'holt-winters' && <span className="text-xs text-muted"> (referência)</span>}
                    </Td>
                    {horizons.map((h) => {
                      const r = get(m, h);
                      const best = Math.min(
                        ...MODELS.map((x) => get(x, h)?.daily.mae ?? Infinity),
                      );
                      if (!r || !r.daily.n) return <Td key={h} className="text-right text-muted">—</Td>;
                      return (
                        <Td key={h} className={cn('tabular text-right', r.daily.mae === best && 'font-semibold text-success')}>
                          {r.daily.wape !== null ? formatPctFraction(r.daily.wape) : '—'}
                          <span className="block text-xs text-muted">
                            MAE {formatNumber(r.daily.mae, 2)} · RMSE {formatNumber(r.daily.rmse, 2)}
                          </span>
                        </Td>
                      );
                    })}
                  </Tr>
                ))}
                <Tr>
                  <Td className="text-xs text-muted">Avaliações</Td>
                  {horizons.map((h) => {
                    const r = get('gestock', h);
                    return (
                      <Td key={h} className="tabular text-right text-xs text-muted">
                        {r?.origins ?? 0} datas · {r?.daily.n ?? 0} dias
                      </Td>
                    );
                  })}
                </Tr>
              </tbody>
            </Table>
          </div>
          <p className="text-xs text-muted">
            WAPE = soma dos erros ÷ soma das vendas reais (menor é melhor). Em verde, o menor erro (MAE) de cada
            horizonte.
            {(g7?.calibratedDailyCoverage ?? g7?.dailyCoverage) != null &&
              ` A faixa mostrada (±1 desvio, ${detail.forecast.bandCalibrated ? 'calibrada pelo erro medido' : 'do modelo'}) conteve o valor real em ${formatPctFraction(g7!.calibratedDailyCoverage ?? g7!.dailyCoverage, 0)} dos dias avaliados (~68% seria o esperado se os erros fossem normais).`}
          </p>
        </>
      )}
    </section>
  );
}

// ---------- Precisão da loja ----------

const SOURCE_TEXT: Record<AccuracyReport['dataSource'], string> = {
  DEMO: 'Dados de demonstração (simulados) — não são resultados de uma loja real.',
  REGISTERED: 'Dados registrados no sistema.',
  REGISTERED_AND_IMPORTED: 'Dados registrados no sistema e importados do histórico.',
};

function AccuracyTab() {
  const [lookback, setLookback] = useState(120);
  const [horizon, setHorizon] = useState(7);
  const query = useQuery({
    queryKey: qk.forecastAccuracy(lookback),
    queryFn: () => api<AccuracyReport>('/forecast/accuracy', { query: { lookbackDays: lookback } }),
  });

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <SelectNumber label="Histórico analisado" value={lookback} options={[60, 120, 180, 365]} onChange={setLookback} />
        <SelectNumber label="Horizonte avaliado" value={horizon} options={[7, 14, 30]} onChange={setHorizon} />
      </Card>
      <Notice>
        Como medimos: o sistema simula previsões em datas passadas (a cada 7 dias), usando <b>só</b> os dados
        anteriores a cada data, e compara com o que aconteceu de fato. As referências simples (repetir o último dia ou o
        mesmo dia da semana anterior) mostram se o modelo realmente acrescenta algo. Unidades diferentes nunca são
        misturadas.
      </Notice>
      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Card>
      ) : (
        <>
          <Notice tone={query.data.isDemo ? 'warning' : 'info'}>
            {SOURCE_TEXT[query.data.dataSource]}
            {query.data.importedShare > 0 && ` ${formatPctFraction(query.data.importedShare, 0)} dos pedidos vieram da importação.`}
          </Notice>
          {query.data.groups.map((g) => {
            const h = g.byHorizon.find((x) => x.horizon === horizon);
            const rows = (h?.models ?? []).filter((m) => m.metrics.n > 0);
            const best = Math.min(...rows.map((m) => m.metrics.mae ?? Infinity));
            return (
              <Card key={g.key} className="flex flex-col gap-2">
                <div>
                  <h2 className="font-semibold">{g.label}</h2>
                  <p className="text-xs text-muted">
                    {g.series} série(s) · {g.evaluatedSeries} com avaliação · unidade: {g.unit}
                  </p>
                </div>
                {rows.length === 0 ? (
                  <p className="text-sm text-muted">Histórico insuficiente para avaliar a precisão neste horizonte.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <thead>
                        <tr>
                          <Th>Modelo</Th>
                          <Th className="text-right">WAPE</Th>
                          <Th className="text-right">MAE</Th>
                          <Th className="text-right">RMSE</Th>
                          <Th className="text-right">Viés</Th>
                          <Th className="text-right">Dias avaliados</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {MODELS.map((id) => rows.find((r) => r.model === id))
                          .filter((r) => r !== undefined)
                          .map((r) => (
                            <Tr key={r.model}>
                              <Td className={cn(r.model === 'gestock' && 'font-semibold')}>{MODEL_SHORT_LABEL[r.model]}</Td>
                              <Td className={cn('tabular text-right', r.metrics.mae === best && 'font-semibold text-success')}>
                                {formatPctFraction(r.metrics.wape)}
                              </Td>
                              <Td className="tabular text-right">{formatNumber(r.metrics.mae, 2)}</Td>
                              <Td className="tabular text-right">{formatNumber(r.metrics.rmse, 2)}</Td>
                              <Td className="tabular text-right">{formatNumber(r.metrics.bias, 2)}</Td>
                              <Td className="tabular text-right text-muted">{r.metrics.n}</Td>
                            </Tr>
                          ))}
                      </tbody>
                    </Table>
                  </div>
                )}
                {g.best.length > 1 && (
                  <p className="text-xs text-muted">
                    Menor erro do Gestock (7 dias):{' '}
                    {g.best.map((e) => `${e.name} (${formatPctFraction(e.accuracy.gestock?.wape, 0)})`).join(', ')} · maior
                    erro: {g.worst.map((e) => `${e.name} (${formatPctFraction(e.accuracy.gestock?.wape, 0)})`).join(', ')}
                  </p>
                )}
              </Card>
            );
          })}
          <p className="text-xs text-muted">
            WAPE = Σ|erro| ÷ Σ|real| · MAE = erro médio por dia · RMSE penaliza erros grandes · viés &gt; 0 = superestima.
            Em verde, o modelo com menor erro. Resultado preliminar quando há poucas datas avaliadas.
          </p>
        </>
      )}
    </div>
  );
}
