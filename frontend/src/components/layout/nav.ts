import {
  BarChart3,
  Boxes,
  Building2,
  ClipboardList,
  FileBarChart,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  /** Texto curto para o trilho de ícones e a barra inferior. */
  short?: string;
  icon: LucideIcon;
  /** Só OWNER/MANAGER. */
  managerOnly?: boolean;
  /** Só quem é dono/gerente de mais de um estabelecimento. */
  multiStoreOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Menu agrupado por assunto: o que se faz no dia a dia primeiro, gestão depois. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operação',
    items: [
      { to: '/', label: 'Início', icon: LayoutDashboard },
      { to: '/vender', label: 'Nova venda', short: 'Vender', icon: ShoppingCart },
      { to: '/caixa', label: 'Caixa', icon: Wallet },
    ],
  },
  {
    label: 'Estoque',
    items: [
      { to: '/estoque', label: 'Estoque', icon: Boxes },
      { to: '/movimentacoes', label: 'Movimentações', short: 'Histórico', icon: ClipboardList },
      { to: '/ingredientes', label: 'Ingredientes', icon: Package },
      { to: '/produtos', label: 'Produtos', icon: BarChart3 },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { to: '/vendas', label: 'Vendas', icon: Receipt, managerOnly: true },
      { to: '/previsao', label: 'Previsão', icon: TrendingUp, managerOnly: true },
      { to: '/relatorios', label: 'Relatórios', icon: FileBarChart, managerOnly: true },
      { to: '/lojas', label: 'Minhas lojas', short: 'Lojas', icon: Building2, managerOnly: true, multiStoreOnly: true },
    ],
  },
  {
    label: 'Conta',
    items: [{ to: '/configuracoes', label: 'Configurações', short: 'Ajustes', icon: Settings }],
  },
];

const allowed = (item: NavItem, isManager: boolean, managedStores: number) =>
  (isManager || !item.managerOnly) && (!item.multiStoreOnly || managedStores > 1);

/** Grupos com os itens que este papel pode ver (grupos vazios somem). */
export const visibleGroups = (isManager: boolean, managedStores = 0): NavGroup[] =>
  NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => allowed(i, isManager, managedStores)) })).filter(
    (g) => g.items.length > 0,
  );

/** Item do menu que corresponde à rota atual (prefixo mais longo: /estoque/contagem → Estoque). */
export function currentNavItem(pathname: string): NavItem | undefined {
  const all = NAV_GROUPS.flatMap((g) => g.items);
  return all
    .filter((i) => (i.to === '/' ? pathname === '/' : pathname === i.to || pathname.startsWith(`${i.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0];
}

const GROUP_COLOR: Record<string, 'sky' | 'emerald' | 'violet' | 'slate'> = {
  Operação: 'sky',
  Estoque: 'emerald',
  Gestão: 'violet',
  Conta: 'slate',
};

/** Cor do assunto da rota (Operação azul, Estoque verde, Gestão violeta, Conta cinza). */
export function navColor(pathname: string) {
  const item = currentNavItem(pathname);
  const group = NAV_GROUPS.find((g) => g.items.includes(item!));
  return (group && GROUP_COLOR[group.label]) ?? 'sky';
}
