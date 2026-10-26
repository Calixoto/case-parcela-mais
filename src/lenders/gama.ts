import type { LenderConfig } from './registry';

/** Gama refuses patients younger than this (strict: 25 exactly is approved)... */
export const GAMA_MIN_AGE_YEARS = 25;
/** ...and treatments above this amount (R$ 20.000,00 exactly is approved; R$ 20.000,01 is refused). */
export const GAMA_MAX_AMOUNT_CENTS = 2_000_000;

export const gama: LenderConfig = {
  id: 'gama',
  name: 'Gama',
  minDelayMs: 1_000,
  maxDelayMs: 3_000,
  monthlyRate: 0.0329,
  termsMonths: [6, 10, 12],
  decide: ({ treatmentAmountCents, ageYears }) => {
    if (ageYears < GAMA_MIN_AGE_YEARS) return { outcome: 'refused', reasonCode: 'age_below_min' };
    if (treatmentAmountCents > GAMA_MAX_AMOUNT_CENTS) return { outcome: 'refused', reasonCode: 'amount_above_limit' };
    return { outcome: 'approved', approvedAmountCents: treatmentAmountCents };
  },
};
