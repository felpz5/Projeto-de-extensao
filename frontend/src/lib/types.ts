/**
 * Formato das respostas da API. Valores decimais (dinheiro, quantidades) chegam como TEXTO
 * para não perder precisão: converta com toNumber() (lib/format) só na hora de exibir/calcular.
 */
export type Decimal = string;

export type Role = 'OWNER' | 'MANAGER' | 'STAFF';
export type MembershipStatus = 'ACTIVE' | 'DISABLED' | 'INVITED';
export type BaseUnit = 'G' | 'ML' | 'UN';
export type PricingMode = 'UNIT' | 'WEIGHT';
export type CategoryKind = 'PRODUCT' | 'INGREDIENT';
export type Channel = 'IN_STORE' | 'ONLINE';
export type StockStatus = 'OK' | 'LOW' | 'OUT';
export type MovementType =
  | 'INITIAL'
  | 'PURCHASE'
  | 'SALE_CONSUMPTION'
  | 'MANUAL_OUT'
  | 'LOSS'
  | 'ADJUSTMENT';
export type ManualMovementType = Exclude<MovementType, 'SALE_CONSUMPTION'>;
export type QuantitySource = 'MEASURED' | 'RECIPE' | 'STANDARD_PORTION' | 'UNKNOWN';
export type PaymentMethod = 'CASH' | 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'VOUCHER' | 'OTHER';
export type SaleStatus = 'COMPLETED' | 'CANCELED';

// ---------- Auth ----------

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
}

export interface SessionTenant {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

export interface Session {
  accessToken: string;
  user: SessionUser;
  tenant: SessionTenant;
}

export interface Invitation {
  tenant: { id: string; name: string; slug?: string };
  role: Role;
  invitedAt: string;
}

export interface Me {
  user: SessionUser & { createdAt: string };
  activeTenantId: string;
  role: Role;
  tenants: SessionTenant[];
  invitations: Invitation[];
}

// ---------- Estabelecimento ----------

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  segment: string | null;
  timezone: string;
}

export interface Member {
  id: string;
  role: Role;
  status: MembershipStatus;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

// ---------- Catálogo ----------

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
}

export interface CategoryRef {
  id: string;
  name: string;
}

export interface Ingredient {
  id: string;
  categoryId: string | null;
  name: string;
  baseUnit: BaseUnit;
  minStock: Decimal;
  costPerUnit: Decimal | null;
  leadTimeDays: number;
  defaultPortion: Decimal | null;
  active: boolean;
  category: CategoryRef | null;
  stock: Decimal;
  status: StockStatus;
  isLowStock: boolean;
}

export interface IngredientRef {
  id: string;
  name: string;
  baseUnit: BaseUnit;
}

/** Custo e margem do produto (só dono/gerente; null para funcionário). */
export interface ProductCosting {
  /** UNIT = custo de 1 unidade · KG = custo de 1 kg */
  basis: 'UNIT' | 'KG';
  cost: Decimal | null;
  margin: Decimal | null;
  marginPct: number | null;
  missingCost: string[];
  coveragePct: number | null;
  estimated: boolean;
}

export interface Product {
  id: string;
  categoryId: string | null;
  name: string;
  pricingMode: PricingMode;
  price: Decimal;
  active: boolean;
  category: CategoryRef | null;
  _count: { recipeItems: number; weightMix: number };
  costing: ProductCosting | null;
}

export interface ProductDetail extends Omit<Product, '_count'> {
  recipeItems: { ingredientId: string; quantity: Decimal; ingredient: IngredientRef }[];
  weightMix: { ingredientId: string; percentage: Decimal; ingredient: IngredientRef }[];
}

/** Exclusão de item com histórico vira desativação. */
export interface RemoveResult {
  deleted: boolean;
  deactivated: boolean;
}

// ---------- Estoque ----------

export interface StockLevel {
  ingredientId: string;
  name: string;
  baseUnit: BaseUnit;
  category: CategoryRef | null;
  stock: Decimal;
  minStock: Decimal;
  status: StockStatus;
  stockValue: Decimal | null;
}

export interface Movement {
  id: string;
  ingredientId: string;
  type: MovementType;
  quantity: Decimal;
  unitCost: Decimal | null;
  occurredAt: string;
  saleId: string | null;
  isEstimated: boolean;
  note: string | null;
  createdById: string | null;
  createdAt: string;
  reversesId: string | null;
  reversedAt: string | null;
  ingredient: IngredientRef;
}

export interface Page<T> {
  items: T[];
  total: number;
  take: number;
  skip: number;
}

export interface CountResult {
  countedAt: string;
  adjusted: number;
  items: { ingredientId: string; previous: Decimal; counted: Decimal; difference: Decimal }[];
}

// ---------- Vendas ----------

export interface SaleItem {
  id: string;
  productId: string;
  quantity: Decimal;
  unitPrice: Decimal;
  weightG: Decimal | null;
  product: { id: string; name: string; pricingMode?: PricingMode };
  ingredients?: {
    ingredientId: string;
    quantity: Decimal | null;
    quantitySource: QuantitySource;
    ingredient: IngredientRef;
  }[];
}

export interface Sale {
  id: string;
  channel: Channel;
  soldAt: string;
  createdAt: string;
  totalAmount: Decimal;
  totalWeightG: Decimal | null;
  notes: string | null;
  createdById: string | null;
  createdByName?: string | null;
  paymentMethod: PaymentMethod | null;
  status: SaleStatus;
  canceledAt: string | null;
  canceledById: string | null;
  canceledByName?: string | null;
  cancelReason: string | null;
  correctsId: string | null;
  /**
   * Até quando quem está logado pode cancelar/corrigir: data (funcionário), null (dono/gerente,
   * sem prazo) ou false (não pode). Vem no detalhe e no caixa.
   */
  editableUntil?: string | null | false;
  items: SaleItem[];
}

export interface SaleDetail extends Sale {
  movements: Movement[];
}

export interface SalesPage extends Page<Sale> {
  totalAmount: Decimal;
}

export interface SalesSummary {
  period: { from: string; to: string };
  revenue: Decimal;
  orders: number;
  averageTicket: Decimal;
  /** Custo dos ingredientes baixados pelas vendas × custo atual (estimativa). */
  estimatedCost: Decimal;
  grossProfit: Decimal;
  /** Baixas de ingredientes sem custo cadastrado (o custo fica incompleto). */
  costMissingMovements: number;
  byChannel: { channel: Channel; orders: number; revenue: Decimal }[];
  byPayment: { method: PaymentMethod | null; orders: number; revenue: Decimal }[];
  byDay: { day: string; orders: number; revenue: Decimal }[];
}

export interface TopProduct {
  productId: string;
  name: string;
  quantity: number;
  revenue: Decimal;
  orders: number;
  weightG: number | null;
}

// ---------- Previsão ----------

export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ForecastDay {
  date: string;
  weekday: number;
  expected: number;
  low: number;
  high: number;
}

export interface Forecast {
  status: 'OK' | 'INSUFFICIENT_HISTORY';
  historyDays: number;
  confidence: Confidence | null;
  method?: string | null;
  averageDaily: number | null;
  stdDevDaily?: number | null;
  total: { expected: number; low: number; high: number } | null;
  daily?: ForecastDay[];
  message: string;
}

export interface ProductForecastResponse {
  horizonDays: number;
  generatedFor: string;
  disclaimer: string;
  items: { product: { id: string; name: string; pricingMode: PricingMode }; forecast: Forecast }[];
}

export type ReorderUrgency =
  | 'OUT_OF_STOCK'
  | 'URGENT'
  | 'BUY'
  | 'OK'
  | 'LOW_STOCK_NO_HISTORY'
  | 'NO_HISTORY';

export interface ReorderItem {
  ingredient: { id: string; name: string; baseUnit: BaseUnit; leadTimeDays: number };
  stock: number;
  minStock: number;
  usesEstimatedData: boolean;
  forecast: Forecast;
  recommendation: {
    urgency: ReorderUrgency;
    suggestedQuantity: number | null;
    demandDuringCoverage: number | null;
    safetyStock: number | null;
    daysUntilStockout: number | null;
    explanation: string;
    estimatedCost?: number | null;
  };
}

export interface ReorderResponse {
  coverageDays: number;
  generatedFor: string;
  disclaimer: string;
  items: ReorderItem[];
}

// ---------- Dashboard ----------

export interface Dashboard {
  /** null para STAFF (relatórios são de gerente/dono). */
  sales: SalesSummary | null;
  topProducts: TopProduct[] | null;
  stock: {
    totalIngredients: number;
    ok: number;
    low: number;
    out: number;
    /** null para funcionário (dado financeiro). */
    estimatedValue: number | null;
    alerts: StockLevel[];
  };
  recentMovements: Movement[];
  reorderSuggestions: { disclaimer: string; items: ReorderItem[] } | null;
}

// ---------- Caixa ----------

export interface CashReport {
  date: string;
  userId: string | null;
  editWindowMinutes: number;
  orders: number;
  revenue: Decimal;
  averageTicket: Decimal;
  byPayment: { method: PaymentMethod | null; orders: number; revenue: Decimal }[];
  canceled: { orders: number; amount: Decimal };
  sales: Sale[];
}

// ---------- Relatórios de estoque ----------

export interface StockReportItem {
  ingredientId: string;
  name: string;
  baseUnit: BaseUnit;
  costPerUnit: Decimal | null;
  purchased: number;
  consumed: number;
  consumedEstimated: number;
  manualOut: number;
  lost: number;
  adjusted: number;
  adjustments: number;
  lostValue: Decimal | null;
  adjustedValue: Decimal | null;
  adjustmentPct: number | null;
}

export interface StockReport {
  period: { from: string; to: string };
  totals: {
    lostValue: Decimal;
    adjustedValue: Decimal;
    ingredientsWithLoss: number;
    ingredientsWithoutCost: number;
  };
  items: StockReportItem[];
}

export interface CountHistoryEntry {
  id: string;
  countedAt: string;
  registeredAt: string;
  userName: string | null;
  counted: number;
  adjusted: number;
  items: {
    ingredientId: string;
    name: string;
    baseUnit: BaseUnit;
    previous: Decimal;
    counted: Decimal;
    difference: Decimal;
  }[];
}

// ---------- Auditoria ----------

export interface AuditEntry {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

// ---------- Minhas lojas ----------

export interface StoresOverview {
  days: number;
  stores: {
    tenant: { id: string; name: string; slug: string };
    role: Role;
    current: boolean;
    today: { orders: number; revenue: Decimal };
    period: { days: number; orders: number; revenue: Decimal; averageTicket: Decimal };
    stock: { low: number; out: number };
  }[];
  totals: { todayRevenue: Decimal; todayOrders: number; periodRevenue: Decimal; periodOrders: number };
}
