import { useCallback, useState, useSyncExternalStore } from 'react';

/** true/false conforme uma media query (ex.: '(min-width: 1024px)'), atualizando ao redimensionar. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Estado que sobrevive ao recarregar (preferência de tela, ex.: menu recolhido).
 * localStorage pode falhar (aba anônima, armazenamento bloqueado): aí vira estado comum.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(v));
        } catch {
          // sem armazenamento: só não lembra na próxima vez
        }
        return v;
      });
    },
    [key],
  );
  return [value, set] as const;
}
