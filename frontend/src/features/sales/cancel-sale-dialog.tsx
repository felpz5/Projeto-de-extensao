import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Field, Textarea } from '@/components/ui/form';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useInvalidateStock } from '@/lib/queries';
import type { Sale } from '@/lib/types';
import { cn } from '@/lib/utils';

const QUICK_REASONS = ['Valor digitado errado', 'Cliente desistiu', 'Venda registrada em dobro', 'Produto errado'];

/**
 * Cancelar venda: pede o motivo (vai para a auditoria). A venda continua no histórico como
 * cancelada e o estoque que ela baixou é devolvido.
 */
export function CancelSaleDialog({
  sale,
  onClose,
  onDone,
}: {
  sale: Pick<Sale, 'id' | 'totalAmount' | 'soldAt'>;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();
  const invalidate = useInvalidateStock();
  const mutation = useMutation({
    mutationFn: () => api(`/sales/${sale.id}/cancel`, { method: 'POST', body: { reason: reason.trim() } }),
    onSuccess: () => {
      toast.success('Venda cancelada e estoque devolvido.');
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['cash'] });
      onClose();
      onDone?.();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const valid = reason.trim().length >= 3;

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Cancelar venda?"
      description={`${formatMoney(sale.totalAmount)} · ${formatDateTime(sale.soldAt)}. A venda continua no histórico como cancelada e o estoque é devolvido.`}
      confirmLabel="Cancelar venda"
      destructive
      loading={mutation.isPending}
      onConfirm={() => (valid ? mutation.mutate() : toast.error('Informe o motivo do cancelamento.'))}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {QUICK_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs',
                reason === r ? 'border-accent bg-accent/15 text-accent' : 'border-navy-700 text-muted hover:text-white',
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <Field label="Motivo" hint="Fica registrado na auditoria.">
          <Textarea rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </ConfirmDialog>
  );
}
