import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, CircleSlash, Sparkles } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { STATUS_LABEL } from '@/lib/format';
import type { StockStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'bg-navy-700 text-muted',
        accent: 'bg-accent/15 text-accent',
        success: 'bg-success/15 text-success',
        warning: 'bg-warning/15 text-warning',
        danger: 'bg-danger/15 text-danger',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Situação do estoque: sempre ícone + texto (nunca só a cor). */
export function StockBadge({ status }: { status: StockStatus }) {
  const tone = status === 'OK' ? 'success' : status === 'LOW' ? 'warning' : 'danger';
  const Icon = status === 'OK' ? CheckCircle2 : status === 'LOW' ? AlertTriangle : CircleSlash;
  return (
    <Badge tone={tone}>
      <Icon aria-hidden />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/**
 * Regra de ouro (planejamento, 6.3): ingrediente selecionado ≠ quantidade consumida.
 * Todo valor derivado de estimativa leva este selo.
 */
export function EstimatedBadge({ className }: { className?: string }) {
  return (
    <Badge tone="warning" className={className} title="Valor estimado, não medido">
      <Sparkles aria-hidden />
      Estimado
    </Badge>
  );
}
