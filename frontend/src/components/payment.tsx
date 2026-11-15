import { Banknote, CreditCard, HelpCircle, QrCode, Ticket, Wallet, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PAYMENT_LABEL, paymentLabel } from '@/lib/format';
import type { PaymentMethod } from '@/lib/types';
import { cn } from '@/lib/utils';

export const PAYMENT_ICON: Record<PaymentMethod, LucideIcon> = {
  PIX: QrCode,
  CASH: Banknote,
  CREDIT_CARD: CreditCard,
  DEBIT_CARD: Wallet,
  VOUCHER: Ticket,
  OTHER: HelpCircle,
};

const ORDER: PaymentMethod[] = ['PIX', 'CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'VOUCHER', 'OTHER'];

/** Escolha da forma de pagamento com botões grandes (balcão, uma mão só). */
export function PaymentPicker({
  value,
  onChange,
  error,
}: {
  value: PaymentMethod | '';
  onChange: (m: PaymentMethod) => void;
  error?: string;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">Forma de pagamento</legend>
      <div role="radiogroup" aria-label="Forma de pagamento" className="grid grid-cols-3 gap-2">
        {ORDER.map((m) => {
          const Icon = PAYMENT_ICON[m];
          const selected = value === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(m)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-semibold transition-colors',
                selected
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-navy-700 bg-navy-950 text-muted hover:text-white',
              )}
            >
              <Icon className="size-5" aria-hidden />
              {PAYMENT_LABEL[m]}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </fieldset>
  );
}

export function PaymentBadge({ method }: { method: PaymentMethod | null }) {
  const Icon = method ? PAYMENT_ICON[method] : HelpCircle;
  return (
    <Badge>
      <Icon aria-hidden />
      {paymentLabel(method)}
    </Badge>
  );
}
