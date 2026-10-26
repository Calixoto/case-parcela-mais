import type { QuoteInput } from '@/src/domain/types';
import type { LenderConfig } from '@/src/lenders/registry';
import { simulateLender, type LenderQuote, type SimulationContext } from '@/src/lenders/simulate';

/**
 * The single place every lender call goes through. A retry policy, a circuit breaker or real HTTP
 * would live here without touching the orchestrator or the rules.
 */
export function callLender(lender: LenderConfig, input: QuoteInput, context: SimulationContext): Promise<LenderQuote> {
  return simulateLender(lender, input, context);
}
