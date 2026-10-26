import type { LenderDecision, QuoteInput } from '@/src/domain/types';
import { LenderHttpError } from './errors';
import type { LenderConfig } from './registry';
import type { LenderOverride } from './scenarios';

/** Everything the simulator needs from the outside world, so tests can control time and chance. */
export type SimulationContext = {
  readonly random: () => number; // [0, 1)
  readonly setTimeout: (callback: () => void, ms: number) => unknown;
  readonly override?: LenderOverride;
};

export type LenderQuote = {
  readonly decision: LenderDecision;
  readonly monthlyRate: number;
  readonly termsMonths: readonly number[];
  readonly delayMs: number;
};

/**
 * Plays one lender: draws the delay (1st random) and the failure (2nd random) up front, then answers
 * after the delay. The error, when drawn, is delivered after the delay too (docs/04: decided at the start,
 * delivered later). The simulator never aborts: a late answer must reach the database to be refused there.
 */
export function simulateLender(lender: LenderConfig, input: QuoteInput, context: SimulationContext): Promise<LenderQuote> {
  const naturalDelay = Math.round(lender.minDelayMs + context.random() * (lender.maxDelayMs - lender.minDelayMs));
  const naturalFailure = context.random() < (lender.failureRate ?? 0);
  const override = context.override ?? { outcome: 'natural' };
  const delayMs = override.delayMs ?? naturalDelay;

  return new Promise((resolve, reject) => {
    context.setTimeout(() => {
      try {
        resolve({ decision: decideWith(lender, input, override, naturalFailure), monthlyRate: lender.monthlyRate, termsMonths: lender.termsMonths, delayMs });
      } catch (error) {
        reject(error);
      }
    }, delayMs);
  });
}

function decideWith(lender: LenderConfig, input: QuoteInput, override: LenderOverride, naturalFailure: boolean): LenderDecision {
  switch (override.outcome) {
    case 'approve':
    case 'timeout': // "timeout" only changes the delay; the answer itself is a normal approval
      return { outcome: 'approved', approvedAmountCents: input.treatmentAmountCents };
    case 'refuse':
      return { outcome: 'refused', reasonCode: 'forced' };
    case 'error':
      throw new LenderHttpError(500);
    case 'natural':
      if (naturalFailure) throw new LenderHttpError(500);
      return lender.decide(input);
  }
}
