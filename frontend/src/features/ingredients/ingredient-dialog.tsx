import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { api } from '@/lib/api';
import { UNIT_LABEL, UNIT_NAME } from '@/lib/format';
import { handleFormError } from '@/lib/forms';
import { useCategories } from '@/lib/queries';
import { LIMITS, numberField, optionalNumberField, parseNum, toInput } from '@/lib/schemas';
import type { BaseUnit, Ingredient } from '@/lib/types';

const schema = z.object({
  name: z.string().trim().min(1, 'Informe o nome').max(120),
  categoryId: z.string(),
  baseUnit: z.enum(['G', 'ML', 'UN']),
  minStock: numberField({ min: 0, max: LIMITS.quantity }),
  costPerUnit: optionalNumberField({ min: 0, max: LIMITS.unitCost }),
  leadTimeDays: numberField({ min: 0, max: 90, integer: true }),
  defaultPortion: optionalNumberField({ positive: true, max: LIMITS.quantity }),
  active: z.boolean(),
});
type FormData = z.infer<typeof schema>;

const toForm = (i?: Ingredient): FormData => ({
  name: i?.name ?? '',
  categoryId: i?.categoryId ?? '',
  baseUnit: i?.baseUnit ?? 'G',
  minStock: i ? toInput(i.minStock) : '0',
  costPerUnit: toInput(i?.costPerUnit),
  leadTimeDays: String(i?.leadTimeDays ?? 1),
  defaultPortion: toInput(i?.defaultPortion),
  active: i?.active ?? true,
});

const FIELDS = ['name', 'categoryId', 'baseUnit', 'minStock', 'costPerUnit', 'leadTimeDays', 'defaultPortion', 'active'];

export function IngredientDialog({
  open,
  onOpenChange,
  ingredient,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sem ingrediente = cadastro novo. */
  ingredient?: Ingredient;
}) {
  const queryClient = useQueryClient();
  const categories = useCategories('INGREDIENT');
  const editing = Boolean(ingredient);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: toForm(ingredient) });

  // Só ao abrir ou trocar de ingrediente: a lista recarrega sozinha (ex.: ao voltar para a aba)
  // e isso não pode apagar o que a pessoa está digitando.
  useEffect(() => {
    if (open) reset(toForm(ingredient));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ingredient?.id]);

  const unit = UNIT_LABEL[useWatch({ control, name: 'baseUnit' }) as BaseUnit];

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editing
        ? api(`/ingredients/${ingredient!.id}`, { method: 'PATCH', body })
        : api('/ingredients', { method: 'POST', body }),
    onSuccess: () => {
      toast.success(editing ? 'Ingrediente atualizado.' : 'Ingrediente cadastrado.');
      ['ingredients', 'ingredient', 'inventory', 'forecast', 'dashboard'].forEach((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      );
      onOpenChange(false);
    },
    onError: (err) => handleFormError(err, setError, FIELDS),
  });

  const onSubmit = handleSubmit((d) => {
    const body: Record<string, unknown> = {
      name: d.name,
      categoryId: d.categoryId || null,
      minStock: parseNum(d.minStock),
      costPerUnit: parseNum(d.costPerUnit) ?? null,
      leadTimeDays: parseNum(d.leadTimeDays),
      defaultPortion: parseNum(d.defaultPortion) ?? null,
      active: d.active,
    };
    if (!editing) body.baseUnit = d.baseUnit;
    mutation.mutate(body);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Editar ingrediente' : 'Novo ingrediente'}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="ingredient-form" loading={mutation.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="ingredient-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Nome" error={errors.name?.message}>
          <Input autoFocus placeholder="Ex.: Açaí tradicional" {...register('name')} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Unidade"
            error={errors.baseUnit?.message}
            hint={editing ? 'Não muda depois do cadastro.' : 'Todas as quantidades usam esta unidade.'}
          >
            <Select disabled={editing} {...register('baseUnit')}>
              {(Object.keys(UNIT_NAME) as BaseUnit[]).map((u) => (
                <option key={u} value={u}>
                  {UNIT_NAME[u]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Categoria" error={errors.categoryId?.message}>
            <Select {...register('categoryId')}>
              <option value="">Sem categoria</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Estoque mínimo (${unit})`} error={errors.minStock?.message} hint="Abaixo disso, alerta.">
            <Input inputMode="decimal" {...register('minStock')} />
          </Field>
          <Field label="Prazo de reposição (dias)" error={errors.leadTimeDays?.message} hint="Quanto demora a entrega.">
            <Input inputMode="numeric" {...register('leadTimeDays')} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Custo por ${unit} (R$)`} error={errors.costPerUnit?.message} hint="Opcional">
            <Input inputMode="decimal" placeholder="Ex.: 0,028" {...register('costPerUnit')} />
          </Field>
          <Field
            label={`Porção padrão (${unit})`}
            error={errors.defaultPortion?.message}
            hint="Usada para estimar o consumo em pedidos online."
          >
            <Input inputMode="decimal" placeholder="Ex.: 40" {...register('defaultPortion')} />
          </Field>
        </div>

        {editing && <Checkbox label="Ativo (aparece nas vendas e entradas)" {...register('active')} />}
      </form>
    </Dialog>
  );
}
