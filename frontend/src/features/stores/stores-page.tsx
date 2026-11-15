import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PeriodSelect, type PeriodDays } from '@/components/period-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, Stat } from '@/components/ui/card';
import { ErrorState, PageHeader, Spinner } from '@/components/ui/feedback';
import { useAuth } from '@/features/auth/auth-context';
import { api, errorMessage } from '@/lib/api';
import { formatMoney, formatNumber, ROLE_LABEL, toNumber } from '@/lib/format';
import { qk } from '@/lib/queries';
import type { StoresOverview } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Todas as lojas de quem é dono/gerente de mais de uma, lado a lado. */
export function StoresPage() {
  const { switchTenant } = useAuth();
  const navigate = useNavigate();
  const [days, setDays] = useState<PeriodDays>(30);
  const [opening, setOpening] = useState<string | null>(null);
  const query = useQuery({
    queryKey: qk.stores(days),
    queryFn: () => api<StoresOverview>('/auth/stores', { query: { days } }),
  });

  const open = async (tenantId: string) => {
    setOpening(tenantId);
    try {
      await switchTenant(tenantId);
      navigate('/');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setOpening(null);
    }
  };

  const data = query.data;
  const maxRevenue = Math.max(1, ...(data?.stores.map((s) => toNumber(s.period.revenue)) ?? []));

  return (
    <>
      <PageHeader
        title="Minhas lojas"
        description="Resumo de todos os estabelecimentos em que você é dono ou gerente."
        actions={<PeriodSelect value={days} onChange={setDays} />}
      />
      {query.isPending ? (
        <Spinner />
      ) : query.isError ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </Card>
      ) : (
        data && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Hoje (todas)" value={formatMoney(data.totals.todayRevenue)} hint={`${data.totals.todayOrders} venda(s)`} />
              <Stat
                label={`Últimos ${days} dias`}
                value={formatMoney(data.totals.periodRevenue)}
                hint={`${formatNumber(data.totals.periodOrders, 0)} venda(s)`}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {data.stores.map((s) => (
                <Card key={s.tenant.id} className={cn('flex flex-col gap-4', s.current && 'border-accent/60')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                        <Building2 className="size-5" aria-hidden />
                      </span>
                      <div>
                        <p className="font-semibold">{s.tenant.name}</p>
                        <p className="text-xs text-muted">{ROLE_LABEL[s.role]}</p>
                      </div>
                    </div>
                    {s.current && <Badge tone="accent">Aberta agora</Badge>}
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted">Hoje</dt>
                      <dd className="tabular font-semibold">{formatMoney(s.today.revenue)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">{days} dias</dt>
                      <dd className="tabular font-semibold">{formatMoney(s.period.revenue)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Ticket médio</dt>
                      <dd className="tabular font-semibold">{formatMoney(s.period.averageTicket)}</dd>
                    </div>
                  </dl>
                  <div className="h-2 rounded-full bg-navy-800" aria-hidden>
                    <div className="h-2 rounded-full bg-accent" style={{ width: `${(toNumber(s.period.revenue) / maxRevenue) * 100}%` }} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-2">
                      {s.stock.out > 0 && <Badge tone="danger">{s.stock.out} sem estoque</Badge>}
                      {s.stock.low > 0 && <Badge tone="warning">{s.stock.low} baixo</Badge>}
                      {!s.stock.out && !s.stock.low && <Badge tone="success">Estoque ok</Badge>}
                    </div>
                    {!s.current && (
                      <Button size="sm" variant="secondary" loading={opening === s.tenant.id} onClick={() => open(s.tenant.id)}>
                        Abrir <ArrowRight aria-hidden />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )
      )}
    </>
  );
}
