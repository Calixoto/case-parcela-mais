import { after } from 'next/server';
import { todayIso } from '@/src/domain/age';
import { createConsultationInputSchema, fieldErrorsOf } from '@/src/domain/registration-schema';
import { copy } from '@/src/copy/pt-BR';
import { getDb } from '@/src/db/client';
import { LENDERS } from '@/src/lenders/registry';
import { getConfig } from '@/src/server/config';
import { createConsultation } from '@/src/server/consultations.service';
import { apiError, json } from '@/src/server/http';
import { startConsultationRun } from '@/src/server/start-run';

/**
 * Creates the consultation and answers at once with its id; the four lenders are queried after the
 * response (`after()`), on this persistent Node server. The browser follows with GET polling.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_json', copy.api.invalidJson, 400);
  }

  const config = getConfig();
  const today = todayIso(config.timeZone);
  const parsed = createConsultationInputSchema(today).safeParse(payload);
  if (!parsed.success) return apiError('validation_failed', copy.api.validationFailed, 422, fieldErrorsOf(parsed.error));

  let created: { id: string; deadlineAt: number };
  try {
    created = createConsultation(
      getDb(),
      { patient: parsed.data.patient, treatmentAmountCents: parsed.data.treatmentAmountCents, scenario: parsed.data.scenario ?? null },
      { now: Date.now(), todayIso: today, deadlineMs: config.consultationDeadlineMs, lenders: LENDERS },
    );
  } catch (error) {
    console.error(JSON.stringify({ event: 'consultation_create_failed', error: error instanceof Error ? error.message : String(error) }));
    return apiError('internal_error', copy.api.internalError, 500);
  }
  after(() => startConsultationRun(created.id));
  return json({ consultationId: created.id, deadlineAt: created.deadlineAt }, 201);
}
