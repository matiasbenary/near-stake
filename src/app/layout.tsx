'use client';
import '@/app/globals.css';

import { Inter, JetBrains_Mono } from 'next/font/google';
import { Navigation } from '@/components/navigation';
import { NearProvider } from 'near-connect-hooks';
import { ReactNode } from 'react';
import { NetworkId, RpcUrls } from '@/config';

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <NearProvider config={{ network: NetworkId, providers: RpcUrls }}>
          <Navigation />
          {children}
        </NearProvider>
      </body>
    </html>
  );
}
