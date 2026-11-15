import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { router } from '@/app/router';
import { OfflineBanner } from '@/components/pwa';
import { AuthProvider } from '@/features/auth/auth-context';
import { ApiError } from '@/lib/api';
import { startPwa } from '@/lib/pwa';
import './index.css';

startPwa();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // Erro 4xx (sem permissão, não encontrado) não melhora tentando de novo.
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <OfflineBanner />
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
      <Toaster
        theme="dark"
        position="top-center"
        richColors
        closeButton
        toastOptions={{ style: { fontFamily: 'Inter, system-ui, sans-serif' } }}
      />
    </QueryClientProvider>
  </StrictMode>,
);
