import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import { Input } from '@/components/ui/form';
import { useAuth } from '@/features/auth/auth-context';
import { api, errorMessage } from '@/lib/api';
import { useCategories } from '@/lib/queries';
import type { Category, CategoryKind } from '@/lib/types';

export function CategoriesTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <CategoryList kind="PRODUCT" title="Categorias de produtos" />
      <CategoryList kind="INGREDIENT" title="Categorias de ingredientes" />
    </div>
  );
}

function useCategoryMutations() {
  const queryClient = useQueryClient();
  const done = (msg: string) => {
    toast.success(msg);
    ['categories', 'ingredients', 'products', 'inventory'].forEach((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    );
  };
  const onError = (err: unknown) => toast.error(errorMessage(err));
  return {
    create: useMutation({
      mutationFn: (body: { name: string; kind: CategoryKind }) => api('/categories', { method: 'POST', body }),
      onSuccess: () => done('Categoria criada.'),
      onError,
    }),
    rename: useMutation({
      mutationFn: ({ id, name }: { id: string; name: string }) =>
        api(`/categories/${id}`, { method: 'PATCH', body: { name } }),
      onSuccess: () => done('Categoria renomeada.'),
      onError,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api(`/categories/${id}`, { method: 'DELETE' }),
      onSuccess: () => done('Categoria excluída. Os itens dela ficaram sem categoria.'),
      onError,
    }),
  };
}

function CategoryList({ kind, title }: { kind: CategoryKind; title: string }) {
  const { isManager } = useAuth();
  const query = useCategories(kind);
  const { create, rename, remove } = useCategoryMutations();
  const [name, setName] = useState('');

  return (
    <Card>
      <CardHeader title={title} />
      {isManager && (
        <form
          className="mb-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = name.trim();
            if (!value) return;
            create.mutate({ name: value, kind }, { onSuccess: () => setName('') });
          }}
        >
          <Input
            placeholder="Nova categoria"
            aria-label={`Nome da nova categoria (${title})`}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" loading={create.isPending} aria-label="Adicionar categoria">
            <Plus aria-hidden />
          </Button>
        </form>
      )}
      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState title="Nenhuma categoria" />
      ) : (
        <ul className="divide-y divide-navy-800">
          {query.data.map((c) => (
            <CategoryRow
              key={c.id}
              category={c}
              editable={isManager}
              onRename={(n) => rename.mutateAsync({ id: c.id, name: n })}
              onRemove={() => {
                if (confirm(`Excluir a categoria "${c.name}"?`)) remove.mutate(c.id);
              }}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function CategoryRow({
  category,
  editable,
  onRename,
  onRemove,
}: {
  category: Category;
  editable: boolean;
  onRename: (name: string) => Promise<unknown>;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(category.name);

  if (editing) {
    return (
      <li className="flex items-center gap-2 py-2">
        <form
          className="flex flex-1 gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!value.trim()) return;
            try {
              await onRename(value.trim());
              setEditing(false);
            } catch {
              // o toast de erro já apareceu
            }
          }}
        >
          <Input autoFocus maxLength={120} value={value} onChange={(e) => setValue(e.target.value)} className="h-9" aria-label="Nome da categoria" />
          <Button type="submit" size="icon" aria-label="Salvar">
            <Check aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cancelar"
            onClick={() => {
              setValue(category.name);
              setEditing(false);
            }}
          >
            <X aria-hidden />
          </Button>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 py-2 text-sm">
      <span>{category.name}</span>
      {editable && (
        <span className="flex">
          <Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label={`Renomear ${category.name}`}>
            <Pencil aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Excluir ${category.name}`}>
            <Trash2 aria-hidden />
          </Button>
        </span>
      )}
    </li>
  );
}
