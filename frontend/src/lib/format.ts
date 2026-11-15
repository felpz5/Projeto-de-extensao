import type {
  BaseUnit,
  Channel,
  Confidence,
  Decimal,
  MovementType,
  PaymentMethod,
  QuantitySource,
  ReorderUrgency,
  Role,
  StockStatus,
} from '@/lib/types';

/** Fuso do estabelecimento ativo (definido ao carregar a sessão). Datas são mostradas nele. */
let timeZone: string | undefined;
export function setDisplayTimeZone(tz: string | undefined) {
  timeZone = tz;
}

export function toNumber(value: Decimal | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

const moneyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatMoney = (v: Decimal | number | null | undefined) => moneyFmt.format(toNumber(v));

export function formatNumber(v: Decimal | number | null | undefined, maxDigits = 2) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: maxDigits }).format(toNumber(v));
}

export const UNIT_LABEL: Record<BaseUnit, string> = { G: 'g', ML: 'ml', UN: 'un' };
export const UNIT_NAME: Record<BaseUnit, string> = {
  G: 'Gramas (g)',
  ML: 'Mililitros (ml)',
  UN: 'Unidades (un)',
};

/**
 * Quantidade na unidade base, com conversão para leitura: 38349 g → "38,35 kg",
 * 2500 ml → "2,5 L". Unidades nunca são convertidas.
 */
export function formatQty(v: Decimal | number | null | undefined, unit: BaseUnit) {
  const n = toNumber(v);
  if (unit !== 'UN' && Math.abs(n) >= 1000) {
    return `${formatNumber(n / 1000, 2)} ${unit === 'G' ? 'kg' : 'L'}`;
  }
  // Até 2 casas: não arredonda 0,5 un para "1 un" nem 0,25 g para "0,3 g".
  return `${formatNumber(n, 2)} ${UNIT_LABEL[unit]}`;
}

/** Quantidade com sinal explícito (+/−), para movimentações. */
export function formatSignedQty(v: Decimal | number, unit: BaseUnit) {
  const n = toNumber(v);
  const text = formatQty(Math.abs(n), unit);
  return n > 0 ? `+${text}` : n < 0 ? `−${text}` : text;
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(iso));
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone }).format(new Date(iso));
}

/** "2026-11-14" (dia, sem fuso) → "sáb., 14/11". */
export function formatDay(day: string, withWeekday = true) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: withWeekday ? 'short' : undefined,
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

/** Dia de hoje (YYYY-MM-DD) no fuso do estabelecimento. */
export function today(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}

/** Valor para <input type="datetime-local"> com o horário atual do navegador. */
export function nowLocalInput() {
  const d = new Date();
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** "2026-11-14T10:30" (horário local do navegador) → ISO com fuso, como a API exige. */
export function localInputToIso(value: string) {
  return new Date(value).toISOString();
}

// ---------- Rótulos ----------

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: 'Dono',
  MANAGER: 'Gerente',
  STAFF: 'Funcionário',
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  IN_STORE: 'Balcão',
  ONLINE: 'Online',
};

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  INITIAL: 'Estoque inicial',
  PURCHASE: 'Compra',
  SALE_CONSUMPTION: 'Consumo em venda',
  MANUAL_OUT: 'Saída manual',
  LOSS: 'Perda',
  ADJUSTMENT: 'Ajuste',
};

export const STATUS_LABEL: Record<StockStatus, string> = {
  OK: 'Normal',
  LOW: 'Baixo',
  OUT: 'Zerado',
};

export const SOURCE_LABEL: Record<QuantitySource, string> = {
  MEASURED: 'Medido',
  RECIPE: 'Receita',
  STANDARD_PORTION: 'Porção padrão',
  UNKNOWN: 'Quantidade desconhecida',
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  LOW: 'Confiança baixa',
  MEDIUM: 'Confiança média',
  HIGH: 'Confiança alta',
};

export const URGENCY_LABEL: Record<ReorderUrgency, string> = {
  OUT_OF_STOCK: 'Sem estoque',
  URGENT: 'Urgente',
  BUY: 'Comprar',
  OK: 'Suficiente',
  LOW_STOCK_NO_HISTORY: 'Abaixo do mínimo',
  NO_HISTORY: 'Sem histórico',
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  PIX: 'Pix',
  CASH: 'Dinheiro',
  CREDIT_CARD: 'Crédito',
  DEBIT_CARD: 'Débito',
  VOUCHER: 'Vale',
  OTHER: 'Outro',
};

export const paymentLabel = (m: PaymentMethod | null | undefined) =>
  m ? PAYMENT_LABEL[m] : 'Não informado';

/** Porcentagem no formato pt-BR (ex.: 12,5%). */
export const formatPct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? '—' : `${formatNumber(v, digits)}%`;
