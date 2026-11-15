import type { Session } from '@/lib/types';

/**
 * Cliente HTTP da API.
 *
 * - Caminho relativo (/api/...): no desenvolvimento o Vite repassa para o back-end e no Docker o
 *   nginx faz o mesmo. Front e API ficam na mesma origem, então o cookie httpOnly do refresh
 *   token vai junto sem precisar de CORS.
 * - O access token (15 min) fica só em memória, nunca no localStorage (protege contra XSS).
 * - Resposta 401 → tenta renovar a sessão UMA vez com o cookie e repete a requisição.
 */
export const API_URL = '/api';

export interface ApiIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly issues: ApiIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
  /** false = rota pública (login, cadastro): não manda token nem tenta renovar. */
  auth?: boolean;
  /**
   * false = um 401 desta rota é regra de negócio, não sessão expirada
   * (ex.: "Senha atual incorreta" na troca de senha). Não renova nem repete.
   */
  refreshOn401?: boolean;
  signal?: AbortSignal;
}

// ---------- Sessão em memória ----------

let accessToken: string | null = null;
let listener: ((session: Session | null) => void) | null = null;

/** O AuthProvider se registra aqui para saber quando a sessão muda (renovação, expiração). */
export function onSessionChange(fn: (session: Session | null) => void) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function setSession(session: Session | null) {
  accessToken = session?.accessToken ?? null;
  listener?.(session);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));


/**
 * Renova a sessão com o cookie do refresh token. Requisições simultâneas compartilham a mesma
 * renovação. Se outra aba renovou no mesmo instante, a API responde 409 REFRESH_RACE: basta
 * esperar um pouco e tentar de novo (o cookie novo já foi gravado).
 */
export async function refreshSession(): Promise<Session | null> {
  return (await renew()).session;
}

/**
 * Resultado da renovação:
 * - session: renovou;
 * - session null + transient false: a sessão acabou de verdade (401/403) → login;
 * - session null + transient true: sem internet, 429 ou API fora do ar → tentar de novo depois,
 *   sem deslogar (a sessão no cookie continua válida).
 */
export interface RenewResult {
  session: Session | null;
  transient: boolean;
}

let renewing: Promise<RenewResult> | null = null;

export function renew(): Promise<RenewResult> {
  renewing ??= (async (): Promise<RenewResult> => {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (res.ok) {
          const session = (await res.json()) as Session;
          setSession(session);
          return { session, transient: false };
        }
        if (res.status === 409) {
          await sleep(250 * (attempt + 1));
          continue;
        }
        // Só 401/403 significam "sessão acabou". 429, 5xx ou proxy fora do ar (API reiniciando)
        // são passageiros: não desloga.
        if (res.status === 401 || res.status === 403) {
          setSession(null);
          return { session: null, transient: false };
        }
        return { session: null, transient: true };
      }
      return { session: null, transient: true };
    } catch {
      // Sem rede (ex.: app instalado aberto sem internet).
      return { session: null, transient: true };
    } finally {
      renewing = null;
    }
  })();
  return renewing;
}

// ---------- Requisição ----------

function buildUrl(path: string, query?: Query) {
  const url = `${API_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function toError(res: Response): Promise<ApiError> {
  let body: { message?: string; code?: string; issues?: ApiIssue[] } = {};
  try {
    body = await res.json();
  } catch {
    // corpo vazio ou não-JSON (ex.: proxy fora do ar)
  }
  const fallback =
    res.status >= 500
      ? 'O servidor está indisponível no momento. Tente de novo em instantes.'
      : `Erro ${res.status}`;
  return new ApiError(body.message ?? fallback, res.status, body.code, body.issues ?? []);
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true, refreshOn401 = true, signal } = options;

  const send = () => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal,
    });
  };

  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && auth && refreshOn401) {
      const renewed = await refreshSession();
      if (renewed) res = await send();
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('Sem conexão com o servidor. Verifique a internet.', 0);
  }

  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Mensagem amigável para qualquer erro (usada nos toasts). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.issues.length) return err.issues[0].message;
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return 'Algo deu errado.';
}
