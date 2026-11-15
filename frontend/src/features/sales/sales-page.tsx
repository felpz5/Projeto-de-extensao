import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Pagination } from '@/components/pagination';
import { PaymentBadge } from '@/components/payment';
import { PeriodSelect, periodRange, type PeriodDays } from '@/components/period-select';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, Stat } from '@/components/ui/card';
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/ui/feedback';
import { Select } from '@/components/ui/form';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { downloadCsv, num } from '@/lib/csv';
import {
  CHANNEL_LABEL,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPct,
  formatQty,
  PAYMENT_LABEL,
  paymentLabel,
  toNumber,
} from '@/lib/format';
import { qk } from '@/lib/queries';
import type { Channel, PaymentMethod, Sale, SaleStatus, SalesPage as SalesPageData, SalesSummary } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SaleDetailDialog, SaleStatusBadge } from './sale-detail-dialog';

const TAKE = 25;

export function SalesPage() {
  const [days, setDays] = useState<PeriodDays>(30);
  const [channel, setChannel] = useState<Channel | ''>('');
  const [status, setStatus] = useState<SaleStatus | ''>('');
  const [payment, setPayment] = useState<PaymentMethod | ''>('');
  const [skip, setSkip] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const range = periodRange(days);
  const filters = {
    ...range,
    channel: channel || undefined,
    status: status || undefined,
    paymentMethod: payment || undefined,
  };
  const params = { ...filters, take: TAKE, skip };

  const list = useQuery({
    queryKey: qk.sales(params),
    queryFn: () => api<SalesPageData>('/sales', { query: params }),
    placeholderData: keepPreviousData,
  });

  // Cancelou a última venda da página com filtro "concluídas"? Volta uma página.
  const pageEmpty = list.data && list.data.items.length === 0 && skip > 0;
  useEffect(() => {
    if (pageEmpty) setSkip((s) => Math.max(0, s - TAKE));
  }, [pageEmpty]);

  const summary = useQuery({
    queryKey: qk.salesSummary(range),
    queryFn: () => api<SalesSummary>('/sales/summary', { query: range }),
  });

  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setSkip(0);
  };

  /** Exporta TODAS as vendas do filtro (busca todas as páginas). */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: Sale[] = [];
      for (let page = 0; page < 50; page++) {
        const res = await api<SalesPageData>('/sales', { query: { ...filters, take: 200, skip: page * 200 } });
        all.push(...res.items);
        if (all.length >= res.total) break;
      }
      downloadCsv(`vendas-${range.from}-a-${range.to}`, all, [
        { header: 'Data', value: (s) => formatDateTime(s.soldAt) },
        { header: 'Canal', value: (s) => CHANNEL_LABEL[s.channel] },
        { header: 'Pagamento', value: (s) => paymentLabel(s.paymentMethod) },
        { header: 'Situação', value: (s) => (s.status === 'CANCELED' ? 'Cancelada' : 'Concluída') },
        { header: 'Itens', value: (s) => s.items.map((i) => `${formatNumber(i.quantity, 3)}x ${i.product.name}`).join(', ') },
        { header: 'Peso (g)', value: (s) => num(s.totalWeightG) },
        { header: 'Valor (R$)', value: (s) => num(s.totalAmount) },
        { header: 'Registrada por', value: (s) => s.createdByName ?? '' },
        { header: 'Motivo do cancelamento', value: (s) => s.cancelReason ?? '' },
      ]);
      toast.success(`${all.length} venda(s) exportada(s).`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const s = summary.data;
  const margin = s && toNumber(s.revenue) > 0 ? (toNumber(s.grossProfit) / toNumber(s.revenue)) * 100 : null;

  return (
    <>
      <PageHeader
        title="Vendas"
        description="Histórico e totais do período. Venda errada é cancelada ou corrigida — nunca apagada."
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} loading={exporting}>
              <Download aria-hidden /> Exportar
            </Button>
            <Link to="/vender" className={buttonVariants()}>
              <Plus aria-hidden /> Nova venda
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <PeriodSelect value={days} onChange={filter(setDays)} />
        <Select aria-label="Canal" className="w-auto" value={channel} onChange={(e) => filter(setChannel)(e.target.value as Channel | '')}>
          <option value="">Todos os canais</option>
          <option value="IN_STORE">Balcão</option>
          <option value="ONLINE">Online</option>
        </Select>
        <Select aria-label="Pagamento" className="w-auto" value={payment} onChange={(e) => filter(setPayment)(e.target.value as PaymentMethod | '')}>
          <option value="">Todos os pagamentos</option>
          {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
            <option key={m} value={m}>
              {PAYMENT_LABEL[m]}
            </option>
          ))}
        </Select>
        <Select aria-label="Situação" className="w-auto" value={status} onChange={(e) => filter(setStatus)(e.target.value as SaleStatus | '')}>
          <option value="">Todas</option>
          <option value="COMPLETED">Concluídas</option>
          <option value="CANCELED">Canceladas</option>
        </Select>
      </div>

      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Faturamento" value={formatMoney(s.revenue)} hint={`${formatNumber(s.orders, 0)} pedidos`} />
          <Stat
            label="Lucro bruto (estimado)"
            value={formatMoney(s.grossProfit)}
            hint={`Margem ${formatPct(margin)} · custo ${formatMoney(s.estimatedCost)}`}
          />
          <Stat label="Ticket médio" value={formatMoney(s.averageTicket)} />
          <Stat
            label="Por pagamento"
            value={
              <span className="flex flex-col gap-0.5 text-sm font-semibold">
                {[...s.byPayment]
                  .sort((a, b) => toNumber(b.revenue) - toNumber(a.revenue))
                  .slice(0, 3)
                  .map((p) => (
                    <span key={p.method ?? 'none'} className="flex justify-between gap-2">
                      <span className="text-muted">{paymentLabel(p.method)}</span>
                      {formatMoney(p.revenue)}
                    </span>
                  ))}
              </span>
            }
          />
        </div>
      )}
      {s && s.costMissingMovements > 0 && (
        <p className="-mt-2 mb-4 text-xs text-muted">
          O custo não inclui {s.costMissingMovements} baixa(s) de ingredientes sem custo cadastrado
          — o lucro real é um pouco menor. Cadastre o custo em Ingredientes.
        </p>
      )}

      <Card>
        {list.isPending ? (
          <Spinner />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState title="Nenhuma venda encontrada" description="Mude o período ou os filtros." />
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              {formatNumber(list.data.total, 0)} venda(s) · {status === 'CANCELED' ? 'valor cancelado' : 'total'}{' '}
              {formatMoney(list.data.totalAmount)}
            </p>
            <Table>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Itens</Th>
                  <Th>Pagamento</Th>
                  <Th className="text-right">Peso</Th>
                  <Th className="text-right">Valor</Th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((sale) => (
                  <Tr
                    key={sale.id}
                    className={cn('cursor-pointer', sale.status === 'CANCELED' && 'opacity-60')}
                    onClick={() => setOpenId(sale.id)}
                  >
                    <Td className="whitespace-nowrap">
                      <button type="button" className="text-left hover:underline" onClick={() => setOpenId(sale.id)}>
                        {formatDateTime(sale.soldAt)}
                      </button>
                      <p className="flex items-center gap-1.5 text-xs text-muted">
                        {CHANNEL_LABEL[sale.channel]}
                        {sale.createdByName && ` · ${sale.createdByName.split(' ')[0]}`}
                      </p>
                    </Td>
                    <Td className="max-w-64">
                      <p className="truncate">
                        {sale.items.map((i) => `${formatNumber(i.quantity, 3)}× ${i.product.name}`).join(', ')}
                      </p>
                      <SaleStatusBadge sale={sale} />
                    </Td>
                    <Td>
                      <PaymentBadge method={sale.paymentMethod} />
                    </Td>
                    <Td className="tabular text-right">{sale.totalWeightG ? formatQty(sale.totalWeightG, 'G') : '—'}</Td>
                    <Td className={cn('tabular text-right font-semibold', sale.status === 'CANCELED' && 'line-through')}>
                      {formatMoney(sale.totalAmount)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination skip={skip} take={TAKE} total={list.data.total} onChange={setSkip} />
          </>
        )}
      </Card>

      {status === '' && list.data && list.data.items.some((x) => x.status === 'CANCELED') && (
        <p className="mt-3 text-xs text-muted">
          <Badge tone="danger">Cancelada</Badge> aparece na lista, mas não entra no faturamento.
        </p>
      )}

      {openId && <SaleDetailDialog id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
