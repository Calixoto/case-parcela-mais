import { getDb, type Database } from '@/src/db/client';
import { maskCpf } from '@/src/domain/cpf';
import { buildOffers } from '@/src/domain/offers';
import { summarizeConsultation } from '@/src/domain/summarize';
import type { ConsultationSnapshot } from '@/src/domain/types';
import { getConfig } from './config';
import { finalizeConsultation, getChosenOffer, getConsultation, getLenderResults } from './repositories';

export type SnapshotOptions = { readonly now: number; readonly pollIntervalMs: number };

/**
 * The one read model used by server rendering, polling and the JSON API. Reading reconciles:
 * a consultation still `querying` after its deadline is closed here, so a restarted server never
 * leaves a screen stuck on "consultando" (docs/02, trap 4).
 */
export function getConsultationSnapshot(db: Database, consultationId: string, options: SnapshotOptions): ConsultationSnapshot | null {
  let consultation = getConsultation(db, consultationId);
  if (!consultation) return null;

  if (consultation.status === 'querying' && options.now > consultation.deadlineAt) {
    finalizeConsultation(db, consultationId, { finishedAt: consultation.deadlineAt, finishReason: 'reconciled', timeoutMs: consultation.timeoutMs });
    consultation = getConsultation(db, consultationId) ?? consultation;
  }

  const lenders = getLenderResults(db, consultationId);
  return {
    id: consultation.id,
    status: consultation.status,
    finishReason: consultation.finishReason,
    startedAt: consultation.startedAt,
    deadlineAt: consultation.deadlineAt,
    finishedAt: consultation.finishedAt,
    serverNow: options.now,
    timeoutMs: consultation.timeoutMs,
    pollIntervalMs: options.pollIntervalMs,
    forcedScenario: consultation.forcedScenario,
    treatmentAmountCents: consultation.treatmentAmountCents,
    patient: { fullName: consultation.fullName, cpfMasked: maskCpf(consultation.cpf), ageYears: consultation.patientAgeYears },
    lenders,
    offers: buildOffers(lenders, consultation.treatmentAmountCents),
    summary: summarizeConsultation(lenders, consultation.treatmentAmountCents),
    choice: getChosenOffer(db, consultationId),
  };
}

/** Production reader used by pages and the API: real database, real clock, configured poll interval. */
export function readConsultationSnapshot(consultationId: string): ConsultationSnapshot | null {
  return getConsultationSnapshot(getDb(), consultationId, { now: Date.now(), pollIntervalMs: getConfig().pollIntervalMs });
}
