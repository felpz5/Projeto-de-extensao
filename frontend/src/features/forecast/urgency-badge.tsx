import { AlertOctagon, AlertTriangle, CheckCircle2, HelpCircle, ShoppingBag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { URGENCY_LABEL } from '@/lib/format';
import type { ReorderUrgency } from '@/lib/types';

const STYLE: Record<
  ReorderUrgency,
  { tone: 'danger' | 'warning' | 'accent' | 'success' | 'neutral'; Icon: typeof AlertOctagon }
> = {
  OUT_OF_STOCK: { tone: 'danger', Icon: AlertOctagon },
  URGENT: { tone: 'danger', Icon: AlertTriangle },
  BUY: { tone: 'warning', Icon: ShoppingBag },
  LOW_STOCK_NO_HISTORY: { tone: 'warning', Icon: AlertTriangle },
  OK: { tone: 'success', Icon: CheckCircle2 },
  NO_HISTORY: { tone: 'neutral', Icon: HelpCircle },
};

export function UrgencyBadge({ urgency }: { urgency: ReorderUrgency }) {
  const { tone, Icon } = STYLE[urgency];
  return (
    <Badge tone={tone}>
      <Icon aria-hidden />
      {URGENCY_LABEL[urgency]}
    </Badge>
  );
}
