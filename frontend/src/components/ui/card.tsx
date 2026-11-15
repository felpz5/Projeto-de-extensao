import type { LucideIcon } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-navy-800 bg-gradient-to-b from-navy-900 to-navy-900/70 p-4 shadow-sm shadow-black/20 sm:p-5',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  icon: Icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && <IconChip icon={Icon} size="sm" />}
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export type ChipColor = 'sky' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';

const CHIP: Record<ChipColor, string> = {
  sky: 'bg-sky-400/10 text-sky-300 ring-sky-400/20',
  emerald: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/20',
  amber: 'bg-amber-400/10 text-amber-300 ring-amber-400/20',
  rose: 'bg-rose-400/10 text-rose-300 ring-rose-400/20',
  violet: 'bg-violet-400/10 text-violet-300 ring-violet-400/20',
  slate: 'bg-navy-700/60 text-muted ring-navy-600/40',
};

const GLOW: Record<ChipColor, string> = {
  sky: 'bg-sky-400/10',
  emerald: 'bg-emerald-400/10',
  amber: 'bg-amber-400/10',
  rose: 'bg-rose-400/10',
  violet: 'bg-violet-400/10',
  slate: 'bg-navy-600/10',
};

/** Ícone dentro de um quadradinho colorido (identidade visual de cada assunto). */
export function IconChip({
  icon: Icon,
  color = 'sky',
  size = 'md',
  className,
}: {
  icon: LucideIcon;
  color?: ChipColor;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const box = { sm: 'size-9 rounded-lg [&_svg]:size-4', md: 'size-10 rounded-xl [&_svg]:size-5', lg: 'size-12 rounded-2xl [&_svg]:size-6' }[size];
  return (
    <span className={cn('flex shrink-0 items-center justify-center ring-1 ring-inset', CHIP[color], box, className)} aria-hidden>
      <Icon />
    </span>
  );
}

/** Número de destaque (KPI), com ícone colorido opcional. */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  icon,
  color = 'sky',
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  icon?: LucideIcon;
  color?: ChipColor;
}) {
  return (
    <Card className="relative flex min-w-0 flex-col gap-1 overflow-hidden p-3.5 sm:p-5">
      {icon && <span aria-hidden className={cn('pointer-events-none absolute -right-6 -top-6 size-20 rounded-full blur-2xl', GLOW[color])} />}
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted sm:text-sm">{label}</span>
        {icon && <IconChip icon={icon} color={color} size="sm" className="-mr-1 -mt-1 hidden size-8 sm:flex" />}
      </div>
      <span
        className={cn(
          // quebra só entre palavras (nunca no meio de "R$ 1.741,86")
          'tabular text-lg font-bold tracking-tight [overflow-wrap:normal] sm:text-2xl',
          tone === 'warning' && 'text-warning',
          tone === 'danger' && 'text-danger',
          tone === 'success' && 'text-success',
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </Card>
  );
}

/**
 * Nível do estoque em relação ao mínimo: a barra enche até 2× o mínimo.
 * Vermelho = zerado · amarelo = no mínimo ou abaixo · verde = folgado.
 */
export function StockMeter({ stock, min, className }: { stock: number; min: number; className?: string }) {
  const ref = Math.max(min * 2, 1);
  const pct = Math.max(0, Math.min(100, (stock / ref) * 100));
  const color = stock <= 0 ? 'bg-danger' : stock <= min ? 'bg-warning' : 'bg-success';
  return (
    <div className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-navy-800', className)} aria-hidden>
      <div className={cn('h-full rounded-full transition-[width] duration-700', color)} style={{ width: `${Math.max(pct, stock > 0 ? 3 : 0)}%` }} />
      {/* marca do estoque mínimo (metade da barra) */}
      {min > 0 && <span className="absolute inset-y-0 left-1/2 w-px bg-white/30" />}
    </div>
  );
}
