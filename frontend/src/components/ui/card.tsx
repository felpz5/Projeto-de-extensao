import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl border border-navy-700 bg-navy-900 p-4 sm:p-5', className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Número de destaque (KPI). */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'warning' | 'danger';
}) {
  return (
    <Card className="flex min-w-0 flex-col gap-1 p-3 sm:p-5">
      <span className="text-sm text-muted">{label}</span>
      <span
        className={cn(
          'tabular break-words text-lg font-bold sm:text-2xl',
          tone === 'warning' && 'text-warning',
          tone === 'danger' && 'text-danger',
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </Card>
  );
}
