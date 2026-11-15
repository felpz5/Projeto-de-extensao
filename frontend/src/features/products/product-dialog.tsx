import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/form';
import { api } from '@/lib/api';
import { handleFormError } from '@/lib/forms';
import { useCategories } from '@/lib/queries';
import { LIMITS, numberField, parseNum, toInput } from '@/lib/schemas';
import type { Product, ProductDetail } from '@/lib/types';

const schema = z.object({
  name: z.string().trim().min(1, 'Informe o nome').max(120),
  categoryId: z.string(),
  pricingMode: z.enum(['UNIT', 'WEIGHT']),
  price: numberField({ min: 0, max: LIMITS.money }),
  active: z.boolean(),
});
type FormData = z.infer<typeof schema>;

const toForm = (p?: Pick<Product, 'name' | 'categoryId' | 'pricingMode' | 'price' | 'active'>): FormData => ({
  name: p?.name ?? '',
  categoryId: p?.categoryId ?? '',
  pricingMode: p?.pricingMode ?? 'UNIT',
  price: p ? toInput(p.price) : '',
  active: p?.active ?? true,
});

export function ProductDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | ProductDetail;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const categories = useCategories('PRODUCT');
  const editing = Boolean(product);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: toForm(product) });

  // Só ao abrir ou trocar de produto: recargas em segundo plano não apagam o que foi digitado.
  useEffect(() => {
    if (open) reset(toForm(product));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id]);

  const mode = useWatch({ control, name: 'pricingMode' });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editing
        ? api<Product>(`/products/${product!.id}`, { method: 'PATCH', body })
        : api<Product>('/products', { method: 'POST', body }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product'] });
      onOpenChange(false);
      if (editing) {
        toast.success('Produto atualizado.');
      } else {
        toast.success('Produto cadastrado. Agora configure a composição.');
        navigate(`/produtos/${saved.id}`);
      }
    },
    onError: (err) => handleFormError(err, setError, ['name', 'categoryId', 'pricingMode', 'price', 'active']),
  });

  const onSubmit = handleSubmit((d) => {
    const body: Record<string, unknown> = {
      name: d.name,
      categoryId: d.categoryId || null,
      price: parseNum(d.price),
      active: d.active,
    };
    if (!editing) body.pricingMode = d.pricingMode;
    mutation.mutate(body);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'Editar produto' : 'Novo produto'}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="product-form" loading={mutation.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Nome" error={errors.name?.message}>
          <Input autoFocus placeholder="Ex.: Açaí no peso" {...register('name')} />
        </Field>
        <Field
          label="Como é vendido"
          error={errors.pricingMode?.message}
          hint={
            editing
              ? 'Não muda depois do cadastro.'
              : mode === 'WEIGHT'
                ? 'Preço por kg; na venda informa-se o peso. Ex.: açaí no peso.'
                : 'Preço fixo por unidade. Ex.: milkshake 500 ml.'
          }
        >
          <Select disabled={editing} {...register('pricingMode')}>
            <option value="UNIT">Por unidade</option>
            <option value="WEIGHT">Por peso (kg)</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={mode === 'WEIGHT' ? 'Preço por kg (R$)' : 'Preço (R$)'} error={errors.price?.message}>
            <Input inputMode="decimal" placeholder="0,00" {...register('price')} />
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
        {editing && <Checkbox label="Ativo (aparece na tela de venda)" {...register('active')} />}
      </form>
    </Dialog>
  );
}
