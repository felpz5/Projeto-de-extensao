import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import type { RemoveResult } from '@/lib/types';

/**
 * Excluir ingrediente/produto. Se ele já tem histórico (vendas, movimentações), a API desativa
 * em vez de apagar — o histórico continua íntegro.
 */
export function RemoveButton({
  path,
  name,
  invalidate,
  onDone,
}: {
  path: string;
  name: string;
  invalidate: string[];
  onDone?: (result: RemoveResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api<RemoveResult>(path, { method: 'DELETE' }),
    onSuccess: (r) => {
      toast.success(r.deactivated ? `"${name}" tem histórico e foi desativado.` : `"${name}" excluído.`);
      invalidate.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      setOpen(false);
      onDone?.(r);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={`Excluir ${name}`}>
        <Trash2 aria-hidden />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Excluir "${name}"?`}
        description="Se já houver histórico, o item é apenas desativado (some das vendas e entradas, mas o histórico continua)."
        confirmLabel="Excluir"
        destructive
        loading={mutation.isPending}
        onConfirm={() => mutation.mutate()}
      />
    </>
  );
}
