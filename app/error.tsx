'use client';

import { useEffect } from 'react';
import { Button } from '@/src/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/src/components/ui/empty';
import { copy } from '@/src/copy/pt-BR';

/** Unexpected errors of a route segment. In production the message is generic; the digest links to the server log. */
export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
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
  );
}
