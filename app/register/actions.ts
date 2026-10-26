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
import { clearDraft, clearLastConsultationId, readDraft, writeDraft, writeLastConsultationId } from '@/src/server/draft-cookie';
import { startConsultationRun } from '@/src/server/start-run';
import { scenarioQuery } from '@/src/url-state/parsers';

export type StepFormState = {
  readonly fieldErrors?: FieldErrors;
  readonly formError?: string;
  /** What was submitted, echoed back so the inputs keep the typed values after a failed validation. */
  readonly values?: RawDraft;
  readonly attempt: number;
};

const stepFields = (slug: StepSlug): readonly RegistrationField[] => REGISTRATION_STEPS.find((step) => step.slug === slug)!.fields;

function pickFields(formData: FormData, fields: readonly RegistrationField[]): RawDraft {
  const raw: Record<string, string> = {};
  for (const field of fields) {
    const value = formData.get(field);
    raw[field] = typeof value === 'string' ? value : '';
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
  const draft: RawDraft = { ...(await readDraft()), ...raw };
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
  } catch (error) {
    console.error(JSON.stringify({ event: 'consultation_create_failed', error: error instanceof Error ? error.message : String(error) }));
    return { formError: copy.errors.startFailed, values: raw, attempt: prev.attempt + 1 };
  }

  after(() => startConsultationRun(consultationId));
  redirect(`/consultations/${consultationId}`);
}

/** Clears the draft and the last consultation, then starts over. */
export async function startNewSimulation(): Promise<void> {
  await clearDraft();
  await clearLastConsultationId();
  redirect('/register/patient');
}

/** Demo personas of docs/03, stored as the clinic would have typed them. */
const PERSONAS = {
  A: { fullName: 'Ana Souza', cpf: '529.982.247-25', birthDate: '1996-03-15', phone: '(11) 91234-5678', monthlyIncome: 'R$ 5.000,00', treatmentAmount: 'R$ 15.000,00' },
  B: { fullName: 'Bruno Lima', cpf: '123.456.789-09', birthDate: '2004-05-10', phone: '(21) 98765-4321', monthlyIncome: 'R$ 1.500,00', treatmentAmount: 'R$ 25.000,00' },
  C: { fullName: 'Carla Dias', cpf: '390.533.447-05', birthDate: '1986-07-02', phone: '(31) 99876-5432', monthlyIncome: 'R$ 3.000,00', treatmentAmount: 'R$ 45.000,00' },
} as const;

type PersonaId = keyof typeof PERSONAS;

function isPersonaId(value: unknown): value is PersonaId {
  return typeof value === 'string' && value in PERSONAS;
}

/** Fills the draft with a persona and opens the last step with the chosen scenario (demo shortcut). */
export async function applyPersona(formData: FormData): Promise<void> {
  const persona = formData.get('persona');
  const scenario = scenarioFrom(formData);
  if (!isPersonaId(persona)) redirect('/register/patient');
  await writeDraft({ ...PERSONAS[persona] });
  redirect(`/register/financing${scenarioQuery(scenario)}`);
}
