import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Minus, Plus, Store, Globe, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useFieldArray, useForm, useWatch, type Control } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { EstimatedBadge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Notice, PageHeader, Spinner } from '@/components/ui/feedback';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/form';
import { useAuth } from '@/features/auth/auth-context';
import { api, errorMessage } from '@/lib/api';
import {
  formatMoney,
  formatQty,
  localInputToIso,
  nowLocalInput,
  toNumber,
  UNIT_LABEL,
} from '@/lib/format';
import { useIngredients, useInvalidateStock, useProducts } from '@/lib/queries';
import { LIMITS, optionalNumberField, parseNum } from '@/lib/schemas';
import type { Channel, Ingredient, Product, Sale } from '@/lib/types';
import { cn } from '@/lib/utils';

const itemSchema = z.object({
  productId: z.string().min(1, 'Escolha o produto'),
  quantity: optionalNumberField({ positive: true, max: LIMITS.itemQuantity }),
  weightG: optionalNumberField({ positive: true, max: LIMITS.weightG }),
  unitPrice: optionalNumberField({ min: 0, max: LIMITS.money }),
  ingredientIds: z.array(z.string()),
});

const schema = z.object({
  channel: z.enum(['IN_STORE', 'ONLINE']),
  items: z.array(itemSchema).min(1, 'Adicione pelo menos um item'),
  totalAmount: optionalNumberField({ min: 0, max: LIMITS.money }),
  customDate: z.boolean(),
  soldAt: z.string(),
  notes: z.string().max(500),
});
type FormData = z.infer<typeof schema>;
type ItemData = FormData['items'][number];

const emptyItem = (productId = ''): ItemData => ({
  productId,
  quantity: '1',
  weightG: '',
  unitPrice: '',
  ingredientIds: [],
});

/** Valor estimado de um item (mesma regra da API: preço/kg × peso, ou preço × quantidade). */
function itemValue(item: ItemData, product: Product | undefined): number | null {
  if (!product) return null;
  const qty = parseNum(item.quantity) ?? 1;
  const override = parseNum(item.unitPrice);
  if (override !== undefined) return override * qty;
  if (product.pricingMode === 'UNIT') return toNumber(product.price) * qty;
  const weight = parseNum(item.weightG);
  return weight !== undefined ? (toNumber(product.price) * weight) / 1000 : null;
}

/**
 * Registro de venda — tela principal do funcionário no balcão, pensada para o celular.
 * Balcão: valor e peso do pote (ingredientes não são informados).
 * Online: ingredientes escolhidos pelo cliente (baixa estimada pela porção padrão).
 */
export function NewSalePage() {
  const products = useProducts({ active: true });
  const ingredients = useIngredients({ active: true });

  if (products.isPending || ingredients.isPending) return <Spinner />;
  if (products.isError) return <ErrorState error={products.error} onRetry={() => products.refetch()} />;
  if (ingredients.isError)
    return <ErrorState error={ingredients.error} onRetry={() => ingredients.refetch()} />;

  return <SaleForm products={products.data} ingredients={ingredients.data} />;
}

function SaleForm({ products, ingredients }: { products: Product[]; ingredients: Ingredient[] }) {
  const { isManager } = useAuth();
  const invalidate = useInvalidateStock();
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const defaultProduct = products.find((p) => p.pricingMode === 'WEIGHT') ?? products[0];

  const defaults = (channel: Channel = 'IN_STORE'): FormData => ({
    channel,
    items: [emptyItem(defaultProduct?.id)],
    totalAmount: '',
    customDate: false,
    soldAt: nowLocalInput(),
    notes: '',
  });

  const {
    register,
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: defaults() });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const channel = useWatch({ control, name: 'channel' });
  const items = useWatch({ control, name: 'items' });
  const customDate = useWatch({ control, name: 'customDate' });
  const typedTotal = parseNum(useWatch({ control, name: 'totalAmount' }));

  const values = items.map((i) => itemValue(i, productMap.get(i.productId)));
  const computed = values.every((v) => v !== null)
    ? values.reduce<number>((s, v) => s + (v ?? 0), 0)
    : null;

  const mutation = useMutation({
    mutationFn: (body: unknown) => api<Sale>('/sales', { method: 'POST', body }),
    onSuccess: (sale) => {
      toast.success(`Venda registrada: ${formatMoney(sale.totalAmount)}`);
      invalidate();
      reset(defaults(channel));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const onSubmit = handleSubmit((data) => {
    const total = parseNum(data.totalAmount);
    // Item por peso precisa de peso ou valor — exceto venda de um item só com o valor total.
    for (const [i, item] of data.items.entries()) {
      const product = productMap.get(item.productId);
      const singleWithTotal = data.items.length === 1 && total !== undefined;
      if (
        product?.pricingMode === 'WEIGHT' &&
        parseNum(item.weightG) === undefined &&
        parseNum(item.unitPrice) === undefined &&
        !singleWithTotal
      ) {
        toast.error(`Item ${i + 1}: informe o peso ou o valor de "${product.name}".`);
        return;
      }
    }

    mutation.mutate({
      channel: data.channel,
      soldAt: data.customDate && data.soldAt ? localInputToIso(data.soldAt) : undefined,
      totalAmount: total,
      notes: data.notes.trim() || undefined,
      items: data.items.map((item) => ({
        productId: item.productId,
        quantity: parseNum(item.quantity) ?? 1,
        weightG: parseNum(item.weightG),
        unitPrice: parseNum(item.unitPrice),
        ingredients:
          data.channel === 'ONLINE' && item.ingredientIds.length
            ? item.ingredientIds.map((ingredientId) => ({ ingredientId }))
            : undefined,
      })),
    });
  });

  if (!products.length) {
    return (
      <>
        <PageHeader title="Nova venda" />
        <Card>
          <EmptyState
            title="Nenhum produto ativo"
            description={
              isManager
                ? 'Cadastre os produtos que você vende para registrar vendas.'
                : 'Peça para o gerente cadastrar os produtos.'
            }
            action={
              isManager && (
                <Link to="/produtos" className={buttonVariants()}>
                  Cadastrar produtos
                </Link>
              )
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Nova venda" />
      <form onSubmit={onSubmit} className="mx-auto flex max-w-2xl flex-col gap-4" noValidate>
        {/* Canal */}
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Canal da venda">
          {(
            [
              { value: 'IN_STORE', label: 'Balcão', icon: Store },
              { value: 'ONLINE', label: 'Online', icon: Globe },
            ] as const
          ).map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={channel === c.value}
              onClick={() => setValue('channel', c.value)}
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold',
                channel === c.value
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-navy-700 bg-navy-900 text-muted',
              )}
            >
              <c.icon className="size-4" aria-hidden /> {c.label}
            </button>
          ))}
        </div>

        {fields.map((field, index) => (
          <ItemCard
            key={field.id}
            index={index}
            control={control}
            register={register}
            setValue={setValue}
            products={products}
            product={productMap.get(items[index]?.productId)}
            ingredients={ingredients}
            channel={channel}
            value={values[index]}
            canRemove={fields.length > 1}
            onRemove={() => remove(index)}
            error={errors.items?.[index]}
          />
        ))}

        <Button variant="secondary" onClick={() => append(emptyItem(defaultProduct?.id))}>
          <Plus aria-hidden /> Adicionar item
        </Button>

        <Card className="flex flex-col gap-4">
          <Field
            label="Valor cobrado (R$)"
            error={errors.totalAmount?.message}
            hint={
              computed !== null
                ? `Deixe em branco para usar ${formatMoney(computed)} (soma dos itens).`
                : 'Valor anotado/cobrado do cliente.'
            }
          >
            <Input inputMode="decimal" placeholder={computed !== null ? formatMoney(computed) : '0,00'} {...register('totalAmount')} />
          </Field>

          <Checkbox label="A venda foi em outra data/hora" {...register('customDate')} />
          {customDate && (
            <Field label="Data e hora da venda">
              <Input type="datetime-local" max={nowLocalInput()} {...register('soldAt')} />
            </Field>
          )}

          <Field label="Observações" error={errors.notes?.message}>
            <Textarea rows={2} {...register('notes')} />
          </Field>
        </Card>

        <div className="sticky bottom-20 z-10 lg:bottom-4">
          <Button type="submit" size="lg" className="w-full shadow-lg shadow-navy-950" loading={mutation.isPending}>
            Registrar venda
            {(typedTotal ?? computed) !== null && ` · ${formatMoney(typedTotal ?? computed ?? 0)}`}
          </Button>
        </div>
      </form>
    </>
  );
}

interface ItemCardProps {
  index: number;
  control: Control<FormData>;
  register: ReturnType<typeof useForm<FormData>>['register'];
  setValue: ReturnType<typeof useForm<FormData>>['setValue'];
  products: Product[];
  product: Product | undefined;
  ingredients: Ingredient[];
  channel: Channel;
  value: number | null;
  canRemove: boolean;
  onRemove: () => void;
  error?: { productId?: { message?: string }; quantity?: { message?: string }; weightG?: { message?: string }; unitPrice?: { message?: string } };
}

function ItemCard({
  index,
  control,
  register,
  setValue,
  products,
  product,
  ingredients,
  channel,
  value,
  canRemove,
  onRemove,
  error,
}: ItemCardProps) {
  const quantity = useWatch({ control, name: `items.${index}.quantity` });
  const selected = useWatch({ control, name: `items.${index}.ingredientIds` }) ?? [];
  const isWeight = product?.pricingMode === 'WEIGHT';

  const step = (delta: number) => {
    const next = Math.max(1, Math.round((parseNum(quantity) ?? 1) + delta));
    setValue(`items.${index}.quantity`, String(next));
  };

  const toggleIngredient = (id: string) =>
    setValue(
      `items.${index}.ingredientIds`,
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );

  const withoutPortion = ingredients.filter((i) => selected.includes(i.id) && !i.defaultPortion);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-muted">Item {index + 1}</span>
        <div className="flex items-center gap-2">
          {value !== null && <span className="tabular text-sm font-semibold">{formatMoney(value)}</span>}
          {canRemove && (
            <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remover item ${index + 1}`}>
              <Trash2 aria-hidden />
            </Button>
          )}
        </div>
      </div>

      <Field label="Produto" error={error?.productId?.message}>
        <Select {...register(`items.${index}.productId`)}>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {formatMoney(p.price)}
              {p.pricingMode === 'WEIGHT' ? '/kg' : ''}
            </option>
          ))}
        </Select>
      </Field>

      {isWeight ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Peso (g)" error={error?.weightG?.message}>
            <Input inputMode="decimal" placeholder="Ex.: 350" {...register(`items.${index}.weightG`)} />
          </Field>
          <Field label="Valor do item (R$)" error={error?.unitPrice?.message} hint="Opcional">
            <Input inputMode="decimal" placeholder="Calculado" {...register(`items.${index}.unitPrice`)} />
          </Field>
        </div>
      ) : (
        <Field label="Quantidade" error={error?.quantity?.message}>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="icon" onClick={() => step(-1)} aria-label="Diminuir">
              <Minus aria-hidden />
            </Button>
            <Input inputMode="numeric" className="w-20 text-center" {...register(`items.${index}.quantity`)} />
            <Button variant="secondary" size="icon" onClick={() => step(1)} aria-label="Aumentar">
              <Plus aria-hidden />
            </Button>
          </div>
        </Field>
      )}

      {channel === 'ONLINE' && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Ingredientes escolhidos pelo cliente</legend>
          <div className="flex flex-wrap gap-2">
            {ingredients.map((ing) => {
              const on = selected.includes(ing.id);
              return (
                <button
                  key={ing.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleIngredient(ing.id)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm',
                    on ? 'border-accent bg-accent/15 text-accent' : 'border-navy-700 text-muted hover:text-white',
                  )}
                >
                  {ing.name}
                  {ing.defaultPortion && (
                    <span className="ml-1 text-xs opacity-70">
                      {formatQty(ing.defaultPortion, ing.baseUnit)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <EstimatedBadge /> A baixa usa a porção padrão de cada ingrediente
              {quantity && (parseNum(quantity) ?? 1) > 1 && ` × ${quantity} ${UNIT_LABEL.UN}`}.
            </p>
          )}
          {withoutPortion.length > 0 && (
            <Notice tone="warning" className="mt-2">
              Sem porção padrão: {withoutPortion.map((i) => i.name).join(', ')}. Conta como uso, mas
              não baixa estoque — o inventário corrige depois.
            </Notice>
          )}
        </fieldset>
      )}

      {channel === 'IN_STORE' && isWeight && product && product._count.weightMix > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <EstimatedBadge /> Com o peso, a baixa de ingredientes usa a composição média do produto.
        </p>
      )}
    </Card>
  );
}
