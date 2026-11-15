import { useMutation } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorState, Notice, PageHeader, Spinner } from '@/components/ui/feedback';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import {
  formatQty,
  formatSignedQty,
  localInputToIso,
  nowLocalInput,
  toNumber,
  UNIT_LABEL,
} from '@/lib/format';
import { useInvalidateStock, useLevels } from '@/lib/queries';
import { LIMITS, parseNum } from '@/lib/schemas';
import type { CountResult } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Contagem física (inventário): o sistema lança um ajuste com a diferença de cada item.
 * É o que corrige periodicamente o erro das baixas estimadas.
 */
export function CountPage() {
  const levels = useLevels();
  const invalidate = useInvalidateStock();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [customDate, setCustomDate] = useState(false);
  const [occurredAt, setOccurredAt] = useState(nowLocalInput());
  const [note, setNote] = useState('');
  const [result, setResult] = useState<CountResult | null>(null);

  const filled = useMemo(
    () =>
      Object.entries(counts)
        .map(([ingredientId, text]) => ({ ingredientId, value: parseNum(text), text }))
        .filter((c) => c.text.trim() !== ''),
    [counts],
  );
  const invalid = filled.filter((c) => c.value === undefined || c.value < 0 || c.value > LIMITS.quantity);

  const mutation = useMutation({
    mutationFn: () =>
      api<CountResult>('/inventory/counts', {
        method: 'POST',
        body: {
          items: filled.map((c) => ({ ingredientId: c.ingredientId, countedQuantity: c.value })),
          occurredAt: customDate ? localInputToIso(occurredAt) : undefined,
          note: note.trim() || undefined,
        },
      }),
    onSuccess: (r) => {
      setResult(r);
      setCounts({});
      invalidate();
      toast.success(`Contagem registrada: ${r.adjusted} ajuste(s).`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const names = new Map(levels.data?.map((l) => [l.ingredientId, l]) ?? []);

  return (
    <>
      <PageHeader
        title="Contagem de estoque"
        description="Informe só o que você contou. Itens em branco não são alterados."
        actions={
          <Link to="/estoque" className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
            <ArrowLeft className="size-4" aria-hidden /> Voltar ao estoque
          </Link>
        }
      />

      {result && (
        <Card className="mb-4">
          <h2 className="mb-3 font-semibold">Resultado da contagem</h2>
          <ul className="divide-y divide-navy-800">
            {result.items.map((i) => {
              const level = names.get(i.ingredientId);
              const unit = level?.baseUnit ?? 'UN';
              const diff = toNumber(i.difference);
              return (
                <li key={i.ingredientId} className="flex justify-between gap-3 py-2 text-sm">
                  <span>{level?.name ?? i.ingredientId}</span>
                  <span className="tabular text-muted">
                    {formatQty(i.previous, unit)} → {formatQty(i.counted, unit)}{' '}
                    <span className={cn('font-semibold', diff > 0 ? 'text-success' : diff < 0 ? 'text-warning' : 'text-muted')}>
                      ({diff === 0 ? 'sem diferença' : formatSignedQty(diff, unit)})
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {levels.isPending ? (
        <Spinner />
      ) : levels.isError ? (
        <ErrorState error={levels.error} onRetry={() => levels.refetch()} />
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!filled.length) return toast.error('Preencha a quantidade contada de pelo menos um item.');
            if (invalid.length) return toast.error('Corrija as quantidades destacadas.');
            mutation.mutate();
          }}
          className="flex flex-col gap-4"
        >
          <Card>
            <Table>
              <thead>
                <tr>
                  <Th>Ingrediente</Th>
                  <Th className="text-right">No sistema</Th>
                  <Th className="w-40">Contado</Th>
                  <Th className="text-right">Diferença</Th>
                </tr>
              </thead>
              <tbody>
                {levels.data.map((l) => {
                  const text = counts[l.ingredientId] ?? '';
                  const value = parseNum(text);
                  const bad = text.trim() !== '' && (value === undefined || value < 0);
                  const diff = value !== undefined ? value - toNumber(l.stock) : null;
                  return (
                    <Tr key={l.ingredientId}>
                      <Td className="font-medium">{l.name}</Td>
                      <Td className="tabular text-right text-muted">{formatQty(l.stock, l.baseUnit)}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Input
                            inputMode="decimal"
                            aria-label={`Quantidade contada de ${l.name} em ${UNIT_LABEL[l.baseUnit]}`}
                            aria-invalid={bad || undefined}
                            value={text}
                            onChange={(e) => setCounts((c) => ({ ...c, [l.ingredientId]: e.target.value }))}
                            className="h-9"
                          />
                          <span className="text-xs text-muted">{UNIT_LABEL[l.baseUnit]}</span>
                        </div>
                      </Td>
                      <Td className="tabular text-right">
                        {diff === null ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <span className={cn(diff > 0 ? 'text-success' : diff < 0 ? 'text-warning' : 'text-muted')}>
                            {diff === 0 ? '0' : formatSignedQty(diff, l.baseUnit)}
                          </span>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>

          <Card className="flex flex-col gap-4">
            <Checkbox
              label="A contagem foi feita em outra data/hora"
              checked={customDate}
              onChange={(e) => setCustomDate(e.target.checked)}
            />
            {customDate && (
              <>
                <Field label="Data e hora da contagem">
                  <Input type="datetime-local" max={nowLocalInput()} value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
                </Field>
                <Notice>A diferença é calculada contra o saldo que o sistema tinha nesse momento.</Notice>
              </>
            )}
            <Field label="Observação">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Button type="submit" size="lg" loading={mutation.isPending} disabled={!filled.length}>
              Registrar contagem ({filled.length} {filled.length === 1 ? 'item' : 'itens'})
            </Button>
          </Card>
        </form>
      )}
    </>
  );
}
