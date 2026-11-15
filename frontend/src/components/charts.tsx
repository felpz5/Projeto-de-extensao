import { useState, type ReactNode } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { cn } from '@/lib/utils';

/**
 * Gráficos do Gestock: uma série por gráfico, na cor de destaque (#38BDF8, contraste > 3:1
 * sobre o cartão azul-marinho). Grade e eixos discretos, tooltip no hover e, para quem não
 * enxerga o gráfico, a mesma informação em tabela (botão "Tabela").
 */
const ACCENT = '#38BDF8';
const GRID = '#1E3A6B';
const AXIS = '#A9B8D0';

const axisProps = {
  stroke: AXIS,
  tick: { fill: AXIS, fontSize: 12 },
  tickLine: false,
  axisLine: false,
} as const;

function ChartTooltip({
  active,
  payload,
  label,
  formatLabel,
  rows,
}: TooltipProps<number, string> & {
  formatLabel?: (l: string) => string;
  rows: (p: Record<string, unknown>) => { label: string; value: string }[];
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload as Record<string, unknown>;
  return (
    <div className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-white">{formatLabel ? formatLabel(String(label)) : label}</p>
      {rows(datum).map((r) => (
        <p key={r.label} className="tabular flex justify-between gap-4 text-muted">
          <span>{r.label}</span>
          <span className="font-semibold text-white">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Cartão com alternância Gráfico / Tabela. */
export function ChartFrame({
  title,
  description,
  chart,
  table,
  height = 240,
}: {
  title: ReactNode;
  description?: ReactNode;
  chart: ReactNode;
  table: ReactNode;
  height?: number;
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        <div className="flex shrink-0 rounded-lg border border-navy-700 p-0.5 text-xs" role="group" aria-label="Visualização">
          {(['chart', 'table'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                'rounded-md px-2.5 py-1 font-medium',
                view === v ? 'bg-navy-700 text-white' : 'text-muted hover:text-white',
              )}
            >
              {v === 'chart' ? 'Gráfico' : 'Tabela'}
            </button>
          ))}
        </div>
      </div>
      {view === 'chart' ? (
        <div style={{ height }} className="-ml-2">
          {chart}
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto">{table}</div>
      )}
    </div>
  );
}

/** Barras verticais por dia (ex.: faturamento diário). */
export function DailyBars<T extends Record<string, unknown>>({
  data,
  xKey,
  yKey,
  formatX,
  formatY,
  tooltipRows,
}: {
  data: T[];
  xKey: keyof T & string;
  yKey: keyof T & string;
  formatX: (v: string) => string;
  formatY: (v: number) => string;
  tooltipRows: (d: T) => { label: string; value: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="0" />
        <XAxis dataKey={xKey} {...axisProps} tickFormatter={formatX} minTickGap={16} />
        <YAxis {...axisProps} tickFormatter={formatY} width={64} />
        <Tooltip
          cursor={{ fill: 'rgba(56,189,248,0.08)' }}
          content={
            <ChartTooltip
              formatLabel={formatX}
              rows={(d) => tooltipRows(d as T)}
            />
          }
        />
        <Bar dataKey={yKey} fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Previsão: linha do valor esperado + faixa de incerteza (mínimo–máximo) no mesmo tom. */
export function ForecastChart({
  data,
  formatX,
  formatY,
}: {
  data: { date: string; expected: number; low: number; high: number }[];
  formatX: (v: string) => string;
  formatY: (v: number) => string;
}) {
  const rows = data.map((d) => ({ ...d, band: [d.low, d.high] as [number, number] }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={formatX} />
        <YAxis {...axisProps} tickFormatter={formatY} width={64} />
        <Tooltip
          cursor={{ stroke: AXIS, strokeDasharray: '3 3' }}
          content={
            <ChartTooltip
              formatLabel={formatX}
              rows={(d) => [
                { label: 'Esperado', value: formatY(d.expected as number) },
                { label: 'Faixa', value: `${formatY(d.low as number)} – ${formatY(d.high as number)}` },
              ]}
            />
          }
        />
        <Area dataKey="band" stroke="none" fill={ACCENT} fillOpacity={0.18} isAnimationActive={false} />
        <Line
          dataKey="expected"
          stroke={ACCENT}
          strokeWidth={2}
          dot={{ r: 4, fill: ACCENT, stroke: '#0F2040', strokeWidth: 2 }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Ranking horizontal (ex.: produtos mais vendidos), com o valor escrito ao lado da barra. */
export function RankBars({
  data,
  formatValue,
}: {
  data: { label: string; value: number; hint?: string }[];
  formatValue: (v: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="flex flex-col gap-3">
      {/* índice na chave: dois produtos podem ter o mesmo nome */}
      {data.map((d, i) => (
        <li key={`${i}-${d.label}`} title={d.hint}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate">{d.label}</span>
            <span className="tabular shrink-0 font-semibold">{formatValue(d.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-navy-800">
            <div
              className="h-2 rounded-full bg-accent"
              style={{ width: `${Math.max((d.value / max) * 100, 2)}%` }}
            />
          </div>
          {d.hint && <p className="mt-0.5 text-xs text-muted">{d.hint}</p>}
        </li>
      ))}
    </ul>
  );
}
