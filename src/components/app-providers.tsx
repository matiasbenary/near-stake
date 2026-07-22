'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NearProvider } from 'near-connect-hooks';
import { ReactNode, useState } from 'react';
import { NetworkId, RpcUrls } from '@/config';

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <NearProvider config={{ network: NetworkId, providers: RpcUrls }}>
        {children}
      </NearProvider>
    </QueryClientProvider>
  );
}
