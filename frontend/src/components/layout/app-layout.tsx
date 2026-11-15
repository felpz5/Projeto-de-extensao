import { useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronDown, LogOut, Menu } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/feedback';
import { useAuth } from '@/features/auth/auth-context';
import { errorMessage } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/format';
import { useMe, useTenant } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { InstallButton } from '@/components/pwa';
import { Logo } from './logo';
import { visibleNav } from './nav';

export function AppLayout() {
  const { session, isManager, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [tenantOpen, setTenantOpen] = useState(false);
  // Fuso do estabelecimento: as páginas só renderizam depois dele (datas e "hoje" dos filtros).
  // Se a consulta falhar, segue com o fuso do navegador em vez de travar o app.
  const tenant = useTenant();
  const items = visibleNav(isManager);

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Menu lateral (computador) */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-navy-700 bg-navy-900 lg:flex">
        <div className="p-5">
          <Logo />
        </div>
        <nav aria-label="Principal" className="flex-1 overflow-y-auto px-3">
          <NavList items={items} />
        </nav>
        <div className="border-t border-navy-700 p-3">
          <p className="truncate px-3 text-sm font-medium">{session?.user.name}</p>
          <p className="truncate px-3 text-xs text-muted">{session?.user.email}</p>
          <InstallButton className="mt-3 w-full" />
          <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={() => logout()}>
            <LogOut aria-hidden /> Sair
          </Button>
        </div>
      </aside>

      {/* Barra superior */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-navy-700 bg-navy-950/90 px-4 backdrop-blur">
        <Logo className="lg:hidden" />
        <button
          type="button"
          onClick={() => setTenantOpen(true)}
          className="ml-auto flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-navy-800 lg:ml-0"
          aria-label="Trocar de estabelecimento"
        >
          <Building2 className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="truncate font-medium">{session?.tenant.name}</span>
          <Badge className="hidden sm:inline-flex">{session && ROLE_LABEL[session.tenant.role]}</Badge>
          <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
        </button>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 lg:pb-10">
        {tenant.isPending ? <Spinner /> : <Outlet />}
      </main>

      {/* Barra inferior (celular) */}
      <nav
        aria-label="Atalhos"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-navy-700 bg-navy-900 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {items
          .filter((i) => i.mobile)
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 py-2.5 text-xs',
                  isActive ? 'text-accent' : 'text-muted',
                )
              }
            >
              <item.icon className="size-5" aria-hidden />
              {item.label}
            </NavLink>
          ))}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex flex-col items-center gap-1 py-2.5 text-xs text-muted"
        >
          <Menu className="size-5" aria-hidden />
          Menu
        </button>
      </nav>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen} title="Menu">
        <NavList items={items} onNavigate={() => setMenuOpen(false)} />
        <InstallButton size="md" className="mt-4 w-full" onDone={() => setMenuOpen(false)} />
        <Button variant="ghost" className="mt-3 w-full justify-start" onClick={() => logout()}>
          <LogOut aria-hidden /> Sair
        </Button>
      </Dialog>

      <TenantSwitcher open={tenantOpen} onOpenChange={setTenantOpen} />
    </div>
  );
}

function NavList({ items, onNavigate }: { items: ReturnType<typeof visibleNav>; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-navy-800 hover:text-white',
              )
            }
          >
            <item.icon className="size-4" aria-hidden />
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

/** Lista os estabelecimentos do usuário e os convites pendentes. */
function TenantSwitcher({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { session, switchTenant } = useAuth();
  const me = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const choose = async (tenantId: string) => {
    if (tenantId === session?.tenant.id) return onOpenChange(false);
    setBusy(tenantId);
    try {
      await switchTenant(tenantId);
      onOpenChange(false);
      navigate('/');
      toast.success('Estabelecimento trocado.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const invitations = me.data?.invitations ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Estabelecimentos" description="Escolha onde você quer trabalhar agora.">
      <ul className="flex flex-col gap-2">
        {(me.data?.tenants ?? []).map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => choose(t.id)}
              disabled={busy !== null}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left text-sm',
                t.id === session?.tenant.id
                  ? 'border-accent bg-accent/10'
                  : 'border-navy-700 hover:bg-navy-800',
              )}
            >
              <span className="font-medium">{t.name}</span>
              <Badge>{busy === t.id ? 'Abrindo…' : ROLE_LABEL[t.role]}</Badge>
            </button>
          </li>
        ))}
      </ul>
      {invitations.length > 0 && (
        <p className="mt-4 text-sm text-muted">
          Você tem {invitations.length} convite(s) pendente(s).{' '}
          <button
            type="button"
            className="font-semibold text-accent hover:underline"
            onClick={() => {
              onOpenChange(false);
              queryClient.invalidateQueries({ queryKey: ['me'] });
              navigate('/configuracoes?aba=conta');
            }}
          >
            Ver convites
          </button>
        </p>
      )}
    </Dialog>
  );
}
