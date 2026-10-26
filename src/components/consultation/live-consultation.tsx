'use client';

import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/src/components/ui/alert';
import { Button } from '@/src/components/ui/button';
import { Separator } from '@/src/components/ui/separator';
import { copy } from '@/src/copy/pt-BR';
import { todayIso } from '@/src/domain/age';
import { formatBRL } from '@/src/domain/money';
import type { ConsultationSnapshot } from '@/src/domain/types';
import { formatDate, formatTime } from '../format';
import { LenderBoard } from './lender-board';
import { NoApprovalPanel } from './no-approval-panel';
import { OffersTable } from './offers-table';
import { useConsultationSnapshot } from './use-consultation-snapshot';

type Props = { readonly initial: ConsultationSnapshot; readonly timeZone: string };

/** Server-rendered first paint, then polling keeps the board and the offers current until the consultation closes. */
export function LiveConsultation({ initial, timeZone }: Props) {
  const { snapshot, stalled, retry } = useConsultationSnapshot(initial);
  const querying = snapshot.status === 'querying';
  // "hoje" only when it is: the page is a permalink ("Retomar consulta"). Server clock on both sides, so the HTML never mismatches.
  const sameDay = todayIso(timeZone, new Date(snapshot.startedAt)) === todayIso(timeZone, new Date(snapshot.serverNow));
  const startedLine = sameDay
    ? copy.consultation.startedAt(formatTime(snapshot.startedAt, timeZone))
    : copy.consultation.startedOn(formatDate(snapshot.startedAt, timeZone), formatTime(snapshot.startedAt, timeZone));
  const finishedLine = querying
    ? ''
    : `${copy.consultation.finished}. ${snapshot.summary.outcome === 'none_approved' ? copy.offers.noneTitle : copy.offers.title(snapshot.offers.length)}.`;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{snapshot.patient.fullName}</h1>
          <p className="text-sm text-muted-foreground">{startedLine}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {copy.consultation.treatment} <span className="font-medium text-foreground tabular-nums">{formatBRL(snapshot.treatmentAmountCents)}</span>
        </p>
      </header>

      <Separator />

      {/* Always in the DOM, so the end of the consultation is announced to screen readers. */}
      <p role="status" className="sr-only">
        {finishedLine}
      </p>

      {stalled ? (
        <Alert variant="destructive">
          <AlertTitle>{copy.errors.pollFailed}</AlertTitle>
          <AlertDescription>
            <Button size="sm" variant="outline" onClick={retry}>
              {copy.actions.retry}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <LenderBoard lenders={snapshot.lenders} treatmentAmountCents={snapshot.treatmentAmountCents} timeoutMs={snapshot.timeoutMs} />

      {snapshot.choice ? (
        <Alert role="status">
          <AlertTitle>{copy.consultation.chosenBanner}</AlertTitle>
          <AlertDescription>
            <Link href={`/consultations/${snapshot.id}/confirmation`}>{copy.actions.seeConfirmation}</Link>
          </AlertDescription>
        </Alert>
      ) : null}

      {snapshot.summary.outcome === 'none_approved' ? (
        <NoApprovalPanel summary={snapshot.summary} />
      ) : (
        <OffersTable consultationId={snapshot.id} offers={snapshot.offers} choice={snapshot.choice} querying={querying} />
      )}
    </div>
  );
}
