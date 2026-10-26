import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { copy } from '@/src/copy/pt-BR';
import './globals.css';

export const metadata: Metadata = {
  title: { template: `%s · ${copy.app.name}`, default: copy.app.name },
  description: copy.app.description,
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  colorScheme: 'light',
};

// Geist ships inside the `geist` package (next/font/local underneath): no network request at build time.
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
