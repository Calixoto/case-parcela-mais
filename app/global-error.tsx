'use client';

import './globals.css';

/** Last resort when the root layout itself fails: must render its own <html> and <body>. */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <html lang="pt-BR">
      <body className="flex min-h-full flex-col">
        <main role="alert" className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-16">
          <h1 className="text-3xl font-semibold">Algo deu errado.</h1>
          {digest ? <p className="text-sm">Código: {digest}</p> : null}
          <button type="button" onClick={() => retry()} className="inline-flex h-12 w-fit items-center rounded-control bg-mint px-5 font-medium text-enamel">
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
