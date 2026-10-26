import type { Metadata } from 'next';
import { io } from 'next/cache';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { LenderBoardSkeleton } from '@/src/components/consultation/lender-board';
import { LiveConsultation } from '@/src/components/consultation/live-consultation';
import { Skeleton } from '@/src/components/ui/skeleton';
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
    <main className="mx-auto w-full max-w-3xl px-4 py-10 md:py-16">
      <Suspense fallback={<ConsultationSkeleton />}>
        <ConsultationContent params={params} />
      </Suspense>
    </main>
  );
}

async function ConsultationContent({ params }: Pick<PageProps<'/consultations/[id]'>, 'params'>) {
  const { id } = await params;
  await io(); // request-time clock + synchronous SQLite read: never part of the static shell
  const snapshot = readConsultationSnapshot(id);
  if (!snapshot) notFound();
  return <LiveConsultation initial={snapshot} timeZone={getConfig().timeZone} />;
}

/** Same blocks as LiveConsultation (header, rail, board) so the streamed content lands without a jump. */
function ConsultationSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <LenderBoardSkeleton names={LENDERS.map((lender) => lender.name)} />
    </div>
  );
}
