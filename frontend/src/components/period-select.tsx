import { today } from '@/lib/format';
import { cn } from '@/lib/utils';

export const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
] as const;

export type PeriodDays = (typeof PERIODS)[number]['days'];

/** Período em dias inteiros no fuso da loja (a API entende YYYY-MM-DD como o dia todo). */
export function periodRange(days: number) {
  return { from: today(-(days - 1)), to: today() };
}

export function PeriodSelect({
  value,
  onChange,
}: {
  value: PeriodDays;
  onChange: (days: PeriodDays) => void;
}) {
  return (
    <div className="flex rounded-lg border border-navy-700 bg-navy-900 p-0.5 text-sm" role="group" aria-label="Período">
      {PERIODS.map((p) => (
        <button
          key={p.days}
          type="button"
          aria-pressed={value === p.days}
          onClick={() => onChange(p.days)}
          className={cn(
            'rounded-md px-3 py-1.5 font-medium',
            value === p.days ? 'bg-navy-700 text-white' : 'text-muted hover:text-white',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
