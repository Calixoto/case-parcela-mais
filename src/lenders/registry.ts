import type { LenderDecision, QuoteInput } from '@/src/domain/types';
import { alfa } from './alfa';
import { beta } from './beta';
import { delta } from './delta';
import { gama } from './gama';

/**
 * A lender is data plus one pure decision function. Adding a lender is a new file and one entry below;
 * nothing else (database, API, screens) knows the list, so the fifth lender needs no migration.
 */
export type LenderConfig = {
  readonly id: string;
  readonly name: string;
  /** Natural response time, uniformly drawn between these bounds. */
  readonly minDelayMs: number;
  readonly maxDelayMs: number;
  /** Monthly rate as a decimal (2.49% = 0.0249). */
  readonly monthlyRate: number;
  readonly termsMonths: readonly number[];
  /** Share of calls that fail with HTTP 500 (Delta: 0.3). */
  readonly failureRate?: number;
  readonly decide: (input: QuoteInput) => LenderDecision;
};

export const LENDERS: readonly LenderConfig[] = [alfa, beta, gama, delta];

export type LenderId = (typeof LENDERS)[number]['id'];

export function findLender(id: string): LenderConfig | undefined {
  return LENDERS.find((lender) => lender.id === id);
}
