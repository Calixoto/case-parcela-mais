'use client';

import { GeistSans } from 'geist/font/sans';
import { Button } from '@/src/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/src/components/ui/empty';
import { copy } from '@/src/copy/pt-BR';
import './globals.css';

/** Last resort when the root layout itself fails: must render its own <html> and <body>. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <html lang="pt-BR" className={`${GeistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <main className="mx-auto w-full max-w-xl px-4 py-10 md:py-16">
          <Empty>
            <EmptyHeader role="alert">
              {/* EmptyTitle renders a div; the h1 keeps the page heading. */}
              <EmptyTitle className="text-2xl font-semibold tracking-tight">
                <h1>{copy.errors.generic}</h1>
              </EmptyTitle>
              {digest ? <EmptyDescription>{copy.errors.supportCode(digest)}</EmptyDescription> : null}
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" onClick={() => retry()}>
                {copy.actions.retry}
              </Button>
            </EmptyContent>
          </Empty>
        </main>
      </body>
    </html>
  );
}
