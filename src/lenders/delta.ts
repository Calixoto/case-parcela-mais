import type { LenderConfig } from './registry';

/** Delta fails with HTTP 500 in this share of the calls; when it answers, it approves 100%. */
export const DELTA_FAILURE_RATE = 0.3;

export const delta: LenderConfig = {
  id: 'delta',
  name: 'Delta',
  minDelayMs: 4_000,
  maxDelayMs: 15_000, // crosses the 10 s deadline on purpose (docs/02, trap 2)
  monthlyRate: 0.0219,
  termsMonths: [12, 24, 36],
  failureRate: DELTA_FAILURE_RATE,
  decide: ({ treatmentAmountCents }) => ({ outcome: 'approved', approvedAmountCents: treatmentAmountCents }),
};
