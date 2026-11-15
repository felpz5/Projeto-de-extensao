import { EstimatedBadge, Badge } from '@/components/ui/badge';
import { formatDateTime, formatSignedQty, MOVEMENT_LABEL, toNumber } from '@/lib/format';
import type { Movement } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Linha compacta de movimentação (dashboard e listas no celular). */
export function MovementLine({ m }: { m: Movement }) {
  const qty = toNumber(m.quantity);
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{m.ingredient.name}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {MOVEMENT_LABEL[m.type]} · {formatDateTime(m.occurredAt)}
          {m.isEstimated && <EstimatedBadge />}
          {m.reversedAt && <Badge>Estornado</Badge>}
          {m.reversesId && <Badge>Estorno</Badge>}
        </p>
      </div>
      <span
        className={cn(
          'tabular shrink-0 text-sm font-semibold',
          qty > 0 ? 'text-success' : 'text-white',
          m.reversedAt && 'line-through opacity-60',
        )}
      >
        {formatSignedQty(m.quantity, m.ingredient.baseUnit)}
      </span>
    </li>
  );
}
