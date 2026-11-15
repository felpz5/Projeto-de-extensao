import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { useAuth } from '@/features/auth/auth-context';
import { api } from '@/lib/api';
import {
  formatQty,
  localInputToIso,
  MOVEMENT_LABEL,
  nowLocalInput,
  UNIT_LABEL,
} from '@/lib/format';
import { handleFormError } from '@/lib/forms';
import { useIngredients, useInvalidateStock } from '@/lib/queries';
import { LIMITS, numberField, optionalNumberField, parseNum } from '@/lib/schemas';
import type { ManualMovementType } from '@/lib/types';

/** Funcionário só lança compra (mercadoria que chegou); o resto é de gerente/dono (a API confere). */
const STAFF_TYPES: ManualMovementType[] = ['PURCHASE'];
const MANAGER_TYPES: ManualMovementType[] = ['PURCHASE', 'INITIAL', 'MANUAL_OUT', 'LOSS', 'ADJUSTMENT'];

const HELP: Record<ManualMovementType, string> = {
  PURCHASE: 'Mercadoria que chegou. Soma ao saldo.',
  INITIAL: 'Saldo de partida ao começar a usar o sistema.',
  MANUAL_OUT: 'Saída que não é venda (ex.: uso interno). Subtrai do saldo.',
  LOSS: 'Perda, vencimento ou descarte. Subtrai do saldo.',
  ADJUSTMENT: 'Correção com sinal: use + para somar ou − para subtrair. Para contar o estoque inteiro, use a Contagem.',
};

const schema = z
  .object({
    ingredientId: z.string().min(1, 'Escolha o ingrediente'),
    type: z.enum(['INITIAL', 'PURCHASE', 'MANUAL_OUT', 'LOSS', 'ADJUSTMENT']),
    quantity: numberField({ max: LIMITS.quantity }),
    unitCost: optionalNumberField({ min: 0, max: LIMITS.unitCost }),
    customDate: z.boolean(),
    occurredAt: z.string(),
    note: z.string().max(500),
  })
  .superRefine((d, ctx) => {
    const q = parseNum(d.quantity);
    if (q === undefined) return;
    if (q === 0) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Não pode ser zero' });
    else if (d.type !== 'ADJUSTMENT' && q < 0)
      ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Informe um valor positivo (o tipo define o sinal)' });
  });
type FormData = z.infer<typeof schema>;

export function MovementDialog({
  open,
  onOpenChange,
  ingredientId,
  initialType = 'PURCHASE',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ingredientId?: string;
  initialType?: ManualMovementType;
}) {
  const { isManager } = useAuth();
  const ingredients = useIngredients({ active: true });
  const invalidate = useInvalidateStock();
  const types = isManager ? MANAGER_TYPES : STAFF_TYPES;

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      ingredientId: ingredientId ?? '',
      type: initialType,
      quantity: '',
      unitCost: '',
      customDate: false,
      occurredAt: nowLocalInput(),
      note: '',
    },
  });

  useEffect(() => {
    if (open)
      reset({
        ingredientId: ingredientId ?? '',
        type: types.includes(initialType) ? initialType : 'PURCHASE',
        quantity: '',
        unitCost: '',
        customDate: false,
        occurredAt: nowLocalInput(),
        note: '',
      });
  }, [open, ingredientId, initialType]);

  const type = useWatch({ control, name: 'type' });
  const selectedId = useWatch({ control, name: 'ingredientId' });
  const customDate = useWatch({ control, name: 'customDate' });
  const ingredient = ingredients.data?.find((i) => i.id === selectedId);
  const unit = ingredient ? UNIT_LABEL[ingredient.baseUnit] : '';

  const mutation = useMutation({
    mutationFn: (body: unknown) => api('/inventory/movements', { method: 'POST', body }),
    onSuccess: () => {
      toast.success('Movimentação registrada.');
      invalidate();
      onOpenChange(false);
    },
    onError: (err) => handleFormError(err, setError, ['ingredientId', 'type', 'quantity', 'unitCost', 'occurredAt', 'note']),
  });

  const onSubmit = handleSubmit((d) =>
    mutation.mutate({
      ingredientId: d.ingredientId,
      type: d.type,
      quantity: parseNum(d.quantity),
      unitCost: parseNum(d.unitCost),
      occurredAt: d.customDate && d.occurredAt ? localInputToIso(d.occurredAt) : undefined,
      note: d.note.trim() || undefined,
    }),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isManager ? 'Lançar movimentação' : 'Registrar entrada'}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="movement-form" loading={mutation.isPending}>
            Registrar
          </Button>
        </>
      }
    >
      <form id="movement-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Ingrediente" error={errors.ingredientId?.message}>
          <Select {...register('ingredientId')}>
            <option value="">Selecione…</option>
            {ingredients.data?.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} (saldo {formatQty(i.stock, i.baseUnit)})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Tipo" error={errors.type?.message} hint={HELP[type]}>
          <Select {...register('type')}>
            {types.map((t) => (
              <option key={t} value={t}>
                {MOVEMENT_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Quantidade${unit ? ` (${unit})` : ''}`} error={errors.quantity?.message}>
            <Input inputMode={type === 'ADJUSTMENT' ? 'text' : 'decimal'} placeholder={type === 'ADJUSTMENT' ? 'Ex.: -500' : 'Ex.: 5000'} {...register('quantity')} />
          </Field>
          {(type === 'PURCHASE' || type === 'INITIAL') && (
            <Field
              label={`Custo por ${unit || 'unidade'} (R$)`}
              error={errors.unitCost?.message}
              hint="Opcional"
            >
              <Input inputMode="decimal" placeholder="Ex.: 0,028" {...register('unitCost')} />
            </Field>
          )}
        </div>

        <Checkbox label="Aconteceu em outra data/hora" {...register('customDate')} />
        {customDate && (
          <Field label="Data e hora" error={errors.occurredAt?.message}>
            <Input type="datetime-local" max={nowLocalInput()} {...register('occurredAt')} />
          </Field>
        )}

        <Field label="Observação" error={errors.note?.message}>
          <Textarea rows={2} placeholder="Ex.: nota fiscal 123, fornecedor X" {...register('note')} />
        </Field>
      </form>
    </Dialog>
  );
}
