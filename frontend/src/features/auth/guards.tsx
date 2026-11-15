import { WifiOff } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { Logo } from '@/components/layout/logo';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/feedback';
import { useAuth } from './auth-context';

/** Só para quem está logado. Senha provisória → obriga a troca antes de qualquer tela. */
export function RequireAuth() {
  const { status, session } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'offline') return <WaitingConnection />;
  if (status === 'anonymous') {
    // Quem chega pelo endereço principal sem estar logado conhece o sistema primeiro;
    // links diretos (ex.: /estoque) vão para o login e voltam para onde estavam.
    if (location.pathname === '/') return <Navigate to="/apresentacao" replace />;
    return (
      <Navigate to="/entrar" replace state={{ from: location.pathname + location.search }} />
    );
  }
  if (session?.user.mustChangePassword && location.pathname !== '/trocar-senha') {
    return <Navigate to="/trocar-senha" replace />;
  }
  return <Outlet />;
}

/**
 * Login e cadastro: quem já está logado vai para o app — de volta à página que tentou abrir
 * antes do login, se houver (o RequireAuth guarda em state.from).
 */
export function GuestOnly() {
  const { status, session } = useAuth();
  const from = (useLocation().state as { from?: string } | null)?.from;
  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'authenticated') {
    const to = session?.user.mustChangePassword ? '/trocar-senha' : (from ?? '/');
    return <Navigate to={to} replace />;
  }
  return <Outlet />;
}

/** Telas de gerente/dono (a API também bloqueia: isto só evita mostrar o que daria 403). */
export function RequireManager() {
  const { isManager } = useAuth();
  return isManager ? <Outlet /> : <Navigate to="/" replace />;
}

export function RequireOwner() {
  const { isOwner } = useAuth();
  return isOwner ? <Outlet /> : <Navigate to="/" replace />;
}

/** App aberto sem internet: a sessão não foi confirmada ainda, mas também não acabou. */
function WaitingConnection() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo size="lg" className="text-2xl" />
      <WifiOff className="mt-4 size-8 text-warning" aria-hidden />
      <p className="text-lg font-semibold">Sem conexão com o servidor</p>
      <p className="max-w-sm text-sm text-muted">
        Você continua conectado à sua conta. Assim que a internet voltar, o Gestock abre sozinho.
      </p>
      <Button variant="secondary" onClick={() => window.location.reload()}>
        Tentar agora
      </Button>
    </div>
  );
}

function FullScreenSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner />
    </div>
  );
}
