import type { LenderConfig } from './registry';

/** Alfa approves 100% when monthly income × 10 ≥ treatment amount; otherwise refuses. */
export const ALFA_INCOME_FACTOR = 10;

export const alfa: LenderConfig = {
  id: 'alfa',
  name: 'Alfa',
  minDelayMs: 500,
  maxDelayMs: 1_500,
  monthlyRate: 0.0249,
  termsMonths: [6, 12, 18],
  decide: ({ treatmentAmountCents, monthlyIncomeCents }) =>
    monthlyIncomeCents * ALFA_INCOME_FACTOR >= treatmentAmountCents // integers: no 1234.56 × 10 float surprise
      ? { outcome: 'approved', approvedAmountCents: treatmentAmountCents }
      : { outcome: 'refused', reasonCode: 'income_insufficient' },
};
