import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, onSessionChange, renew, setSession } from '@/lib/api';
import type { Role, Session } from '@/lib/types';

/** offline = ainda não deu para confirmar a sessão (sem internet/API fora); tenta de novo sozinho. */
type Status = 'loading' | 'offline' | 'anonymous' | 'authenticated';

interface LoginInput {
  email: string;
  password: string;
  tenantId?: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  establishmentName: string;
  segment?: string;
  timezone?: string;
}

interface AuthValue {
  status: Status;
  session: Session | null;
  role: Role | null;
  /** OWNER ou MANAGER: relatórios, previsão, cadastros, ajustes de estoque. */
  isManager: boolean;
  isOwner: boolean;
  login(input: LoginInput): Promise<Session>;
  register(input: RegisterInput): Promise<Session>;
  logout(): Promise<void>;
  switchTenant(tenantId: string): Promise<void>;
  /** Para respostas que já trazem uma sessão nova (ex.: troca de senha). */
  applySession(session: Session): void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [session, setLocal] = useState<Session | null>(null);

  // A sessão pode mudar fora do React (renovação automática ou expiração no lib/api).
  useEffect(
    () =>
      onSessionChange((s) => {
        setLocal(s);
        setStatus(s ? 'authenticated' : 'anonymous');
        if (!s) queryClient.clear();
      }),
    [queryClient],
  );

  // Ao abrir o app: tenta recuperar a sessão pelo cookie do refresh token.
  // Sem internet ou API fora do ar NÃO é "deslogado": espera e tenta de novo (o app instalado
  // pode abrir offline, e a sessão no cookie continua válida).
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const attempt = async () => {
      const { session, transient } = await renew();
      if (cancelled || session) return;
      if (!transient) {
        setStatus('anonymous');
        return;
      }
      setStatus('offline');
      timer = setTimeout(attempt, 15_000);
    };
    const onOnline = () => {
      clearTimeout(timer);
      attempt();
    };

    attempt();
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  const applySession = useCallback((s: Session) => setSession(s), []);

  const login = useCallback(async (input: LoginInput) => {
    const s = await api<Session>('/auth/login', { method: 'POST', body: input, auth: false });
    setSession(s);
    return s;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const s = await api<Session>('/auth/register', { method: 'POST', body: input, auth: false });
    setSession(s);
    return s;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', auth: false });
    } finally {
      setSession(null);
    }
  }, []);

  const switchTenant = useCallback(
    async (tenantId: string) => {
      const s = await api<Session>('/auth/switch-tenant', { method: 'POST', body: { tenantId } });
      // Dados de outro estabelecimento não podem aparecer nem por um instante.
      queryClient.clear();
      setSession(s);
    },
    [queryClient],
  );

  const value = useMemo<AuthValue>(() => {
    const role = session?.tenant.role ?? null;
    return {
      status,
      session,
      role,
      isManager: role === 'OWNER' || role === 'MANAGER',
      isOwner: role === 'OWNER',
      login,
      register,
      logout,
      switchTenant,
      applySession,
    };
  }, [status, session, login, register, logout, switchTenant, applySession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
