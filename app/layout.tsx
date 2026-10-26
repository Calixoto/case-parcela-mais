import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { copy } from '@/src/copy/pt-BR';
import './globals.css';

// Bricolage Grotesque, variable (wght 200–800, wdth 75–100, opsz 12–96), latin subset, self-hosted:
// no network access needed at build time (Docker) and no third-party request from the browser.
const bricolage = localFont({
  src: '../fonts/bricolage-grotesque-latin.woff2',
  weight: '200 800',
  style: 'normal',
  display: 'swap',
  variable: '--font-bricolage',
  declarations: [{ prop: 'font-stretch', value: '75% 100%' }],
});

export const metadata: Metadata = {
  title: { template: `%s · ${copy.app.name}`, default: copy.app.name },
  description: copy.app.description,
};

export const viewport: Viewport = {
  themeColor: '#f3f6f5',
  colorScheme: 'light',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className={`${bricolage.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
