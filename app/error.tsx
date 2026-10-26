'use client';

import { useEffect } from 'react';
import { copy } from '@/src/copy/pt-BR';

/** Unexpected errors of a route segment. In production the message is generic; the digest links to the server log. */
export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <main role="alert" className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-16">
      <h1 className="font-display text-3xl">{copy.errors.generic}</h1>
      {digest ? <p className="text-sm text-ink-muted">{copy.errors.supportCode(digest)}</p> : null}
      <button type="button" onClick={() => retry()} className="inline-flex h-12 w-fit items-center rounded-control bg-mint px-5 font-medium text-enamel">
        {copy.actions.retry}
      </button>
    </main>
  );
}
