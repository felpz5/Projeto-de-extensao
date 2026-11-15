import { useEffect, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { registerSW } from 'virtual:pwa-register';

/**
 * PWA: registro do service worker, aviso de versão nova, instalação e status da conexão.
 * O que o service worker guarda está explicado no vite.config.ts.
 */

// ---------- Service worker + atualização ----------

let started = false;

/** Chamado uma vez no main.tsx. Em `npm run dev` o service worker fica desligado. */
export function startPwa() {
  if (started || !('serviceWorker' in navigator) || import.meta.env.DEV) return;
  started = true;

  const updateSW = registerSW({
    // Versão nova pronta: pergunta antes de recarregar (pode haver venda sendo digitada).
    onNeedRefresh() {
      toast('Nova versão do Gestock disponível', {
        description: 'Atualize quando terminar o que está fazendo.',
        duration: Infinity,
        action: { label: 'Atualizar', onClick: () => updateSW(true) },
      });
    },
    // Confere se há versão nova a cada hora (app aberto o dia todo no balcão).
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => registration.update().catch(() => undefined), 60 * 60_000);
    },
  });
}

// ---------- Manifesto só com sessão ----------

const MANIFEST_HREF = '/manifest.webmanifest';

/**
 * Coloca o <link rel="manifest"> enquanto a pessoa está logada e tira ao sair. Sem manifesto o
 * navegador não oferece "Instalar app" — nem o botão nosso, nem o ícone da barra de endereço.
 * Quem instala abre o app já logado: o app instalado usa o mesmo cookie de sessão do navegador
 * (Chrome/Edge no computador e no Android).
 */
export function useManifestWhileLoggedIn(loggedIn: boolean) {
  useEffect(() => {
    if (!loggedIn) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      link.href = MANIFEST_HREF;
      document.head.appendChild(link);
    }
    return () => {
      document.querySelector('link[rel="manifest"]')?.remove();
      deferredPrompt = null;
      notifyInstall();
    };
  }, [loggedIn]);
}

// ---------- Instalação ("Adicionar à tela inicial") ----------

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const notifyInstall = () => installListeners.forEach((l) => l());

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPhone/iPad no Safari: não existe botão automático, só "Compartilhar → Tela de Início". */
const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

if (typeof window !== 'undefined') {
  // Escuta desde o carregamento do módulo: o evento pode chegar antes de a tela montar.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // mostramos o nosso botão em vez da barra do navegador
    deferredPrompt = e as BeforeInstallPromptEvent;
    notifyInstall();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notifyInstall();
    toast.success('Gestock instalado! Abra pelo ícone na tela inicial.');
  });
}

export type InstallState = 'installed' | 'available' | 'ios' | 'unavailable';

function installState(): InstallState {
  if (isStandalone()) return 'installed';
  if (deferredPrompt) return 'available';
  if (isIos()) return 'ios';
  return 'unavailable';
}

/** Estado da instalação e a ação de instalar (abre o diálogo do navegador). */
export function useInstall() {
  const state = useSyncExternalStore(
    (cb) => {
      installListeners.add(cb);
      return () => installListeners.delete(cb);
    },
    installState,
    () => 'unavailable' as InstallState,
  );

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null; // o evento só pode ser usado uma vez
    notifyInstall();
    return outcome === 'accepted';
  };

  return { state, install };
}

// ---------- Conexão ----------

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
