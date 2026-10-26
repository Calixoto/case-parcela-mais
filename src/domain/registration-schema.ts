/**
 * Registration rules as zod 4 schemas, shared by the form actions and the JSON API (docs/07 §4.4;
 * docs/02 trap 14: one schema for front and back; docs/04 "Cadastro").
 *
 * Inputs are the raw strings the attendant typed (or the cookie stored); outputs are normalized:
 * CPF and phone as digits only, birth date as ISO 'YYYY-MM-DD', money as integer cents. Every
 * message comes from `copy.errors`, so the screen and the 422 body say the same thing.
 *
 * `todayIso` is a parameter (the civil date in America/Sao_Paulo, from `todayIso()` in age.ts), so
 * these schemas never read the clock and the docs/05 age boundaries are testable against a fixed day.
 */
import { z } from 'zod';
import { copy } from '@/src/copy/pt-BR';
import { ageInYears, isValidCalendarDate, parseBrDate } from './age';
import { isValidCpf, normalizeCpf } from './cpf';
import { MAX_AGE_YEARS, MIN_AGE_YEARS, TREATMENT_MAX_CENTS, TREATMENT_MIN_CENTS } from './limits';
import { parseBRL } from './money';
import type { RegistrationField } from './registration-steps';
import { SCENARIO_IDS } from './types';

/** The raw strings of the form, as the draft cookie stores them: any field may be missing. */
export type RawDraft = Partial<Record<RegistrationField, string>>;

export type PatientStepOutput = {
  fullName: string;
  /** 11 digits, no mask. */
  cpf: string;
  /** ISO 'YYYY-MM-DD'. */
  birthDate: string;
  /** 11 digits: DDD plus the 9-digit mobile number. */
  phone: string;
};

export type FinancingStepOutput = { monthlyIncomeCents: number; treatmentAmountCents: number };

/** Messages grouped by field name, as the actions and the 422 body return them. */
export type FieldErrors = Partial<Record<string, string[]>>;

// --- Field rules ---------------------------------------------------------------------------------

/** Letters of any script, combining marks, spaces, apostrophes and hyphens (docs/04 "Nome completo"). */
const FULL_NAME_CHARS = /^[\p{L}\p{M}' -]+$/u;
const FULL_NAME_MIN_LENGTH = 3;
const FULL_NAME_MAX_LENGTH = 120;

/** 11 digits: DDD 11-99 whose second digit is not 0, then the mobile 9 (docs/04 "Celular"). */
const MOBILE_PHONE_DIGITS = /^[1-9][1-9]9\d{8}$/;

/**
 * A form field: a string, and a missing field counts as empty. The message also covers the
 * wrong-type case (a tampered cookie), so no English zod default ever reaches the screen.
 */
function textField(message: string) {
  return z.string({ error: message }).optional().transform((value) => value ?? '');
}

/** Already trimmed: 3..120 characters, only name characters and at least two words with a letter. */
function isFullName(name: string): boolean {
  const words = name.split(' ').filter((word) => /\p{L}/u.test(word));
  return (
    name.length >= FULL_NAME_MIN_LENGTH &&
    name.length <= FULL_NAME_MAX_LENGTH &&
    FULL_NAME_CHARS.test(name) &&
    words.length >= 2
  );
}

const fullNameField = textField(copy.errors.fullName)
  .transform((value) => value.trim())
  .refine(isFullName, copy.errors.fullName);

/** With or without mask; check digits and the repeated sequences are in cpf.ts (docs/02 trap 10). */
const cpfField = textField(copy.errors.cpf).refine(isValidCpf, copy.errors.cpf).transform(normalizeCpf);

/** Keeps only the digits ("(11) 91234-5678" → "11912345678") and validates the 11-digit shape. */
const phoneField = textField(copy.errors.phone)
  .transform((value) => value.replace(/\D/g, ''))
  .refine((digits) => MOBILE_PHONE_DIGITS.test(digits), copy.errors.phone);

/** Accepts 'dd/mm/yyyy' (typed) or 'YYYY-MM-DD' (native date input). Returns ISO or null. */
function parseBirthDate(value: string): string | null {
  const text = value.trim();
  return isValidCalendarDate(text) ? text : parseBrDate(text);
}

/**
 * Three distinct messages, in this order (docs/02 trap 9; docs/04 "Data de nascimento"): invalid
 * date, date after today, age outside MIN_AGE_YEARS..MAX_AGE_YEARS inclusive (docs/05 boundaries).
 */
function birthDateField(todayIso: string) {
  return textField(copy.errors.birthDateInvalid).transform((value, ctx) => {
    const iso = parseBirthDate(value);
    if (iso === null) {
      ctx.addIssue(copy.errors.birthDateInvalid);
      return z.NEVER;
    }
    // Zero-padded ISO dates compare correctly as plain strings (see age.ts).
    if (iso > todayIso) {
      ctx.addIssue(copy.errors.birthDateFuture);
      return z.NEVER;
    }
    const age = ageInYears(iso, todayIso);
    if (age < MIN_AGE_YEARS || age > MAX_AGE_YEARS) {
      ctx.addIssue(copy.errors.age);
      return z.NEVER;
    }
    return iso;
  });
}

/** Income is required and positive, with no cap (docs/04 "Renda mensal"). */
function isPositiveCents(cents: number): boolean {
  return cents > 0;
}

/** R$ 1.000,00..R$ 50.000,00 inclusive (docs/05 "Fronteiras de valor"; docs/07 §3.4). */
function isWithinTreatmentLimits(cents: number): boolean {
  return cents >= TREATMENT_MIN_CENTS && cents <= TREATMENT_MAX_CENTS;
}

/** pt-BR money text ("R$ 1.234,56") → integer cents that satisfy `rule`, else `message`. */
function moneyField(rule: (cents: number) => boolean, message: string) {
  return textField(message).transform((value, ctx) => {
    const cents = parseBRL(value);
    if (cents === null || !rule(cents)) {
      ctx.addIssue(message);
      return z.NEVER;
    }
    return cents;
  });
}

/** JSON cents: an integer, never a float (docs/02 trap 8), that satisfies `rule`, else `message`. */
function centsField(rule: (cents: number) => boolean, message: string) {
  return z.number({ error: message }).refine((cents) => Number.isSafeInteger(cents) && rule(cents), message);
}

// --- Schemas -------------------------------------------------------------------------------------

function patientShape(todayIso: string) {
  return { fullName: fullNameField, cpf: cpfField, birthDate: birthDateField(todayIso), phone: phoneField };
}

const financingShape = {
  monthlyIncome: moneyField(isPositiveCents, copy.errors.monthlyIncome),
  treatmentAmount: moneyField(isWithinTreatmentLimits, copy.errors.treatmentAmount),
};

/** Step 1, the patient: raw strings in, `PatientStepOutput` out. Needs today's date for the age rule. */
export function createPatientStepSchema(todayIso: string) {
  return z.object(patientShape(todayIso));
}

/** Step 2, income and treatment: pt-BR money text in, `FinancingStepOutput` (integer cents) out. */
export const financingStepSchema = z
  .object(financingShape)
  .transform(({ monthlyIncome, treatmentAmount }): FinancingStepOutput => ({
    monthlyIncomeCents: monthlyIncome,
    treatmentAmountCents: treatmentAmount,
  }));

/** Both steps at once, for the final submit: the whole `RawDraft` is validated again. */
export function createRegistrationSchema(todayIso: string) {
  return z
    .object({ ...patientShape(todayIso), ...financingShape })
    .transform(({ monthlyIncome, treatmentAmount, ...patient }): PatientStepOutput & FinancingStepOutput => ({
      ...patient,
      monthlyIncomeCents: monthlyIncome,
      treatmentAmountCents: treatmentAmount,
    }));
}

/**
 * Body of `POST /api/consultations` (docs/07 §4.6): the same patient rules as the form, money already
 * in integer cents, an optional forced scenario and an opaque `overrides` passed through to the lender
 * adapters. Unknown keys are dropped (zod default).
 */
export function createConsultationInputSchema(todayIso: string) {
  return z.object({
    patient: z.object(
      { ...patientShape(todayIso), monthlyIncomeCents: centsField(isPositiveCents, copy.errors.monthlyIncome) },
      { error: copy.api.validationFailed },
    ),
    treatmentAmountCents: centsField(isWithinTreatmentLimits, copy.errors.treatmentAmount),
    scenario: z.enum(SCENARIO_IDS, { error: copy.errors.scenario }).optional(),
    overrides: z.unknown().optional(),
  });
}

/** Messages grouped by top-level field, for `{ fieldErrors }` in the actions and the 422 body of the API. */
export function fieldErrorsOf(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors;
}
