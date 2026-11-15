import { ArrowRight, Bell, Building2, LogOut, Settings, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { InstallButton } from '@/components/pwa';
import { StockBadge } from '@/components/ui/badge';
import { Avatar, Dropdown } from '@/components/ui/dropdown';
import { useAuth } from '@/features/auth/auth-context';
import { formatQty, ROLE_LABEL } from '@/lib/format';
import { useLevels } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** Sino com os ingredientes zerados/abaixo do mínimo (todos os papéis veem o estoque). */
export function AlertsBell() {
  const levels = useLevels();
  const alerts = (levels.data ?? [])
    .filter((l) => l.status !== 'OK')
    .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'OUT' ? -1 : 1));
  const out = alerts.filter((a) => a.status === 'OUT').length;

  return (
    <Dropdown
      label="Alertas de estoque"
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={id}
          aria-label={alerts.length ? `${alerts.length} alertas de estoque` : 'Sem alertas de estoque'}
          className={cn(
            'relative flex size-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-navy-800 hover:text-white',
            open && 'bg-navy-800 text-white',
          )}
        >
          <Bell className={cn('size-5', alerts.length > 0 && 'motion-safe:animate-[wiggle_1s_ease-in-out_1]')} aria-hidden />
          {alerts.length > 0 && (
            <span
              className={cn(
                'absolute right-1.5 top-1.5 flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-[18px] ring-2 ring-navy-950',
                out ? 'bg-danger text-white' : 'bg-warning text-navy-950',
              )}
            >
              {alerts.length > 9 ? '9+' : alerts.length}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="border-b border-navy-700 px-4 py-3">
            <p className="text-sm font-semibold">Alertas de estoque</p>
            <p className="text-xs text-muted">
              {alerts.length ? `${out} zerado(s) · ${alerts.length - out} abaixo do mínimo` : 'Tudo acima do mínimo'}
            </p>
          </div>
          <ul className="max-h-72 overflow-y-auto">
            {alerts.slice(0, 8).map((a) => (
              <li key={a.ingredientId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-navy-800/60">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{a.name}</span>
                  <span className="tabular text-xs text-muted">
                    {formatQty(a.stock, a.baseUnit)} · mín. {formatQty(a.minStock, a.baseUnit)}
                  </span>
                </span>
                <StockBadge status={a.status} />
              </li>
            ))}
            {alerts.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">Nenhum alerta agora. 🎉</li>}
          </ul>
          <Link
            to="/estoque"
            onClick={close}
            className="flex items-center justify-center gap-1 border-t border-navy-700 px-4 py-2.5 text-sm font-semibold text-accent hover:bg-navy-800"
          >
            Ver estoque <ArrowRight className="size-4" aria-hidden />
          </Link>
        </>
      )}
    </Dropdown>
  );
}

/** Avatar com o menu da conta: trocar de loja, minha conta, instalar app, sair. */
export function UserMenu({ onSwitchTenant }: { onSwitchTenant: () => void }) {
  const { session, logout } = useAuth();
  const item =
    'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-muted transition-colors hover:bg-navy-800 hover:text-white [&_svg]:size-4';

  return (
    <Dropdown
      label="Menu da conta"
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={id}
          aria-label="Menu da conta"
          className={cn('rounded-full ring-2 ring-transparent transition hover:ring-navy-600', open && 'ring-accent/60')}
        >
          <Avatar name={session?.user.name} />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 border-b border-navy-700 px-4 py-3">
            <Avatar name={session?.user.name} className="size-10 text-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{session?.user.name}</p>
              <p className="truncate text-xs text-muted">{session?.user.email}</p>
              <p className="mt-0.5 text-xs text-accent">
                {session && ROLE_LABEL[session.tenant.role]} · {session?.tenant.name}
              </p>
            </div>
          </div>
          <div className="py-1">
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={() => {
                close();
                onSwitchTenant();
              }}
            >
              <Building2 aria-hidden /> Trocar de estabelecimento
            </button>
            <Link role="menuitem" to="/configuracoes?aba=conta" onClick={close} className={item}>
              <UserRound aria-hidden /> Minha conta
            </Link>
            <Link role="menuitem" to="/configuracoes" onClick={close} className={item}>
              <Settings aria-hidden /> Configurações
            </Link>
          </div>
          <div className="border-t border-navy-700 p-2">
            <InstallButton variant="ghost" size="sm" className="w-full justify-start" onDone={close} />
            <button type="button" role="menuitem" className={cn(item, 'rounded-lg px-3 text-danger hover:text-danger')} onClick={() => logout()}>
              <LogOut aria-hidden /> Sair
            </button>
          </div>
        </>
      )}
    </Dropdown>
  );
}
