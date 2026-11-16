import { Boxes, ChevronDown, LayoutDashboard, Menu, PanelLeftClose, PanelLeftOpen, ShoppingCart, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { buttonVariants } from '@/components/ui/button';
import { Spinner } from '@/components/ui/feedback';
import { useAuth } from '@/features/auth/auth-context';
import { useMediaQuery, usePersistentState } from '@/lib/hooks';
import { useMe, useTenant } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { Logo, LogoMark } from './logo';
import { MobileDrawer } from './mobile-drawer';
import { currentNavItem, visibleGroups } from './nav';
import { NavGroups } from './sidebar';
import { TenantSwitcher } from './tenant-switcher';
import { AlertsBell, UserMenu } from './topbar-menus';

/**
 * Estrutura do app, em três tamanhos:
 * - celular (< 768px): barra superior com menu hambúrguer + barra inferior com o botão Vender;
 * - tablet (768–1023px): trilho lateral só com ícones; o hambúrguer abre o menu completo;
 * - computador (≥ 1024px): menu lateral completo; o hambúrguer recolhe/expande (e lembra).
 * Respeita as áreas seguras do celular (entalhe, barra de gestos) quando instalado como app.
 */
export function AppLayout() {
  const { isManager, session } = useAuth();
  const location = useLocation();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tenantOpen, setTenantOpen] = useState(false);
  const [collapsed, setCollapsed] = usePersistentState('gestock:menu-recolhido', false);

  // Fuso do estabelecimento: as páginas só renderizam depois dele (datas e "hoje" dos filtros).
  const tenant = useTenant();
  const me = useMe();
  const managedStores = me.data?.tenants.filter((t) => t.role === 'OWNER' || t.role === 'MANAGER').length ?? 0;
  const groups = visibleGroups(isManager, managedStores);
  const current = currentNavItem(location.pathname);
  const expanded = isDesktop && !collapsed;

  // Navegou: fecha a gaveta (o clique no item já fecha; isto cobre voltar/avançar do navegador).
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const onHamburger = () => (isDesktop ? setCollapsed((c) => !c) : setDrawerOpen(true));

  return (
    <div className={cn('min-h-dvh transition-[padding] duration-300 md:pl-[76px] print:!pl-0', expanded && 'lg:pl-64')}>
      {/* Menu lateral: trilho de ícones (tablet/recolhido) ou completo (computador) */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-navy-800 bg-navy-900/95 pl-[env(safe-area-inset-left)] backdrop-blur transition-[width] duration-300 md:flex print:!hidden',
          expanded ? 'w-64' : 'w-[76px]',
        )}
      >
        <div className={cn('flex h-16 shrink-0 items-center', expanded ? 'px-5' : 'justify-center')}>
          <Link to="/" aria-label="Gestock — início">
            {expanded ? (
              <Logo />
            ) : (
              <span className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-[#0B2A6B] to-[#001849] p-2 text-white">
                <LogoMark className="size-full" />
              </span>
            )}
          </Link>
        </div>
        <nav aria-label="Principal" className={cn('flex-1 overflow-y-auto overflow-x-hidden py-3', expanded ? 'px-3' : 'px-2')}>
          <NavGroups groups={groups} compact={!expanded} />
        </nav>
        {isDesktop && (
          <div className="border-t border-navy-800 p-3">
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted transition-colors hover:bg-navy-800 hover:text-white',
                !expanded && 'justify-center px-0',
              )}
              aria-label={expanded ? 'Recolher menu' : 'Expandir menu'}
            >
              {expanded ? <PanelLeftClose className="size-[18px]" aria-hidden /> : <PanelLeftOpen className="size-[18px]" aria-hidden />}
              {expanded && 'Recolher menu'}
            </button>
          </div>
        )}
      </aside>

      {/* Barra superior */}
      <header className="sticky top-0 z-30 border-b border-navy-800 bg-navy-950/85 pt-[env(safe-area-inset-top)] backdrop-blur-md print:hidden">
        <div className="flex h-16 items-center gap-2 px-3 sm:px-4 lg:px-6">
          <button
            type="button"
            onClick={onHamburger}
            aria-label={isDesktop ? (collapsed ? 'Expandir menu' : 'Recolher menu') : 'Abrir menu'}
            aria-expanded={isDesktop ? !collapsed : drawerOpen}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-navy-800 hover:text-white"
          >
            <Menu className="size-5" aria-hidden />
          </button>

          {/* Seção atual + estabelecimento (toque para trocar) */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold sm:text-base">{current?.label ?? 'Gestock'}</p>
            <button
              type="button"
              onClick={() => setTenantOpen(true)}
              className="flex max-w-full items-center gap-1 text-xs text-muted transition-colors hover:text-white"
              aria-label={`Estabelecimento: ${session?.tenant.name}. Trocar`}
            >
              <span className="truncate">{session?.tenant.name}</span>
              <ChevronDown className="size-3 shrink-0" aria-hidden />
            </button>
          </div>

          <Link
            to="/vender"
            className={cn(buttonVariants({ size: 'sm' }), 'hidden shadow-lg shadow-accent/20 sm:inline-flex', location.pathname === '/vender' && 'invisible')}
          >
            <ShoppingCart aria-hidden /> Nova venda
          </Link>
          <AlertsBell />
          <UserMenu onSwitchTenant={() => setTenantOpen(true)} />
        </div>
      </header>

      <main
        key={location.pathname}
        className="mx-auto w-full max-w-7xl px-4 pb-32 pt-5 motion-safe:animate-page-in sm:px-6 md:pb-12 lg:px-8 lg:pt-7"
      >
        {session?.tenant.isDemo && (
          <p
            role="note"
            className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-center text-sm font-semibold text-warning"
          >
            Ambiente de demonstração — dados simulados.
          </p>
        )}
        {tenant.isPending ? <Spinner /> : <Outlet />}
      </main>

      <BottomNav onMenu={() => setDrawerOpen(true)} />

      <MobileDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        groups={groups}
        onSwitchTenant={() => setTenantOpen(true)}
      />
      <TenantSwitcher open={tenantOpen} onOpenChange={setTenantOpen} />
    </div>
  );
}

/** Barra inferior do celular: atalhos do dia a dia, com o "Vender" em destaque no centro. */
function BottomNav({ onMenu }: { onMenu: () => void }) {
  const link = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex flex-1 flex-col items-center justify-center gap-1 pt-2 text-[11px] font-medium transition-colors',
      isActive ? 'text-accent' : 'text-muted',
    );
  return (
    <nav
      aria-label="Atalhos"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-navy-800 bg-navy-900/95 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur-md md:hidden print:hidden"
    >
      <div className="mx-auto flex h-14 max-w-md items-stretch px-2">
        <NavLink to="/" end className={link}>
          <LayoutDashboard className="size-5" aria-hidden /> Início
        </NavLink>
        <NavLink to="/caixa" className={link}>
          <Wallet className="size-5" aria-hidden /> Caixa
        </NavLink>
        {/* botão central elevado */}
        <div className="flex flex-1 justify-center">
          <NavLink
            to="/vender"
            aria-label="Nova venda"
            className={({ isActive }) =>
              cn(
                '-mt-6 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-strong text-navy-950 shadow-lg shadow-accent/30 ring-4 ring-navy-950 transition-transform active:scale-95',
                isActive && 'ring-accent/30',
              )
            }
          >
            <ShoppingCart className="size-6" aria-hidden />
          </NavLink>
        </div>
        <NavLink to="/estoque" className={link}>
          <Boxes className="size-5" aria-hidden /> Estoque
        </NavLink>
        <button type="button" onClick={onMenu} className={link({ isActive: false })} aria-label="Abrir menu">
          <Menu className="size-5" aria-hidden /> Menu
        </button>
      </div>
    </nav>
  );
}
