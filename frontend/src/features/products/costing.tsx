import { Badge, EstimatedBadge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { Notice } from '@/components/ui/feedback';
import { formatMoney, formatPct, toNumber } from '@/lib/format';
import type { ProductCosting } from '@/lib/types';

/** Faixa de cor da margem: verde ≥ 50%, amarelo 30–50%, vermelho abaixo. */
export function marginTone(pct: number | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (pct === null) return 'neutral';
  if (pct >= 50) return 'success';
  if (pct >= 30) return 'warning';
  return 'danger';
}

/** Selo compacto para listas: "Margem 53%". */
export function MarginBadge({ costing }: { costing: ProductCosting | null }) {
  if (!costing || costing.cost === null) return null;
  return (
    <Badge tone={marginTone(costing.marginPct)}>
      Margem {formatPct(costing.marginPct, 0)}
      {costing.missingCost.length > 0 && ' *'}
    </Badge>
  );
}

/** Cartão de custo e margem no detalhe do produto. */
export function CostingCard({ costing, price }: { costing: ProductCosting; price: string }) {
  const per = costing.basis === 'KG' ? 'por kg' : 'por unidade';
  if (costing.cost === null) {
    return (
      <Card>
        <CardHeader title="Custo e margem" />
        <Notice>
          Cadastre a {costing.basis === 'KG' ? 'composição média' : 'receita'} abaixo para o sistema
          calcular quanto custa produzir e quanto sobra de margem.
        </Notice>
      </Card>
    );
  }
  const marginPct = costing.marginPct;
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            Custo e margem {costing.estimated && <EstimatedBadge />}
          </span>
        }
        description={`Pelo custo atual dos ingredientes (atualizado a cada compra), ${per}.`}
      />
      <dl className="grid grid-cols-3 gap-3">
        <div>
          <dt className="text-xs text-muted">Preço</dt>
          <dd className="tabular text-lg font-bold">{formatMoney(price)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Custo</dt>
          <dd className="tabular text-lg font-bold">{formatMoney(costing.cost)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Margem</dt>
          <dd className="tabular text-lg font-bold">
            {formatMoney(costing.margin)}{' '}
            <Badge tone={marginTone(marginPct)} className="align-middle">
              {formatPct(marginPct, 0)}
            </Badge>
          </dd>
        </div>
      </dl>
      {toNumber(price) > 0 && (
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-navy-800" aria-hidden>
          <div className="h-3 bg-warning/80" style={{ width: `${Math.min(100, (toNumber(costing.cost) / toNumber(price)) * 100)}%` }} />
          <div className="h-3 flex-1 bg-success/70" />
        </div>
      )}
      <div className="mt-3 flex flex-col gap-1 text-xs text-muted">
        {costing.missingCost.length > 0 && (
          <p className="text-warning">
            * Sem custo cadastrado: {costing.missingCost.join(', ')}. O custo real é maior — cadastre
            em Ingredientes ou registre uma compra com o custo.
          </p>
        )}
        {costing.coveragePct !== null && costing.coveragePct < 100 && (
          <p>
            A composição cobre {formatPct(costing.coveragePct, 0)} do peso; o restante não entra no
            custo.
          </p>
        )}
      </div>
    </Card>
  );
}
