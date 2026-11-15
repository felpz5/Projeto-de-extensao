import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const THEME = '#0A1628';

// Em desenvolvimento (`npm run dev`), /api vai para o back-end local.
// No Docker, quem faz esse papel é o nginx (ver nginx.conf).
export default defineConfig({
  plugins: [
    react(),
    /**
     * PWA: o Gestock pode ser instalado no celular/computador e abre como app.
     * - O service worker guarda só a "casca" do app (HTML, JS, CSS, ícones, fontes):
     *   abre rápido e mostra a tela mesmo sem internet.
     * - NUNCA guarda respostas da API (/api): são dados da loja, mudam o tempo todo e um
     *   aparelho compartilhado não pode mostrar dados de outra sessão.
     * - registerType 'prompt': versão nova só entra quando a pessoa clica em "Atualizar"
     *   (recarregar sozinho poderia apagar uma venda sendo digitada). Ver lib/pwa.ts.
     */
    VitePWA({
      registerType: 'prompt',
      injectRegister: false, // registrado em lib/pwa.ts
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Gestock — Estoque e previsão de demanda',
        short_name: 'Gestock',
        description:
          'Registre vendas, controle o estoque e saiba o que comprar antes de faltar.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        background_color: THEME,
        theme_color: THEME,
        categories: ['business', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Atalhos ao segurar o ícone (Android) ou clicar com o botão direito (computador).
        shortcuts: [
          {
            name: 'Nova venda',
            short_name: 'Vender',
            url: '/vender',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Registrar entrada de mercadoria',
            short_name: 'Entrada',
            url: '/estoque?entrada=1',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Estoque',
            short_name: 'Estoque',
            url: '/estoque',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Qualquer rota do app (ex.: /estoque) abre o index.html do cache; /api nunca.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        // O pacote de gráficos passa de 2 MB (padrão) só sem minificar; folga para não sumir do cache.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            // CSS da fonte Inter
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            // arquivos da fonte (não mudam)
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
    /**
     * O app só pode ser instalado por quem está logado: o <link rel="manifest"> NÃO vai no HTML
     * (sem ele o navegador nem oferece a instalação). Ele é adicionado pelo app depois do login
     * (lib/pwa.ts → useManifestWhileLoggedIn) e removido ao sair.
     */
    {
      name: 'gestock-manifest-only-when-logged-in',
      enforce: 'post',
      transformIndexHtml: {
        order: 'post',
        handler: (html: string) => html.replace(/\s*<link rel="manifest"[^>]*>/g, ''),
      },
    },
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.VITE_API_PROXY ?? 'http://localhost:3333',
    },
  },
  build: {
    // Sem manualChunks de propósito: forçar o Recharts num pacote próprio levava junto
    // bibliotecas usadas pelo app inteiro (clsx...) e o pacote de gráficos passava a ser
    // pré-carregado em todas as páginas. Como só o painel e a previsão importam
    // components/charts.tsx (e as telas são lazy), o Vite já separa sozinho.
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
