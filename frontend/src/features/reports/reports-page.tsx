import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, Download, FileSpreadsheet, HelpCircle, Scale, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Pagination } from '@/components/pagination';
import { PeriodSelect, periodRange, type PeriodDays } from '@/components/period-select';
import { Badge, EstimatedBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, Stat } from '@/components/ui/card';
import { EmptyState, ErrorState, Notice, PageHeader, Spinner } from '@/components/ui/feedback';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { downloadCsv, num, type CsvColumn } from '@/lib/csv';
import {
  CHANNEL_LABEL,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPct,
  formatQty,
  formatSignedQty,
  MOVEMENT_LABEL,
  paymentLabel,
  STATUS_LABEL,
  toNumber,
  UNIT_LABEL,
} from '@/lib/format';
import { qk } from '@/lib/queries';
import type {
  CountHistoryEntry,
  Movement,
  Page,
  Product,
  Sale,
  StockLevel,
  StockReport,
} from '@/lib/types';
import { cn } from '@/lib/utils';

const TABS = [
  ['perdas', 'Perdas e ajustes'],
  ['contagens', 'Contagens'],
  ['exportar', 'Exportar planilhas'],
] as const;
type Tab = (typeof TABS)[number][0];

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find(([k]) => k === params.get('aba'))?.[0] ?? 'perdas') as Tab;

  return (
    <>
      <PageHeader title="Relatórios" description="Perdas, precisão das estimativas, contagens e planilhas para o contador." />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-navy-700" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setParams({ aba: key }, { replace: true })}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold',
              tab === key ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-white',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'perdas' && <LossesTab />}
      {tab === 'contagens' && <CountsTab />}
      {tab === 'exportar' && <ExportTab />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------

function LossesTab() {
  const [days, setDays] = useState<PeriodDays>(30);
  const range = periodRange(days);
  const query = useQuery({
    queryKey: qk.stockReport(range),
    queryFn: () => api<StockReport>('/inventory/report', { query: range }),
  });
  const data = query.data;
  const items = (data?.items ?? []).filter((i) => i.lost || i.adjusted || i.consumed || i.manualOut);

  return (
    <div className="flex flex-col gap-4">
      <PeriodSelect value={days} onChange={setDays} />
      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Card>
      ) : (
        data && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Stat
                icon={Trash2}
                color="rose"
                label="Perdido (vencimento, descarte)"
                value={formatMoney(data.totals.lostValue)}
                tone={toNumber(data.totals.lostValue) > 0 ? 'danger' : 'default'}
                hint={`${data.totals.ingredientsWithLoss} ingrediente(s) com perda`}
              />
              <Stat
                icon={Scale}
                color="amber"
                label="Ajustes de inventário"
                value={formatMoney(data.totals.adjustedValue)}
                tone={toNumber(data.totals.adjustedValue) < 0 ? 'warning' : 'default'}
                hint="Negativo = sumiu mais do que as vendas baixaram"
              />
              <Stat
                icon={HelpCircle}
                color="slate"
                label="Sem custo cadastrado"
                value={data.totals.ingredientsWithoutCost}
                hint="Esses ficam fora dos valores em R$"
              />
            </div>

            <Notice>
              <b>Como ler o ajuste:</b> a contagem física corrige o que as baixas estimadas erraram.
              Ajuste <b>negativo</b> = foi consumido mais do que o sistema calculou (a porção padrão ou a
              composição está baixa); <b>positivo</b> = calculou demais.
            </Notice>

            <Card>
              {items.length === 0 ? (
                <EmptyState title="Nada no período" description="Sem consumo, perdas ou ajustes registrados." />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Ingrediente</Th>
                      <Th className="text-right">Consumo em vendas</Th>
                      <Th className="text-right">Perdas</Th>
                      <Th className="text-right">Ajuste</Th>
                      <Th className="text-right">Erro da estimativa</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => {
                      const off = i.adjustmentPct !== null && Math.abs(i.adjustmentPct) >= 10;
                      return (
                        <Tr key={i.ingredientId}>
                          <Td className="font-medium">{i.name}</Td>
                          <Td className="tabular whitespace-nowrap text-right">
                            {formatQty(i.consumed, i.baseUnit)}
                            {i.consumedEstimated > 0 && (
                              <p className="text-xs text-muted">
                                {formatPct((i.consumedEstimated / Math.max(i.consumed, 1)) * 100, 0)} estimado
                              </p>
                            )}
                          </Td>
                          <Td className="tabular whitespace-nowrap text-right">
                            {i.lost ? (
                              <>
                                <span className="text-danger">{formatQty(i.lost, i.baseUnit)}</span>
                                {i.lostValue && <p className="text-xs text-muted">{formatMoney(i.lostValue)}</p>}
                              </>
                            ) : (
                              '—'
                            )}
                          </Td>
                          <Td className="tabular whitespace-nowrap text-right">
                            {i.adjusted ? formatSignedQty(i.adjusted, i.baseUnit) : '—'}
                            {i.adjustedValue && i.adjusted !== 0 && (
                              <p className="text-xs text-muted">{formatMoney(i.adjustedValue)}</p>
                            )}
                          </Td>
                          <Td className="whitespace-nowrap text-right">
                            {i.adjustmentPct === null || i.adjusted === 0 ? (
                              <span className="text-muted">—</span>
                            ) : (
                              <Badge tone={off ? 'warning' : 'success'}>
                                {i.adjustmentPct > 0 ? '+' : ''}
                                {formatPct(i.adjustmentPct)}
                                {off && (i.adjustmentPct < 0 ? ' · estimando por baixo' : ' · estimando por cima')}
                              </Badge>
                            )}
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </Card>
          </>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function CountsTab() {
  const [skip, setSkip] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const take = 20;
  const query = useQuery({
    queryKey: qk.counts({ take, skip }),
    queryFn: () => api<Page<CountHistoryEntry>>('/inventory/counts', { query: { take, skip } }),
    placeholderData: keepPreviousData,
  });

  if (query.isPending) return <Spinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (!query.data.items.length)
    return (
      <Card>
        <EmptyState title="Nenhuma contagem ainda" description="Faça a primeira em Estoque → Contagem." />
      </Card>
    );

  return (
    <div className="flex flex-col gap-3">
      {query.data.items.map((c) => (
        <Card key={c.id} className="p-0 sm:p-0">
          <button
            type="button"
            aria-expanded={open === c.id}
            onClick={() => setOpen(open === c.id ? null : c.id)}
            className="flex w-full items-center justify-between gap-3 p-4 text-left"
          >
            <div>
              <p className="font-semibold">{formatDateTime(c.countedAt)}</p>
              <p className="text-sm text-muted">
                {c.userName ?? 'Alguém'} · {c.counted} item(ns) contado(s) · {c.adjusted} com diferença
              </p>
            </div>
            <ChevronDown className={cn('size-5 text-muted transition-transform', open === c.id && 'rotate-180')} aria-hidden />
          </button>
          {open === c.id && (
            <div className="border-t border-navy-700 p-4">
              <Table>
                <thead>
                  <tr>
                    <Th>Ingrediente</Th>
                    <Th className="text-right">Sistema</Th>
                    <Th className="text-right">Contado</Th>
                    <Th className="text-right">Diferença</Th>
                  </tr>
                </thead>
                <tbody>
                  {c.items.map((i) => {
                    const d = toNumber(i.difference);
                    return (
                      <Tr key={i.ingredientId}>
                        <Td>{i.name}</Td>
                        <Td className="tabular text-right text-muted">{formatQty(i.previous, i.baseUnit)}</Td>
                        <Td className="tabular text-right">{formatQty(i.counted, i.baseUnit)}</Td>
                        <Td className={cn('tabular text-right font-semibold', d > 0 ? 'text-success' : d < 0 ? 'text-warning' : 'text-muted')}>
                          {d === 0 ? '0' : formatSignedQty(d, i.baseUnit)}
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </Card>
      ))}
      <Pagination skip={skip} take={take} total={query.data.total} onChange={setSkip} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

/** Busca todas as páginas de uma listagem paginada (limite de segurança: 10 mil linhas). */
async function fetchAll<T>(path: string, query: Record<string, string | undefined>) {
  const all: T[] = [];
  for (let page = 0; page < 50; page++) {
    const res = await api<Page<T>>(path, { query: { ...query, take: 200, skip: page * 200 } });
    all.push(...res.items);
    if (all.length >= res.total) break;
  }
  return all;
}

function ExportTab() {
  const [days, setDays] = useState<PeriodDays>(30);
  const [busy, setBusy] = useState<string | null>(null);
  const range = periodRange(days);
  const suffix = `${range.from}-a-${range.to}`;

  const run = async (key: string, fn: () => Promise<number>) => {
    setBusy(key);
    try {
      const n = await fn();
      toast.success(`Planilha gerada (${n} linha${n === 1 ? '' : 's'}).`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const exports: { key: string; title: string; text: string; period: boolean; fn: () => Promise<number> }[] = [
    {
      key: 'sales',
      title: 'Vendas',
      text: 'Cada venda do período, com pagamento, situação e quem registrou.',
      period: true,
      fn: async () => {
        const rows = await fetchAll<Sale>('/sales', range);
        const cols: CsvColumn<Sale>[] = [
          { header: 'Data', value: (s) => formatDateTime(s.soldAt) },
          { header: 'Canal', value: (s) => CHANNEL_LABEL[s.channel] },
          { header: 'Pagamento', value: (s) => paymentLabel(s.paymentMethod) },
          { header: 'Situação', value: (s) => (s.status === 'CANCELED' ? 'Cancelada' : 'Concluída') },
          { header: 'Itens', value: (s) => s.items.map((i) => `${formatNumber(i.quantity, 3)}x ${i.product.name}`).join(', ') },
          { header: 'Valor (R$)', value: (s) => num(s.totalAmount) },
          { header: 'Registrada por', value: (s) => s.createdByName ?? '' },
        ];
        downloadCsv(`vendas-${suffix}`, rows, cols);
        return rows.length;
      },
    },
    {
      key: 'movements',
      title: 'Movimentações de estoque',
      text: 'Entradas, consumo das vendas, perdas, ajustes e estornos do período.',
      period: true,
      fn: async () => {
        const rows = await fetchAll<Movement>('/inventory/movements', range);
        downloadCsv(`movimentacoes-${suffix}`, rows, [
          { header: 'Data', value: (m) => formatDateTime(m.occurredAt) },
          { header: 'Ingrediente', value: (m) => m.ingredient.name },
          { header: 'Tipo', value: (m) => MOVEMENT_LABEL[m.type] },
          { header: 'Quantidade', value: (m) => num(m.quantity) },
          { header: 'Unidade', value: (m) => UNIT_LABEL[m.ingredient.baseUnit] },
          { header: 'Custo unitário (R$)', value: (m) => num(m.unitCost) },
          { header: 'Estimado', value: (m) => (m.isEstimated ? 'sim' : 'não') },
          { header: 'Estornado', value: (m) => (m.reversedAt ? 'sim' : m.reversesId ? 'estorno' : 'não') },
          { header: 'Observação', value: (m) => m.note ?? '' },
        ]);
        return rows.length;
      },
    },
    {
      key: 'stock',
      title: 'Estoque atual',
      text: 'Saldo, mínimo, situação e valor de cada ingrediente agora.',
      period: false,
      fn: async () => {
        const rows = await api<StockLevel[]>('/inventory/levels');
        downloadCsv(`estoque-${range.to}`, rows, [
          { header: 'Ingrediente', value: (l) => l.name },
          { header: 'Categoria', value: (l) => l.category?.name ?? '' },
          { header: 'Saldo', value: (l) => num(l.stock) },
          { header: 'Mínimo', value: (l) => num(l.minStock) },
          { header: 'Unidade', value: (l) => UNIT_LABEL[l.baseUnit] },
          { header: 'Situação', value: (l) => STATUS_LABEL[l.status] },
          { header: 'Valor (R$)', value: (l) => num(l.stockValue) },
        ]);
        return rows.length;
      },
    },
    {
      key: 'products',
      title: 'Produtos, custo e margem',
      text: 'Preço, custo pelos ingredientes e margem de cada produto.',
      period: false,
      fn: async () => {
        const rows = await api<Product[]>('/products');
        downloadCsv(`produtos-margem-${range.to}`, rows, [
          { header: 'Produto', value: (p) => p.name },
          { header: 'Vendido por', value: (p) => (p.pricingMode === 'WEIGHT' ? 'kg' : 'unidade') },
          { header: 'Preço (R$)', value: (p) => num(p.price) },
          { header: 'Custo (R$)', value: (p) => num(p.costing?.cost) },
          { header: 'Margem (R$)', value: (p) => num(p.costing?.margin) },
          { header: 'Margem (%)', value: (p) => p.costing?.marginPct ?? null },
          { header: 'Ingredientes sem custo', value: (p) => p.costing?.missingCost.join(', ') ?? '' },
          { header: 'Ativo', value: (p) => (p.active ? 'sim' : 'não') },
        ]);
        return rows.length;
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">Período das planilhas de vendas e movimentações:</p>
        <PeriodSelect value={days} onChange={setDays} />
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        {exports.map((e) => (
          <Card key={e.key} className="flex flex-col gap-3">
            <CardHeader
              className="mb-0"
              title={
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="size-4 text-accent" aria-hidden /> {e.title}
                </span>
              }
              description={e.text}
            />
            <Button variant="secondary" onClick={() => run(e.key, e.fn)} loading={busy === e.key} disabled={busy !== null}>
              <Download aria-hidden /> Baixar CSV{e.period ? ` (${days} dias)` : ''}
            </Button>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted">
        Os arquivos abrem direto no Excel ou no Google Planilhas (separador “;”, números com vírgula).{' '}
        <EstimatedBadge className="ml-1" /> Consumo estimado aparece marcado na planilha de movimentações.
      </p>
    </div>
  );
}

