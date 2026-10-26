import { after } from 'next/server';
import { todayIso } from '@/src/domain/age';
import { createConsultationInputSchema, fieldErrorsOf } from '@/src/domain/registration-schema';
import { copy } from '@/src/copy/pt-BR';
import { getDb } from '@/src/db/client';
import { LENDERS } from '@/src/lenders/registry';
import { parseOverrides } from '@/src/lenders/scenarios';
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

  let overrides;
  try {
    overrides = parseOverrides(parsed.data.overrides);
  } catch (error) {
    return apiError('validation_failed', error instanceof Error ? error.message : copy.api.validationFailed, 422);
  }

  const { id, deadlineAt } = createConsultation(
    getDb(),
    { patient: parsed.data.patient, treatmentAmountCents: parsed.data.treatmentAmountCents, scenario: parsed.data.scenario ?? null },
    { now: Date.now(), todayIso: today, deadlineMs: config.consultationDeadlineMs, lenders: LENDERS },
  );
  after(() => startConsultationRun(id, overrides));
  return json({ consultationId: id, deadlineAt }, 201);
}
