import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { RemoveButton } from '@/components/remove-button';
import { Badge, EstimatedBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, Notice, PageHeader, Spinner } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/form';
import { useAuth } from '@/features/auth/auth-context';
import { api, errorMessage } from '@/lib/api';
import { formatMoney, formatNumber, formatQty, toNumber, UNIT_LABEL } from '@/lib/format';
import { qk, useIngredients } from '@/lib/queries';
import { parseNum, toInput } from '@/lib/schemas';
import type { Ingredient, ProductDetail } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CostingCard } from './costing';
import { ProductDialog } from './product-dialog';

export function ProductDetailPage() {
  const { id = '' } = useParams();
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const query = useQuery({ queryKey: qk.product(id), queryFn: () => api<ProductDetail>(`/products/${id}`) });

  if (query.isPending) return <Spinner />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const p = query.data;

  return (
    <>
      <Link to="/produtos" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Produtos
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.name}
            {!p.active && <Badge>Inativo</Badge>}
          </span>
        }
        description={`${p.pricingMode === 'WEIGHT' ? 'Vendido por peso' : 'Vendido por unidade'} · ${formatMoney(p.price)}${p.pricingMode === 'WEIGHT' ? '/kg' : ''}${p.category ? ` · ${p.category.name}` : ''}`}
        actions={
          isManager && (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil aria-hidden /> Editar
              </Button>
              <RemoveButton
                path={`/products/${p.id}`}
                name={p.name}
                invalidate={['products', 'product']}
                onDone={(r) => r.deleted && navigate('/produtos', { replace: true })}
              />
            </>
          )
        }
      />

      {p.costing && (
        <div className="mb-4">
          <CostingCard costing={p.costing} price={p.price} />
        </div>
      )}

      {p.pricingMode === 'UNIT' ? (
        <CompositionEditor
          key={`recipe-${p.id}`}
          product={p}
          kind="recipe"
          editable={isManager}
          onSaved={() => query.refetch()}
        />
      ) : (
        <CompositionEditor
          key={`mix-${p.id}`}
          product={p}
          kind="weight-mix"
          editable={isManager}
          onSaved={() => query.refetch()}
        />
      )}

      <ProductDialog open={editing} onOpenChange={setEditing} product={p} />
    </>
  );
}

interface Row {
  ingredientId: string;
  value: string;
}

/**
 * Receita fixa (produto por unidade): quantidade de cada ingrediente para 1 unidade → baixa exata.
 * Composição média (produto por peso): % de cada ingrediente no peso → baixa ESTIMADA.
 */
function CompositionEditor({
  product,
  kind,
  editable,
  onSaved,
}: {
  product: ProductDetail;
  kind: 'recipe' | 'weight-mix';
  editable: boolean;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const ingredients = useIngredients({ active: true });
  const isRecipe = kind === 'recipe';

  const initial = (): Row[] =>
    isRecipe
      ? product.recipeItems.map((r) => ({ ingredientId: r.ingredientId, value: toInput(r.quantity) }))
      : product.weightMix.map((r) => ({ ingredientId: r.ingredientId, value: toInput(r.percentage) }));

  const [rows, setRows] = useState<Row[]>(initial);
  const [dirty, setDirty] = useState(false);
  // O produto é recarregado em segundo plano (ex.: ao voltar para a aba). Só atualiza a lista
  // se a pessoa não estiver no meio de uma edição — senão perderia o que digitou.
  useEffect(() => {
    if (dirty) return;
    setRows(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  // Composição por peso usa só ingredientes em gramas (o peso da balança é em g).
  const options: Ingredient[] = (ingredients.data ?? []).filter((i) => isRecipe || i.baseUnit === 'G');
  const byId = new Map(options.map((i) => [i.id, i]));
  const known = new Map(
    [...product.recipeItems, ...product.weightMix].map((r) => [r.ingredientId, r.ingredient]),
  );

  const update = (index: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const add = () => {
    const used = new Set(rows.map((r) => r.ingredientId));
    const next = options.find((o) => !used.has(o.id));
    if (!next) return toast.info('Todos os ingredientes disponíveis já estão na lista.');
    setRows((rs) => [...rs, { ingredientId: next.id, value: '' }]);
    setDirty(true);
  };
  const removeRow = (index: number) => {
    setRows((rs) => rs.filter((_, i) => i !== index));
    setDirty(true);
  };

  const totalPct = rows.reduce((s, r) => s + (parseNum(r.value) ?? 0), 0);

  const mutation = useMutation({
    mutationFn: () =>
      api(`/products/${product.id}/${kind}`, {
        method: 'PUT',
        body: {
          items: rows.map((r) =>
            isRecipe
              ? { ingredientId: r.ingredientId, quantity: parseNum(r.value) }
              : { ingredientId: r.ingredientId, percentage: parseNum(r.value) },
          ),
        },
      }),
    onSuccess: () => {
      toast.success(isRecipe ? 'Receita salva.' : 'Composição salva.');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDirty(false);
      onSaved();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const save = () => {
    const ids = rows.map((r) => r.ingredientId);
    if (new Set(ids).size !== ids.length) return toast.error('Há ingrediente repetido na lista.');
    const bad = rows.findIndex((r) => {
      const n = parseNum(r.value);
      return n === undefined || n <= 0 || (!isRecipe && n > 100);
    });
    if (bad >= 0) return toast.error(`Linha ${bad + 1}: informe um valor ${isRecipe ? 'maior que zero' : 'entre 0 e 100%'}.`);
    if (!isRecipe && totalPct > 100.0001) return toast.error('A soma dos percentuais não pode passar de 100%.');
    mutation.mutate();
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {isRecipe ? 'Receita (por unidade)' : 'Composição média'}
            {!isRecipe && <EstimatedBadge />}
          </span>
        }
        description={
          isRecipe
            ? 'Quanto de cada ingrediente vai em 1 unidade. Cada venda baixa exatamente isso.'
            : 'Percentual de cada ingrediente no peso do pote. A baixa é uma estimativa (peso × %), corrigida pela contagem.'
        }
      />

      {!isRecipe && rows.length === 0 && (
        <Notice className="mb-4">
          Sem composição, a venda por peso não baixa ingredientes: ela conta para a demanda do
          produto e o consumo é reconciliado pelo inventário.
        </Notice>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title={isRecipe ? 'Sem receita' : 'Sem composição'}
          description={editable ? 'Adicione os ingredientes.' : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row, index) => {
            const ing = byId.get(row.ingredientId) ?? known.get(row.ingredientId);
            const unit = isRecipe ? (ing ? UNIT_LABEL[ing.baseUnit] : '') : '%';
            return (
              <li key={index} className="flex items-center gap-2">
                {editable ? (
                  <>
                    <Select
                      aria-label={`Ingrediente da linha ${index + 1}`}
                      value={row.ingredientId}
                      onChange={(e) => update(index, { ingredientId: e.target.value })}
                      className="flex-1"
                    >
                      {!byId.has(row.ingredientId) && ing && <option value={row.ingredientId}>{ing.name} (inativo)</option>}
                      {options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      inputMode="decimal"
                      aria-label={`Quantidade da linha ${index + 1}`}
                      value={row.value}
                      onChange={(e) => update(index, { value: e.target.value })}
                      className="w-24 text-right"
                    />
                    <span className="w-6 text-sm text-muted">{unit}</span>
                    <Button variant="ghost" size="icon" onClick={() => removeRow(index)} aria-label={`Remover linha ${index + 1}`}>
                      <Trash2 aria-hidden />
                    </Button>
                  </>
                ) : (
                  <div className="flex w-full justify-between border-b border-navy-800 py-2 text-sm">
                    <span>{ing?.name}</span>
                    <span className="tabular font-semibold">
                      {isRecipe && ing ? formatQty(row.value, ing.baseUnit) : `${formatNumber(row.value)}%`}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!isRecipe && rows.length > 0 && (
        <p className={cn('mt-3 text-sm', totalPct > 100.0001 ? 'text-danger' : 'text-muted')}>
          Total: <span className="tabular font-semibold">{formatNumber(totalPct)}%</span>
          {totalPct < 100 && ` (o restante, ${formatNumber(100 - totalPct)}%, não baixa estoque)`}
        </p>
      )}
      {!isRecipe && rows.length > 0 && (
        <p className="mt-1 text-xs text-muted">
          Exemplo: num pote de 500 g, {rows
            .slice(0, 2)
            .map((r) => {
              const ing = byId.get(r.ingredientId) ?? known.get(r.ingredientId);
              return `${formatQty((500 * toNumber(parseNum(r.value) ?? 0)) / 100, 'G')} de ${ing?.name ?? '?'}`;
            })
            .join(' e ')}
          .
        </p>
      )}

      {editable && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={add} disabled={ingredients.isPending}>
            <Plus aria-hidden /> Adicionar ingrediente
          </Button>
          <Button onClick={save} disabled={!dirty} loading={mutation.isPending}>
            Salvar {isRecipe ? 'receita' : 'composição'}
          </Button>
        </div>
      )}
    </Card>
  );
}
