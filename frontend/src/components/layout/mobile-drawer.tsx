import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronRight, LogOut, X } from 'lucide-react';
import { InstallButton } from '@/components/pwa';
import { Avatar } from '@/components/ui/dropdown';
import { useAuth } from '@/features/auth/auth-context';
import { ROLE_LABEL } from '@/lib/format';
import { Logo } from './logo';
import type { NavGroup } from './nav';
import { NavGroups } from './sidebar';

/**
 * Menu hambúrguer: gaveta que desliza da esquerda (celular e tablet). Acessível (Radix):
 * prende o foco, fecha com Esc, com toque fora ou ao navegar. Respeita o entalhe do celular.
 */
export function MobileDrawer({
  open,
  onOpenChange,
  groups,
  onSwitchTenant,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: NavGroup[];
  onSwitchTenant: () => void;
}) {
  const { session, logout } = useAuth();
  const close = () => onOpenChange(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm motion-safe:animate-fade-in" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-xs flex-col border-r border-navy-700 bg-navy-900 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)] shadow-2xl motion-safe:animate-drawer-in"
        >
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Navegação do Gestock</DialogPrimitive.Description>

          <div className="flex items-center justify-between px-4 py-4">
            <Logo />
            <DialogPrimitive.Close className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-navy-800 hover:text-white" aria-label="Fechar menu">
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>

          {/* Quem está logado e onde */}
          <button
            type="button"
            onClick={() => {
              close();
              onSwitchTenant();
            }}
            className="mx-3 mb-4 flex items-center gap-3 rounded-2xl border border-navy-700 bg-gradient-to-br from-navy-800 to-navy-900 p-3 text-left transition-colors hover:border-accent/50"
          >
            <Avatar name={session?.user.name} className="size-10 text-sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{session?.user.name}</span>
              <span className="block truncate text-xs text-muted">
                {session && ROLE_LABEL[session.tenant.role]} · {session?.tenant.name}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted" aria-label="Trocar de estabelecimento" />
          </button>

          <nav aria-label="Menu" className="flex-1 overflow-y-auto px-3 pb-4">
            <NavGroups groups={groups} onNavigate={close} />
          </nav>

          <div className="flex flex-col gap-1 border-t border-navy-700 p-3">
            <InstallButton size="md" className="w-full" onDone={close} />
            <button
              type="button"
              onClick={() => logout()}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-danger hover:bg-danger/10"
            >
              <LogOut className="size-[18px]" aria-hidden /> Sair
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
