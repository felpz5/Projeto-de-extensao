import { Copy, Download, MessageCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Notice } from '@/components/ui/feedback';
import { Input } from '@/components/ui/form';
import { useAuth } from '@/features/auth/auth-context';
import { downloadCsv } from '@/lib/csv';
import { formatMoney, formatQty, today, UNIT_LABEL } from '@/lib/format';
import { parseNum, toInput } from '@/lib/schemas';
import type { ReorderItem } from '@/lib/types';
import { UrgencyBadge } from './urgency-badge';

interface Line {
  item: ReorderItem;
  selected: boolean;
  qty: string;
}

/** Arredonda para cima de um jeito "comprável": 893,1 g → 900 g; 11.559 ml → 11.600 ml. */
function roundUp(qty: number, unit: ReorderItem['ingredient']['baseUnit']) {
  if (unit === 'UN') return Math.ceil(qty);
  const step = qty >= 1000 ? 100 : 10;
  return Math.ceil(qty / step) * step;
}

/**
 * Lista de compras a partir da sugestão de reposição: marca o que vai comprar, ajusta as
 * quantidades e manda para o fornecedor (WhatsApp), copia ou baixa em planilha.
 */
export function ShoppingListDialog({ items, onClose }: { items: ReorderItem[]; onClose: () => void }) {
  const { session } = useAuth();
  const [lines, setLines] = useState<Line[]>(() =>
    items
      .filter((i) => (i.recommendation.suggestedQuantity ?? 0) > 0)
      .map((item) => ({
        item,
        selected: true,
        qty: toInput(roundUp(item.recommendation.suggestedQuantity!, item.ingredient.baseUnit)),
      })),
  );

  const chosen = lines.filter((l) => l.selected && (parseNum(l.qty) ?? 0) > 0);
  // custo estimado proporcional à quantidade escolhida (a API manda o custo da sugestão)
  const costOf = (l: Line) => {
    const suggested = l.item.recommendation.suggestedQuantity;
    const cost = l.item.recommendation.estimatedCost;
    if (!suggested || cost === null || cost === undefined) return null;
    return (cost / suggested) * (parseNum(l.qty) ?? 0);
  };
  const total = chosen.reduce((s, l) => s + (costOf(l) ?? 0), 0);

  const text = useMemo(() => {
    const header = `Lista de compras — ${session?.tenant.name ?? 'Gestock'} (${new Date().toLocaleDateString('pt-BR')})`;
    const rows = chosen.map((l) => `• ${l.item.ingredient.name}: ${formatQty(parseNum(l.qty) ?? 0, l.item.ingredient.baseUnit)}`);
    return [header, '', ...rows].join('\n');
  }, [chosen, session]);

  const update = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Lista de compras"
      description="Marque o que vai comprar e ajuste as quantidades (já arredondadas para cima)."
      className="sm:max-w-2xl"
      footer={
        <>
          <Button
            variant="secondary"
            disabled={!chosen.length}
            onClick={() =>
              downloadCsv(`lista-de-compras-${today()}`, chosen, [
                { header: 'Ingrediente', value: (l) => l.item.ingredient.name },
                { header: 'Quantidade', value: (l) => parseNum(l.qty) ?? 0 },
                { header: 'Unidade', value: (l) => UNIT_LABEL[l.item.ingredient.baseUnit] },
                { header: 'Custo estimado (R$)', value: (l) => {
                  const c = costOf(l);
                  return c === null ? null : Math.round(c * 100) / 100;
                } },
              ])
            }
          >
            <Download aria-hidden /> Planilha
          </Button>
          <Button
            variant="secondary"
            disabled={!chosen.length}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                toast.success('Lista copiada.');
              } catch {
                toast.error('Não foi possível copiar. Selecione o texto manualmente.');
              }
            }}
          >
            <Copy aria-hidden /> Copiar
          </Button>
          <a
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-success px-4 text-sm font-semibold text-navy-950 hover:bg-success/90 [&_svg]:size-4 ${chosen.length ? '' : 'pointer-events-none opacity-50'}`}
            href={`https://wa.me/?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle aria-hidden /> WhatsApp
          </a>
        </>
      }
    >
      {lines.length === 0 ? (
        <Notice>Nada para comprar agora: o estoque cobre a demanda prevista.</Notice>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {lines.map((l, i) => {
              const cost = costOf(l);
              return (
                <li key={l.item.ingredient.id} className="flex items-center gap-3 rounded-lg border border-navy-700 p-2.5">
                  <input
                    type="checkbox"
                    className="size-4 accent-accent"
                    checked={l.selected}
                    onChange={(e) => update(i, { selected: e.target.checked })}
                    aria-label={`Comprar ${l.item.ingredient.name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.item.ingredient.name}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <UrgencyBadge urgency={l.item.recommendation.urgency} />
                      {cost !== null && <span className="text-xs text-muted">≈ {formatMoney(cost)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      inputMode="decimal"
                      className="h-9 w-24 text-right"
                      value={l.qty}
                      onChange={(e) => update(i, { qty: e.target.value })}
                      aria-label={`Quantidade de ${l.item.ingredient.name} em ${UNIT_LABEL[l.item.ingredient.baseUnit]}`}
                      disabled={!l.selected}
                    />
                    <span className="w-6 text-xs text-muted">{UNIT_LABEL[l.item.ingredient.baseUnit]}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="flex justify-between text-sm">
            <span className="text-muted">{chosen.length} item(ns)</span>
            <span>
              Custo estimado: <b className="tabular">{formatMoney(total)}</b>
            </span>
          </p>
        </div>
      )}
    </Dialog>
  );
}
