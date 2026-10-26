/**
 * Registry of the two registration steps (docs/07 §4.4, US1): their order and which raw form fields
 * each one owns. Step URLs, the "Passo N de M" label and the draft cookie all derive from it, so a new
 * step or field is a change here and in `registration-schema.ts` only (docs/03 "Novo campo no cadastro").
 *
 * Pure data and lookups: no I/O, no framework imports.
 */

export const REGISTRATION_STEPS = [
  { slug: 'patient', fields: ['fullName', 'cpf', 'birthDate', 'phone'] },
  { slug: 'financing', fields: ['monthlyIncome', 'treatmentAmount'] },
] as const;

/** 'patient' | 'financing': the segment used in the step URL. */
export type StepSlug = (typeof REGISTRATION_STEPS)[number]['slug'];

/** Every raw field the form collects, across both steps. */
export type RegistrationField = (typeof REGISTRATION_STEPS)[number]['fields'][number];

/** Type guard for a URL segment: true only for a registered step slug. */
export function isStepSlug(value: string): value is StepSlug {
  return REGISTRATION_STEPS.some((step) => step.slug === value);
}

/** 0-based position of the step: 'patient' → 0, 'financing' → 1. */
export function stepIndex(slug: StepSlug): number {
  return REGISTRATION_STEPS.findIndex((step) => step.slug === slug);
}

/** Slug of the step after `slug`, or null on the last step. */
export function nextStep(slug: StepSlug): StepSlug | null {
  const index = stepIndex(slug);
  return index < REGISTRATION_STEPS.length - 1 ? REGISTRATION_STEPS[index + 1].slug : null;
}

/** Slug of the step before `slug`, or null on the first step. */
export function previousStep(slug: StepSlug): StepSlug | null {
  const index = stepIndex(slug);
  return index > 0 ? REGISTRATION_STEPS[index - 1].slug : null;
}
