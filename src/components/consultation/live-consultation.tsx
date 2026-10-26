'use client';

import Link from 'next/link';
import { copy } from '@/src/copy/pt-BR';
import { formatBRL } from '@/src/domain/money';
import type { ConsultationSnapshot } from '@/src/domain/types';
import { formatTime } from '../format';
import { DeadlineRail } from './deadline-rail';
import { LenderBoard } from './lender-board';
import { NoApprovalPanel } from './no-approval-panel';
import { OffersTable } from './offers-table';
import { useConsultationSnapshot } from './use-consultation-snapshot';

type Props = { readonly initial: ConsultationSnapshot; readonly timeZone: string };

/** Server-rendered first paint, then polling keeps the board and the offers current until the consultation closes. */
export function LiveConsultation({ initial, timeZone }: Props) {
  const { snapshot, stalled, retry } = useConsultationSnapshot(initial);
  const querying = snapshot.status === 'querying';

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-display text-3xl">{snapshot.patient.fullName}</h1>
          <p className="text-sm text-ink-muted">{copy.consultation.startedAt(formatTime(snapshot.startedAt, timeZone))}</p>
        </div>
        <p className="text-ink-muted">
          {copy.consultation.treatment} <span className="font-display text-xl text-ink">{formatBRL(snapshot.treatmentAmountCents)}</span>
        </p>
      </header>

      <DeadlineRail
        status={snapshot.status}
        startedAt={snapshot.startedAt}
        deadlineAt={snapshot.deadlineAt}
        finishedAt={snapshot.finishedAt}
        finishReason={snapshot.finishReason}
        serverNow={snapshot.serverNow}
        timeoutMs={snapshot.timeoutMs}
      />

      {stalled ? (
        <p role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-brick-soft px-4 py-3 text-brick">
          {copy.errors.pollFailed}
          <button type="button" onClick={retry} className="rounded-control border border-brick px-3 py-1 text-sm">
            {copy.actions.retry}
          </button>
        </p>
      ) : null}

      <LenderBoard lenders={snapshot.lenders} treatmentAmountCents={snapshot.treatmentAmountCents} timeoutMs={snapshot.timeoutMs} />

      {snapshot.choice ? (
        <p role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-mint-soft px-4 py-3">
          {copy.consultation.chosenBanner}
          <Link href={`/consultations/${snapshot.id}/confirmation`} className="font-medium text-mint underline">
            {copy.actions.seeConfirmation}
          </Link>
        </p>
      ) : null}

      {snapshot.summary.outcome === 'none_approved' ? (
        <NoApprovalPanel summary={snapshot.summary} />
      ) : (
        <OffersTable consultationId={snapshot.id} offers={snapshot.offers} choice={snapshot.choice} querying={querying} />
      )}
    </div>
  );
}
