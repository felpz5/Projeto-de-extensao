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
  icon: LucideIcon;
  /** Só OWNER/MANAGER. */
  managerOnly?: boolean;
  /** Só quem é dono/gerente de mais de um estabelecimento. */
  multiStoreOnly?: boolean;
  /** Aparece na barra inferior do celular. */
  mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Início', icon: LayoutDashboard, mobile: true },
  { to: '/vender', label: 'Nova venda', icon: ShoppingCart, mobile: true },
  { to: '/caixa', label: 'Caixa', icon: Wallet, mobile: true },
  { to: '/vendas', label: 'Vendas', icon: Receipt, managerOnly: true },
  { to: '/estoque', label: 'Estoque', icon: Boxes, mobile: true },
  { to: '/movimentacoes', label: 'Movimentações', icon: ClipboardList },
  { to: '/ingredientes', label: 'Ingredientes', icon: Package },
  { to: '/produtos', label: 'Produtos', icon: BarChart3 },
  { to: '/previsao', label: 'Previsão', icon: TrendingUp, managerOnly: true },
  { to: '/relatorios', label: 'Relatórios', icon: FileBarChart, managerOnly: true },
  { to: '/lojas', label: 'Minhas lojas', icon: Building2, managerOnly: true, multiStoreOnly: true },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];

export const visibleNav = (isManager: boolean, managedStores = 0) =>
  NAV_ITEMS.filter(
    (item) => (isManager || !item.managerOnly) && (!item.multiStoreOnly || managedStores > 1),
  );
