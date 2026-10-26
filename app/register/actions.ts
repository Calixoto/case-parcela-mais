'use server';

import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { copy } from '@/src/copy/pt-BR';
import { getDb } from '@/src/db/client';
import { todayIso } from '@/src/domain/age';
import {
  createPatientStepSchema,
  createRegistrationSchema,
  fieldErrorsOf,
  financingStepSchema,
  type FieldErrors,
  type RawDraft,
} from '@/src/domain/registration-schema';
import { REGISTRATION_STEPS, type RegistrationField, type StepSlug } from '@/src/domain/registration-steps';
import type { ScenarioId } from '@/src/domain/types';
import { LENDERS } from '@/src/lenders/registry';
import { isScenarioId } from '@/src/lenders/scenarios';
import { getConfig } from '@/src/server/config';
import { createConsultation } from '@/src/server/consultations.service';
import {
  clearDraft,
  clearLastConsultationId,
  clearRetryDraft,
  readDraft,
  readRetryDraft,
  writeDraft,
  writeLastConsultationId,
  writeRetryDraft,
} from '@/src/server/draft-cookie';
import { startConsultationRun } from '@/src/server/start-run';
import { HINTS, scenarioQuery, type Hint } from '@/src/url-state/parsers';

export type StepFormState = {
  readonly fieldErrors?: FieldErrors;
  readonly formError?: string;
  /** What was submitted, echoed back so the inputs keep the typed values after a failed validation. */
  readonly values?: RawDraft;
  readonly attempt: number;
};

/** Raw values are stored as typed; a pasted novel must not push the cookie past the 4 KB browser limit. */
const MAX_FIELD_LENGTH = 200;

const stepFields = (slug: StepSlug): readonly RegistrationField[] => REGISTRATION_STEPS.find((step) => step.slug === slug)!.fields;

function pickFields(formData: FormData, fields: readonly RegistrationField[]): RawDraft {
  const raw: Record<string, string> = {};
  for (const field of fields) {
    const value = formData.get(field);
    raw[field] = typeof value === 'string' ? value.slice(0, MAX_FIELD_LENGTH) : '';
  }
  return raw;
}

function scenarioFrom(formData: FormData): ScenarioId | null {
  const value = formData.get('scenario');
  return isScenarioId(value) ? value : null;
}

const isBack = (formData: FormData) => formData.get('intent') === 'back';

/** Step 1. "Voltar" goes home; "Continuar" validates, stores the raw values and moves on. */
export async function submitPatientStep(prev: StepFormState, formData: FormData): Promise<StepFormState> {
  const raw = pickFields(formData, stepFields('patient'));
  const query = scenarioQuery(scenarioFrom(formData));
  await writeDraft({ ...(await readDraft()), ...raw });
  if (isBack(formData)) redirect('/');

  const parsed = createPatientStepSchema(todayIso(getConfig().timeZone)).safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values: raw, attempt: prev.attempt + 1 };
  redirect(`/register/financing${query}`);
}

/**
 * Step 2. "Voltar" stores the raw values without validating (nothing is lost, even a half-typed amount);
 * "Consultar financeiras" validates this step and the whole draft, creates the consultation, schedules
 * the lender calls for after the response and redirects to the consultation screen.
 */
export async function submitFinancingStep(prev: StepFormState, formData: FormData): Promise<StepFormState> {
  const raw = pickFields(formData, stepFields('financing'));
  const scenario = scenarioFrom(formData);
  const query = scenarioQuery(scenario);
  const stored = await readDraft();
  // A step-2 form left open after its consultation started (another tab, a restored page): the patient is gone,
  // so nothing typed there may seed the next patient's draft.
  if (!stepFields('patient').every((field) => stored[field])) redirect(`/register/patient${query}`);
  const draft: RawDraft = { ...stored, ...raw };
  await writeDraft(draft);
  if (isBack(formData)) redirect(`/register/patient${query}`);

  const step = financingStepSchema.safeParse(raw);
  if (!step.success) return { fieldErrors: fieldErrorsOf(step.error), values: raw, attempt: prev.attempt + 1 };

  const config = getConfig();
  const today = todayIso(config.timeZone);
  const whole = createRegistrationSchema(today).safeParse(draft);
  if (!whole.success) redirect(`/register/patient${query}`); // the patient part is missing or stale: back to step 1

  let consultationId: string;
  try {
    const created = createConsultation(
      getDb(),
      {
        patient: {
          fullName: whole.data.fullName,
          cpf: whole.data.cpf,
          birthDate: whole.data.birthDate,
          phone: whole.data.phone,
          monthlyIncomeCents: whole.data.monthlyIncomeCents,
        },
        treatmentAmountCents: whole.data.treatmentAmountCents,
        scenario,
      },
      { now: Date.now(), todayIso: today, deadlineMs: config.consultationDeadlineMs, lenders: LENDERS },
    );
    consultationId = created.id;
    await writeLastConsultationId(consultationId);
    // The draft moves to a retry cookie tied to this consultation: an empty form afterwards keeps the next patient
    // from seeing it and a "back" from turning into a duplicate consultation; retryConsultation restores it.
    await writeRetryDraft(consultationId, draft);
    await clearDraft();
  } catch (error) {
    console.error(JSON.stringify({ event: 'consultation_create_failed', error: error instanceof Error ? error.message : String(error) }));
    return { formError: copy.errors.startFailed, values: raw, attempt: prev.attempt + 1 };
  }

  after(() => startConsultationRun(consultationId));
  redirect(`/consultations/${consultationId}`);
}

const isHint = (value: unknown): value is Hint => typeof value === 'string' && (HINTS as readonly string[]).includes(value);

/** "Tentar com um valor menor" / "Consultar de novo": the amount step again, filled with that consultation's data. */
export async function retryConsultation(formData: FormData): Promise<void> {
  const consultationId = String(formData.get('consultationId') ?? '');
  const hint = formData.get('hint');
  const fields = consultationId ? await readRetryDraft(consultationId) : null;
  // Only the consultation this browser started can be refilled; any other opens an empty form.
  if (!fields) {
    await clearDraft();
    redirect('/register/patient');
  }
  await writeDraft(fields);
  redirect(`/register/financing${isHint(hint) ? `?hint=${hint}` : ''}`);
}

/** Clears the draft and the last consultation, then starts over. */
export async function startNewSimulation(): Promise<void> {
  await clearDraft();
  await clearRetryDraft();
  await clearLastConsultationId();
  redirect('/register/patient');
}
