import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Spinner({ className, label = 'Carregando…' }: { className?: string; label?: string }) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 py-10 text-muted', className)}>
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-navy-800', className)} aria-hidden />;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <div className="text-muted [&_svg]:size-8">{icon ?? <Inbox aria-hidden />}</div>
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <AlertCircle className="size-8 text-danger" aria-hidden />
      <p className="font-semibold">Não foi possível carregar</p>
      <p className="max-w-sm text-sm text-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
          Tentar de novo
        </Button>
      )}
    </div>
  );
}

/** Aviso fixo (ex.: "previsões são estimativas"). */
export function Notice({
  children,
  tone = 'info',
  className,
}: {
  children: ReactNode;
  tone?: 'info' | 'warning';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex gap-2 rounded-lg border px-3 py-2 text-sm',
        tone === 'info' ? 'border-accent/30 bg-accent/5 text-muted' : 'border-warning/40 bg-warning/10 text-warning',
        className,
      )}
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
