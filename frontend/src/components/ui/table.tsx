import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Tabela com rolagem horizontal própria (a página nunca rola para o lado).
 * `relative` prende os cabeçalhos `sr-only` (position: absolute) dentro da área com rolagem.
 */
export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative -mx-4 overflow-x-auto sm:mx-0">
      <table className={cn('w-full min-w-max text-sm', className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'border-b border-navy-700 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted first:pl-4 sm:first:pl-2',
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn('border-b border-navy-800 px-4 py-2.5 align-middle sm:first:pl-2', className)}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('hover:bg-navy-800/50', className)} {...props} />;
}
