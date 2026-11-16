import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Link } from 'react-router';
import { AppLayout } from '@/components/layout/app-layout';
import { buttonVariants } from '@/components/ui/button';
import { Spinner } from '@/components/ui/feedback';
import { GuestOnly, RequireAuth, RequireManager } from '@/features/auth/guards';
import { LoginPage } from '@/features/auth/login-page';
import { RegisterPage } from '@/features/auth/register-page';

/** Cada tela vira um arquivo separado no build: o celular baixa só o que abre. */
function page<T, K extends keyof T>(load: () => Promise<T>, name: K) {
  const Component = lazy(() => load().then((m) => ({ default: m[name] as ComponentType })));
  return (
    <Suspense fallback={<Spinner />}>
      <Component />
    </Suspense>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <p className="text-5xl font-bold text-accent">404</p>
      <p className="text-muted">Esta página não existe.</p>
      <Link to="/" className={buttonVariants({ variant: 'secondary' })}>
        Voltar ao início
      </Link>
    </div>
  );
}

export const router = createBrowserRouter([
  // Página de apresentação: pública (logado também pode ver; o botão leva ao painel).
  {
    path: '/apresentacao',
    element: page(() => import('@/features/landing/landing-page'), 'LandingPage'),
  },
  {
    element: <GuestOnly />,
    children: [
      { path: '/entrar', element: <LoginPage /> },
      { path: '/cadastro', element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/trocar-senha',
        element: page(() => import('@/features/auth/change-password-page'), 'ChangePasswordPage'),
      },
      {
        element: <AppLayout />,
        children: [
          { index: true, element: page(() => import('@/features/dashboard/dashboard-page'), 'DashboardPage') },
          { path: 'vender', element: page(() => import('@/features/sales/new-sale-page'), 'NewSalePage') },
          { path: 'caixa', element: page(() => import('@/features/sales/cash-page'), 'CashPage') },
          { path: 'estoque', element: page(() => import('@/features/inventory/stock-page'), 'StockPage') },
          {
            path: 'movimentacoes',
            element: page(() => import('@/features/inventory/movements-page'), 'MovementsPage'),
          },
          {
            path: 'ingredientes',
            element: page(() => import('@/features/ingredients/ingredients-page'), 'IngredientsPage'),
          },
          { path: 'produtos', element: page(() => import('@/features/products/products-page'), 'ProductsPage') },
          {
            path: 'produtos/:id',
            element: page(() => import('@/features/products/product-detail-page'), 'ProductDetailPage'),
          },
          {
            path: 'configuracoes',
            element: page(() => import('@/features/settings/settings-page'), 'SettingsPage'),
          },
          {
            element: <RequireManager />,
            children: [
              { path: 'vendas', element: page(() => import('@/features/sales/sales-page'), 'SalesPage') },
              {
                path: 'vendas/importar',
                element: page(() => import('@/features/sales/import-page'), 'ImportPage'),
              },
              {
                path: 'estoque/contagem',
                element: page(() => import('@/features/inventory/count-page'), 'CountPage'),
              },
              {
                path: 'previsao',
                element: page(() => import('@/features/forecast/forecast-page'), 'ForecastPage'),
              },
              {
                path: 'relatorios',
                element: page(() => import('@/features/reports/reports-page'), 'ReportsPage'),
              },
              {
                path: 'lojas',
                element: page(() => import('@/features/stores/stores-page'), 'StoresPage'),
              },
            ],
          },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);
