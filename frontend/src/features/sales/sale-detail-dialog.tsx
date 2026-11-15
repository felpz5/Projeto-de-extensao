import { useQuery } from '@tanstack/react-query';
import { Ban, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PaymentBadge } from '@/components/payment';
import { Badge, EstimatedBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ErrorState, Notice, Spinner } from '@/components/ui/feedback';
import { MovementLine } from '@/features/inventory/movement-row';
import { api } from '@/lib/api';
import {
  CHANNEL_LABEL,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatQty,
  SOURCE_LABEL,
  toNumber,
} from '@/lib/format';
import { qk } from '@/lib/queries';
import type { Sale, SaleDetail } from '@/lib/types';
import { CancelSaleDialog } from './cancel-sale-dialog';

/** Pode cancelar/corrigir agora? (a API decide; aqui só evita mostrar botão que daria erro) */
export function canEdit(sale: Pick<Sale, 'editableUntil' | 'status'>) {
  if (sale.status !== 'COMPLETED') return false;
  if (sale.editableUntil === null) return true; // dono/gerente: sem prazo
  if (!sale.editableUntil) return false;
  return new Date(sale.editableUntil).getTime() > Date.now();
}

/** Texto do prazo do funcionário ("mais 12 min"). */
export function editDeadline(sale: Pick<Sale, 'editableUntil'>) {
  if (!sale.editableUntil) return null;
  const minutes = Math.ceil((new Date(sale.editableUntil).getTime() - Date.now()) / 60_000);
  return minutes > 0 ? `pode corrigir por mais ${minutes} min` : null;
}

export function SaleStatusBadge({ sale }: { sale: Pick<Sale, 'status' | 'correctsId'> }) {
  if (sale.status === 'CANCELED') return <Badge tone="danger">Cancelada</Badge>;
  if (sale.correctsId) return <Badge tone="accent">Correção</Badge>;
  return null;
}

/** Detalhe da venda: itens, pagamento, baixas de estoque e ações (corrigir/cancelar). */
export function SaleDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [canceling, setCanceling] = useState(false);
  const query = useQuery({ queryKey: qk.sale(id), queryFn: () => api<SaleDetail>(`/sales/${id}`) });
  const sale = query.data;
  const editable = sale ? canEdit(sale) : false;

  return (
    <>
      <Dialog
        open
        onOpenChange={(o) => !o && onClose()}
        title="Detalhes da venda"
        description={sale && `${CHANNEL_LABEL[sale.channel]} · ${formatDateTime(sale.soldAt)}`}
        footer={
          sale &&
          editable && (
            <>
              <Button variant="outlineDanger" onClick={() => setCanceling(true)}>
                <Ban aria-hidden /> Cancelar venda
              </Button>
              <Button variant="secondary" onClick={() => navigate(`/vender?corrigir=${sale.id}`)}>
                <Pencil aria-hidden /> Corrigir
              </Button>
            </>
          )
        }
      >
        {query.isPending ? (
          <Spinner />
        ) : query.isError ? (
          <ErrorState error={query.error} />
        ) : (
          sale && (
            <div className="flex flex-col gap-5">
              {sale.status === 'CANCELED' && (
                <Notice tone="warning">
                  Cancelada {sale.canceledAt && `em ${formatDateTime(sale.canceledAt)}`}
                  {sale.canceledByName && ` por ${sale.canceledByName}`}
                  {sale.cancelReason && <>: “{sale.cancelReason}”</>}. Não conta no faturamento e o
                  estoque foi devolvido.
                </Notice>
              )}
              {sale.correctsId && (
                <Notice>Esta venda é a correção de uma venda que foi cancelada.</Notice>
              )}

              <div className="flex items-baseline justify-between">
                <span className="text-muted">Total</span>
                <span className="tabular text-2xl font-bold">{formatMoney(sale.totalAmount)}</span>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <PaymentBadge method={sale.paymentMethod} />
                <SaleStatusBadge sale={sale} />
                {sale.createdByName && <Badge>Registrada por {sale.createdByName}</Badge>}
                {sale.totalWeightG && <Badge>{formatQty(sale.totalWeightG, 'G')}</Badge>}
              </div>
              {editDeadline(sale) && <p className="text-xs text-warning">Você {editDeadline(sale)}.</p>}
              {sale.notes && <p className="rounded-lg bg-navy-800 p-3 text-sm">{sale.notes}</p>}

              <section>
                <h3 className="mb-2 text-sm font-semibold">Itens</h3>
                <ul className="flex flex-col gap-3">
                  {sale.items.map((item) => (
                    <li key={item.id} className="rounded-lg border border-navy-700 p-3">
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="font-medium">
                          {formatNumber(item.quantity, 3)}× {item.product.name}
                        </span>
                        <span className="tabular">
                          {formatMoney(toNumber(item.unitPrice) * toNumber(item.quantity))}
                        </span>
                      </div>
                      {item.weightG && <p className="text-xs text-muted">{formatQty(item.weightG, 'G')}</p>}
                      {item.ingredients && item.ingredients.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {item.ingredients.map((ing) => (
                            <li key={ing.ingredientId}>
                              <Badge
                                tone={
                                  ing.quantitySource === 'MEASURED' || ing.quantitySource === 'RECIPE'
                                    ? 'neutral'
                                    : 'warning'
                                }
                              >
                                {ing.ingredient.name}
                                {ing.quantity ? ` · ${formatQty(ing.quantity, ing.ingredient.baseUnit)}` : ''} (
                                {SOURCE_LABEL[ing.quantitySource]})
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
                  Baixa de estoque
                  {sale.movements.some((m) => m.isEstimated) && <EstimatedBadge />}
                </h3>
                {sale.movements.length ? (
                  <ul className="divide-y divide-navy-800">
                    {sale.movements.map((m) => (
                      <MovementLine key={m.id} m={m} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">
                    Esta venda não baixou estoque (sem receita, composição ou porção padrão). O
                    consumo é corrigido pela contagem de inventário.
                  </p>
                )}
              </section>
            </div>
          )
        )}
      </Dialog>

      {canceling && sale && (
        <CancelSaleDialog sale={sale} onClose={() => setCanceling(false)} onDone={onClose} />
      )}
    </>
  );
}
