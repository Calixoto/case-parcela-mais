import { capPercentCents } from '@/src/domain/money';
import type { LenderConfig } from './registry';

/** Beta always approves, but at most this share of the treatment (rounded down to the cent). */
export const BETA_CAP_PERCENT = 60;

export const beta: LenderConfig = {
  id: 'beta',
  name: 'Beta',
  minDelayMs: 2_000,
  maxDelayMs: 5_000,
  monthlyRate: 0.0199,
  termsMonths: [12, 18, 24],
  decide: ({ treatmentAmountCents }) => ({
    outcome: 'approved',
    approvedAmountCents: capPercentCents(treatmentAmountCents, BETA_CAP_PERCENT),
  }),
};
