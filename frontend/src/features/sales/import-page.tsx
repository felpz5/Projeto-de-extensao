import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, FileUp, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, Notice, PageHeader, Spinner } from '@/components/ui/feedback';
import { Field, Select } from '@/components/ui/form';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api';
import { downloadCsv, parseCsv, readTextFile, type ParsedCsv } from '@/lib/csv';
import { CHANNEL_LABEL, PAYMENT_LABEL, formatDate, formatDay, formatMoney, formatNumber } from '@/lib/format';
import { qk, useInvalidateStock, useProducts } from '@/lib/queries';
import type { Channel, ImportPreview, ImportRow, PaymentMethod, SaleImportBatch } from '@/lib/types';

/** Campos que o servidor entende, na ordem da tela. */
const FIELDS: { key: Exclude<keyof ImportRow, 'line'>; label: string; hint: string; guess: RegExp }[] = [
  { key: 'date', label: 'Data *', hint: 'AAAA-MM-DD ou DD/MM/AAAA', guess: /^(data|dia|date)/ },
  { key: 'time', label: 'Hora', hint: 'HH:MM (sem: 12:00)', guess: /^(hora|horario|time)/ },
  { key: 'product', label: 'Produto', hint: 'Nome igual ao do cadastro', guess: /^(produto|item|product)/ },
  { key: 'quantity', label: 'Quantidade', hint: 'Sem: 1', guess: /^(quant|qtd|qtde)/ },
  { key: 'total', label: 'Valor total (R$)', hint: 'Ex.: 25,50', guess: /^(valor|total|preco)/ },
  { key: 'weightG', label: 'Peso (g)', hint: 'Produto por peso', guess: /^(peso|grama)/ },
  { key: 'channel', label: 'Canal', hint: 'balcão / online', guess: /^(canal|origem)/ },
  { key: 'payment', label: 'Pagamento', hint: 'pix, dinheiro, crédito…', guess: /^(pagamento|forma|pgto)/ },
];
type Mapping = Partial<Record<(typeof FIELDS)[number]['key'], number>>;

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

function guessMapping(headers: string[]): Mapping {
  const m: Mapping = {};
  for (const f of FIELDS) {
    const idx = headers.findIndex((h) => f.guess.test(norm(h)));
    if (idx >= 0 && !Object.values(m).includes(idx)) m[f.key] = idx;
  }
  return m;
}

function downloadTemplate() {
  const sample = [
    { date: '03/11/2026', time: '15:30', product: 'Açaí no peso', quantity: '1', total: '25,00', weightG: '420', channel: 'balcão', payment: 'pix' },
    { date: '03/11/2026', time: '16:05', product: 'Água 500 ml', quantity: '2', total: '8,00', weightG: '', channel: 'balcão', payment: 'dinheiro' },
  ];
  downloadCsv(
    'modelo-historico-vendas',
    sample,
    FIELDS.map((f) => ({ header: f.label.replace(' *', '').replace(' (R$)', '').replace(' (g)', ''), value: (r: typeof sample[number]) => r[f.key] })),
  );
}

export function ImportPage() {
  const [file, setFile] = useState<{ name: string; csv: ParsedCsv } | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [productId, setProductId] = useState('');
  const [channel, setChannel] = useState<Channel>('IN_STORE');
  const [payment, setPayment] = useState<PaymentMethod | ''>('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [confirm, setConfirm] = useState(false);
  // trocar a key limpa o <input type=file> (senão escolher o mesmo arquivo de novo não faz nada)
  const [inputKey, setInputKey] = useState(0);
  const products = useProducts();
  const invalidate = useInvalidateStock();

  const rows: ImportRow[] = useMemo(() => {
    if (!file) return [];
    return file.csv.rows.map((cells, i) => {
      const row: ImportRow = { line: file.csv.lines[i] ?? i + 2 }; // linha real do arquivo
      for (const f of FIELDS) {
        const idx = mapping[f.key];
        const v = idx === undefined ? undefined : cells[idx]?.trim();
        if (v) row[f.key] = v.slice(0, 200);
      }
      return row;
    });
  }, [file, mapping]);

  const body = () => ({
    fileName: file!.name,
    rows,
    defaults: { productId: productId || undefined, channel, paymentMethod: payment || undefined },
    allowOverlap,
  });

  const check = useMutation({
    mutationFn: () => api<ImportPreview>('/sales/import/preview', { method: 'POST', body: body() }),
    onSuccess: (p) => setPreview(p),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const commit = useMutation({
    mutationFn: () => api<{ imported: number }>('/sales/import', { method: 'POST', body: body() }),
    onSuccess: async (r) => {
      toast.success(`${r.imported} vendas importadas. O estoque atual não foi alterado.`);
      setConfirm(false);
      setPreview(null);
      setFile(null);
      setInputKey((k) => k + 1);
      await invalidate();
    },
    onError: (err) => {
      setConfirm(false);
      toast.error(errorMessage(err));
    },
  });

  const onFile = async (f: File | undefined) => {
    setPreview(null);
    if (!f) return setFile(null);
    if (f.size > 4 * 1024 * 1024) return toast.error('Arquivo grande demais (máximo 4 MB). Divida em partes.');
    const csv = parseCsv(await readTextFile(f));
    if (!csv.headers.length || !csv.rows.length) return toast.error('O arquivo está vazio ou não é um CSV.');
    setFile({ name: f.name, csv });
    setMapping(guessMapping(csv.headers));
  };

  const invalidated = () => setPreview(null); // mudou algo: precisa conferir de novo
  const needsOverlap = (preview?.overlap.existingSales ?? 0) > 0;
  const canImport = !!preview?.canImport && (!needsOverlap || allowOverlap);

  return (
    <>
      <PageHeader
        title="Importar histórico de vendas"
        description="Traga vendas antigas (caderno, planilha) para os relatórios e a previsão. O estoque atual não muda."
        actions={
          <>
            <Button variant="secondary" onClick={downloadTemplate}>
              <Download aria-hidden /> Modelo de planilha
            </Button>
            <Link to="/vendas" className={buttonVariants({ variant: 'ghost' })}>
              Voltar para vendas
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <Notice>
          Cada linha vira uma venda <b>importada</b>, com data até ontem. Ela entra no histórico, nos relatórios e na
          previsão de demanda dos produtos, mas <b>não baixa estoque</b> (o saldo de hoje continua o que foi contado e
          lançado). Nada é importado se houver erro, e o mesmo arquivo não entra duas vezes. Dá para desfazer depois.
        </Notice>

        <Card className="flex flex-col gap-4">
          <Field label="1. Arquivo CSV" hint="Salve a planilha como CSV (separado por ponto e vírgula ou vírgula).">
            <input
              key={inputKey}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-navy-700 file:px-3 file:py-2 file:font-semibold file:text-white"
            />
          </Field>

          {file && (
            <>
              <p className="text-sm text-muted">
                {file.name}: {file.csv.rows.length} linha(s), {file.csv.headers.length} coluna(s).
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr>
                      {file.csv.headers.map((h, i) => (
                        <Th key={i}>{h || `Coluna ${i + 1}`}</Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {file.csv.rows.slice(0, 5).map((r, i) => (
                      <Tr key={i}>
                        {file.csv.headers.map((_, j) => (
                          <Td key={j} className="whitespace-nowrap">
                            {r[j]}
                          </Td>
                        ))}
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>

              <div>
                <h2 className="mb-2 font-semibold">2. Qual coluna é cada informação</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {FIELDS.map((f) => (
                    <Field key={f.key} label={f.label} hint={f.hint}>
                      <Select
                        value={mapping[f.key] ?? ''}
                        onChange={(e) => {
                          invalidated();
                          setMapping((m) => ({ ...m, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) }));
                        }}
                      >
                        <option value="">— não tem —</option>
                        {file.csv.headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h || `Coluna ${i + 1}`}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="mb-2 font-semibold">3. Valores para o que o arquivo não informa</h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Produto padrão" hint="Para linhas sem produto (ex.: caderno só com o valor).">
                    <Select
                      value={productId}
                      onChange={(e) => {
                        invalidated();
                        setProductId(e.target.value);
                      }}
                    >
                      <option value="">— nenhum —</option>
                      {(products.data ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Canal padrão">
                    <Select
                      value={channel}
                      onChange={(e) => {
                        invalidated();
                        setChannel(e.target.value as Channel);
                      }}
                    >
                      {(Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => (
                        <option key={c} value={c}>
                          {CHANNEL_LABEL[c]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Pagamento padrão">
                    <Select
                      value={payment}
                      onChange={(e) => {
                        invalidated();
                        setPayment(e.target.value as PaymentMethod | '');
                      }}
                    >
                      <option value="">Não informado</option>
                      {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                        <option key={m} value={m}>
                          {PAYMENT_LABEL[m]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>

              <div>
                <Button onClick={() => check.mutate()} loading={check.isPending} disabled={mapping.date === undefined}>
                  <FileUp aria-hidden /> 4. Conferir arquivo
                </Button>
                {mapping.date === undefined && <p className="mt-1 text-xs text-warning">Escolha a coluna da data.</p>}
              </div>
            </>
          )}
        </Card>

        {preview && (
          <Card className="flex flex-col gap-3" aria-live="polite">
            <h2 className="font-semibold">Resultado da conferência</h2>
            <div className="flex flex-wrap gap-2">
              <Badge tone={preview.errorCount ? 'danger' : 'success'}>
                {preview.validRows} de {preview.totalRows} linha(s) válidas
              </Badge>
              {preview.summary.period.first && (
                <Badge>
                  {formatDay(preview.summary.period.first, false)} a {formatDay(preview.summary.period.last!, false)} ·{' '}
                  {preview.summary.period.days} dia(s)
                </Badge>
              )}
              <Badge>Total {formatMoney(preview.summary.totalAmount)}</Badge>
            </div>

            {preview.errorCount > 0 && (
              <Notice tone="warning">
                <p className="font-semibold">
                  {preview.errorCount} linha(s) com erro — corrija no arquivo e confira de novo (nada foi importado):
                </p>
                <ul className="mt-1 max-h-48 list-disc overflow-y-auto pl-4">
                  {preview.errors.map((e) => (
                    <li key={`${e.line}-${e.message}`}>
                      Linha {e.line}: {e.message}
                    </li>
                  ))}
                </ul>
              </Notice>
            )}
            {preview.warnings.length > 0 && (
              <Notice tone="warning">
                <ul className="list-disc pl-4">
                  {preview.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Notice>
            )}

            {preview.summary.byProduct.length > 0 && (
              <Table>
                <thead>
                  <tr>
                    <Th>Produto</Th>
                    <Th className="text-right">Linhas</Th>
                    <Th className="text-right">Quantidade</Th>
                    <Th className="text-right">Valor</Th>
                  </tr>
                </thead>
                <tbody>
                  {preview.summary.byProduct.map((p) => (
                    <Tr key={p.productId}>
                      <Td>{p.name}</Td>
                      <Td className="tabular text-right">{p.rows}</Td>
                      <Td className="tabular text-right">{formatNumber(p.quantity, 2)}</Td>
                      <Td className="tabular text-right">{formatMoney(p.amount)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}

            {needsOverlap && preview.canImport && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={allowOverlap}
                  onChange={(e) => setAllowOverlap(e.target.checked)}
                />
                Conferi: estas vendas não estão registradas no sistema nesse período (importar mesmo assim).
              </label>
            )}

            <div>
              <Button onClick={() => setConfirm(true)} disabled={!canImport}>
                Importar {preview.validRows} venda(s)
              </Button>
            </div>
          </Card>
        )}

        <ImportHistory />
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Importar ${preview?.validRows ?? 0} vendas?`}
        description="Elas entram no histórico, nos relatórios e na previsão. O estoque atual não muda. Dá para desfazer depois (as vendas ficam canceladas, nada é apagado)."
        confirmLabel="Importar"
        loading={commit.isPending}
        onConfirm={() => commit.mutate()}
      />
    </>
  );
}

function ImportHistory() {
  const invalidate = useInvalidateStock();
  const [undoing, setUndoing] = useState<SaleImportBatch | null>(null);
  const list = useQuery({
    queryKey: qk.saleImports,
    queryFn: () => api<SaleImportBatch[]>('/sales/imports'),
  });
  const undo = useMutation({
    mutationFn: (id: string) => api<{ canceled: number }>(`/sales/imports/${id}/undo`, { method: 'POST' }),
    onSuccess: async (r) => {
      toast.success(`Importação desfeita: ${r.canceled} venda(s) canceladas.`);
      setUndoing(null);
      await invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Card>
      <h2 className="mb-2 font-semibold">Importações feitas</h2>
      {list.isPending ? (
        <Spinner />
      ) : !list.data?.length ? (
        <EmptyState title="Nenhuma importação ainda" />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>Arquivo</Th>
                <Th>Período</Th>
                <Th className="text-right">Vendas</Th>
                <Th className="text-right">Valor</Th>
                <Th>Importado em</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((b) => (
                <Tr key={b.id}>
                  <Td>{b.fileName}</Td>
                  <Td className="whitespace-nowrap">
                    {formatDay(b.firstDay.slice(0, 10), false)} a {formatDay(b.lastDay.slice(0, 10), false)}
                  </Td>
                  <Td className="tabular text-right">{b.rows}</Td>
                  <Td className="tabular text-right">{formatMoney(b.totalAmount)}</Td>
                  <Td className="whitespace-nowrap">{formatDate(b.createdAt)}</Td>
                  <Td className="text-right">
                    {b.undoneAt ? (
                      <Badge>Desfeita</Badge>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setUndoing(b)}>
                        <Undo2 aria-hidden /> Desfazer
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
      <ConfirmDialog
        open={!!undoing}
        onOpenChange={(o) => !o && setUndoing(null)}
        title="Desfazer esta importação?"
        description={`As ${undoing?.rows ?? 0} vendas de "${undoing?.fileName}" serão canceladas (motivo: importação desfeita). Nada é apagado.`}
        confirmLabel="Desfazer"
        destructive
        loading={undo.isPending}
        onConfirm={() => undoing && undo.mutate(undoing.id)}
      />
    </Card>
  );
}
