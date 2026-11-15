import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/format';

export function Pagination({
  skip,
  take,
  total,
  onChange,
}: {
  skip: number;
  take: number;
  total: number;
  onChange: (skip: number) => void;
}) {
  if (total <= take) return null;
  const from = skip + 1;
  const to = Math.min(skip + take, total);
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
      <span className="tabular">
        {formatNumber(from, 0)}–{formatNumber(to, 0)} de {formatNumber(total, 0)}
      </span>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={skip === 0}
          onClick={() => onChange(Math.max(0, skip - take))}
        >
          <ChevronLeft aria-hidden /> Anterior
        </Button>
        <Button variant="secondary" size="sm" disabled={to >= total} onClick={() => onChange(skip + take)}>
          Próxima <ChevronRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}
