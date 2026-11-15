import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/feedback';
import { Select } from '@/components/ui/form';
import { api } from '@/lib/api';
import { formatDateTime, formatMoney, ROLE_LABEL } from '@/lib/format';
import { qk } from '@/lib/queries';
import type { AuditEntry, Page, Role } from '@/lib/types';

/** Ações registradas pela API → texto para gente. */
const ACTIONS: Record<string, { label: string; tone: 'neutral' | 'accent' | 'warning' | 'danger' | 'success' }> = {
  'sale.cancel': { label: 'Cancelou venda', tone: 'danger' },
  'sale.correct': { label: 'Corrigiu venda', tone: 'warning' },
  'sale.delete': { label: 'Excluiu venda', tone: 'danger' },
  'stock.reverse': { label: 'Estornou lançamento', tone: 'warning' },
  'stock.count': { label: 'Contagem de estoque', tone: 'accent' },
  // movimentações manuais: stock.<tipo>
  'stock.initial': { label: 'Lançou estoque inicial', tone: 'neutral' },
  'stock.purchase': { label: 'Registrou compra', tone: 'neutral' },
  'stock.manual_out': { label: 'Registrou saída', tone: 'warning' },
  'stock.loss': { label: 'Registrou perda', tone: 'warning' },
  'stock.adjustment': { label: 'Ajustou estoque', tone: 'warning' },
  'member.add': { label: 'Adicionou membro', tone: 'success' },
  'member.invite': { label: 'Convidou membro', tone: 'success' },
  'member.accept': { label: 'Aceitou convite', tone: 'success' },
  'member.decline': { label: 'Recusou convite', tone: 'neutral' },
  'product.recipe.set': { label: 'Alterou receita', tone: 'neutral' },
  'product.weightMix.set': { label: 'Alterou composição', tone: 'neutral' },
  'member.update': { label: 'Alterou acesso', tone: 'warning' },
  'member.remove': { label: 'Removeu membro', tone: 'danger' },
  'member.reset_password': { label: 'Redefiniu senha', tone: 'warning' },
  'tenant.update': { label: 'Alterou dados da loja', tone: 'neutral' },
  'product.deactivate': { label: 'Desativou produto', tone: 'neutral' },
  'product.delete': { label: 'Excluiu produto', tone: 'danger' },
  'ingredient.deactivate': { label: 'Desativou ingrediente', tone: 'neutral' },
  'ingredient.delete': { label: 'Excluiu ingrediente', tone: 'danger' },
};

const ENTITIES = [
  ['', 'Tudo'],
  ['sale', 'Vendas'],
  ['stock_movement', 'Estoque'],
  ['inventory', 'Contagens'],
  ['membership', 'Equipe'],
  ['product', 'Produtos'],
  ['ingredient', 'Ingredientes'],
  ['tenant', 'Estabelecimento'],
] as const;

/** Resumo legível do que foi registrado em cada ação. */
function details(e: AuditEntry): string | null {
  const p = e.payload ?? {};
  const get = (k: string) => (p[k] === undefined || p[k] === null ? undefined : String(p[k]));
  switch (e.action) {
    case 'sale.cancel':
      return [get('totalAmount') && formatMoney(get('totalAmount')!), get('reason') && `“${get('reason')}”`]
        .filter(Boolean)
        .join(' · ');
    case 'sale.correct':
      return get('before') && get('after') ? `${formatMoney(get('before')!)} → ${formatMoney(get('after')!)}` : null;
    case 'member.add':
    case 'member.invite':
    case 'member.update':
      return get('role') ? `Papel: ${ROLE_LABEL[get('role') as Role] ?? get('role')}` : get('status') ?? null;
    case 'stock.count':
      return Array.isArray(p.items) ? `${p.items.length} item(ns) contado(s)` : null;
    default:
      return null;
  }
}

/** "Quem fez o quê e quando" — cancelamentos, estornos, ajustes, mudanças na equipe. */
export function AuditTab() {
  const [entity, setEntity] = useState('');
  const [skip, setSkip] = useState(0);
  const take = 30;
  const params = { entity: entity || undefined, take, skip };
  const query = useQuery({
    queryKey: qk.audit(params),
    queryFn: () => api<Page<AuditEntry>>('/tenant/audit', { query: params }),
    placeholderData: keepPreviousData,
  });

  return (
    <Card>
      <CardHeader
        title="Auditoria"
        description="Registro permanente de ações sensíveis. Ninguém consegue editar nem apagar."
        action={
          <Select
            aria-label="Filtrar"
            className="w-44"
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setSkip(0);
            }}
          >
            {ENTITIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        }
      />
      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState title="Nada registrado" />
      ) : (
        <>
          <ul className="divide-y divide-navy-800">
            {query.data.items.map((e) => {
              const a = ACTIONS[e.action] ?? { label: e.action, tone: 'neutral' as const };
              const d = details(e);
              return (
                <li key={e.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone={a.tone}>{a.label}</Badge>
                      <span className="font-medium">{e.userName ?? 'Sistema'}</span>
                    </p>
                    {d && <p className="mt-0.5 truncate text-xs text-muted">{d}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-muted">{formatDateTime(e.createdAt)}</span>
                </li>
              );
            })}
          </ul>
          <Pagination skip={skip} take={take} total={query.data.total} onChange={setSkip} />
        </>
      )}
    </Card>
  );
}
