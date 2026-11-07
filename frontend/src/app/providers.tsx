import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ToastProvider } from '../components/ui';
import { ApiError } from '../lib/api';

function crearQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (intentos, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return intentos < 1;
        },
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: { retry: false },
    },
  });
}

// La sesión (AuthProvider) vive dentro del router porque necesita navegar.
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(crearQueryClient);
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
