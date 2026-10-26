import type { Database } from '@/src/db/client';
import { ageInYears } from '@/src/domain/age';
import type { ScenarioId } from '@/src/domain/types';
import type { LenderConfig } from '@/src/lenders/registry';
import { insertConsultation, insertQueryingResults, upsertPatient, withTransaction, type PatientInput } from './repositories';

export type CreateConsultationInput = {
  readonly patient: PatientInput;
  readonly treatmentAmountCents: number;
  readonly scenario: ScenarioId | null;
};

export type CreateConsultationOptions = {
  readonly now: number;
  readonly todayIso: string;
  readonly deadlineMs: number;
  readonly lenders: readonly LenderConfig[];
};

/**
 * Creates (or refreshes) the patient, the consultation and one `querying` row per lender, atomically.
 * The deadline is fixed here, before any lender is called, and the 4 statuses exist before the first poll.
 */
export function createConsultation(db: Database, input: CreateConsultationInput, options: CreateConsultationOptions): { id: string; deadlineAt: number } {
  const id = crypto.randomUUID();
  const deadlineAt = options.now + options.deadlineMs;
  const patientAgeYears = ageInYears(input.patient.birthDate, options.todayIso);
  withTransaction(db, () => {
    const patientId = upsertPatient(db, input.patient, options.now);
    insertConsultation(db, {
      id,
      patientId,
      treatmentAmountCents: input.treatmentAmountCents,
      patientAgeYears,
      startedAt: options.now,
      deadlineAt,
      timeoutMs: options.deadlineMs,
      forcedScenario: input.scenario,
    });
    insertQueryingResults(db, id, options.lenders, options.now);
  });
  return { id, deadlineAt };
}
