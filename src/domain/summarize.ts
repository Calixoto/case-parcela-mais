/**
 * Outcome of a consultation and the next step to suggest to the clinic (docs/07 §4.8, FR-014).
 *
 * The "no lender approved" screen must explain the mix (how many refused, how many were
 * unavailable) and suggest a step that can actually help (docs/02 trap 11): a smaller amount only
 * helps against refusals by income (Alfa) or by amount (Gama). Against unavailability, a refusal
 * by age or a forced refusal, or when the amount is already the minimum, the right step is to
 * consult again.
 */
import { TREATMENT_MIN_CENTS } from './limits';
import type {
  ConsultationOutcome,
  ConsultationSummary,
  LenderResult,
  LenderStatus,
  NextStep,
  ReasonCode,
} from './types';

/**
 * Counts the lenders by status and derives `outcome` and `nextStep`.
 *
 * - Counts come straight from `status`; 'querying' is counted as pending.
 * - `outcome`: 'offers' with at least one approval, even while others are still querying
 *   (docs/04 premise 3); else 'pending' while any lender is still querying; else 'none_approved',
 *   where refusals and unavailable lenders both count as "did not approve" (docs/04 premise 2).
 * - `nextStep`: see `nextStepFor`. Never null here; the type keeps null for the DTO.
 *
 * `treatmentAmountCents` is integer cents.
 */
export function summarizeConsultation(
  lenders: readonly LenderResult[],
  treatmentAmountCents: number,
): ConsultationSummary {
  const countWith = (status: LenderStatus): number =>
    lenders.filter((lender) => lender.status === status).length;

  const approvedCount = countWith('approved');
  const refusedCount = countWith('refused');
  const unavailableCount = countWith('unavailable');
  const pendingCount = countWith('querying');

  const outcome = outcomeFor(approvedCount, pendingCount);

  return {
    approvedCount,
    refusedCount,
    unavailableCount,
    pendingCount,
    outcome,
    nextStep: nextStepFor(outcome, lenders, treatmentAmountCents),
  };
}

/** One approval is enough to show offers; otherwise the consultation is pending until no one is querying. */
function outcomeFor(approvedCount: number, pendingCount: number): ConsultationOutcome {
  if (approvedCount >= 1) return 'offers';
  if (pendingCount >= 1) return 'pending';
  return 'none_approved';
}

/**
 * docs/02 trap 11: a smaller amount helps only against Alfa (income × 10 < amount) and Gama
 * (amount above R$ 20.000). Age, 'forced', technical codes and codes we do not know are not
 * fixed by a smaller amount.
 */
function helpedByLowerAmount(reasonCode: ReasonCode | null): boolean {
  return reasonCode === 'income_insufficient' || reasonCode === 'amount_above_limit';
}

/**
 * docs/07 §4.8: offers → 'choose'; pending → 'wait'; at least one refusal by income or amount,
 * with room to lower the amount → 'lower_amount'; otherwise (only unavailable, refusals only by
 * age or forced, or amount already at the minimum) → 'retry'.
 */
function nextStepFor(
  outcome: ConsultationOutcome,
  lenders: readonly LenderResult[],
  treatmentAmountCents: number,
): NextStep {
  if (outcome === 'offers') return 'choose';
  if (outcome === 'pending') return 'wait';

  const someRefusalHelpedByLowerAmount = lenders.some(
    (lender) => lender.status === 'refused' && helpedByLowerAmount(lender.reasonCode),
  );
  // At R$ 1.000,00 there is no smaller amount to try (docs/02 trap 11).
  const canLowerAmount = treatmentAmountCents > TREATMENT_MIN_CENTS;

  return someRefusalHelpedByLowerAmount && canLowerAmount ? 'lower_amount' : 'retry';
}
