import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { LenderBoardSkeleton } from '@/src/components/consultation/lender-board';
import { LiveConsultation } from '@/src/components/consultation/live-consultation';
import { copy } from '@/src/copy/pt-BR';
import { LENDERS } from '@/src/lenders/registry';
import { getConfig } from '@/src/server/config';
import { readConsultationSnapshot } from '@/src/server/snapshot';

export const metadata: Metadata = { title: copy.consultation.title };

/**
 * Static shell (frame + four "Consultando" rows) prerendered; the snapshot streams in per request.
 * No generateStaticParams: ids only exist at runtime, so the route is rendered on every request.
 */
export default function ConsultationPage({ params }: PageProps<'/consultations/[id]'>) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 md:py-16">
      <Suspense fallback={<ConsultationSkeleton />}>
        <ConsultationContent params={params} />
      </Suspense>
    </main>
  );
}

async function ConsultationContent({ params }: Pick<PageProps<'/consultations/[id]'>, 'params'>) {
  const { id } = await params; // request-time: the synchronous SQLite read below never runs at build
  const snapshot = readConsultationSnapshot(id);
  if (!snapshot) notFound();
  return <LiveConsultation initial={snapshot} timeZone={getConfig().timeZone} />;
}

function ConsultationSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="h-10 w-1/2 animate-pulse rounded-control bg-slate-soft" />
      <div className="h-3 w-full rounded-control bg-slate-soft" />
      <LenderBoardSkeleton names={LENDERS.map((lender) => lender.name)} />
    </div>
  );
}
