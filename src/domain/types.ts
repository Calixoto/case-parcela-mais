/**
 * Domain vocabulary shared by every layer. Pure types only: no imports from Next, the database or React.
 *
 * Glossary (pt-BR → code): paciente = patient, consulta = consultation, financeira = lender,
 * oferta = offer, prazo = term (months), parcela = installment, total pago = total.
 * Money is always integer cents; rates are decimals (2.49% = 0.0249); timestamps are epoch milliseconds.
 */

export type LenderStatus = 'querying' | 'approved' | 'refused' | 'unavailable';

export type ConsultationStatus = 'querying' | 'finished';

export type FinishReason = 'all_responded' | 'deadline' | 'reconciled';

/** Why a lender did not approve. Free text in the database: a new lender may bring a new reason. */
export type ReasonCode =
  | 'income_insufficient'
  | 'age_below_min'
  | 'amount_above_limit'
  | 'http_500'
  | 'timeout'
  | 'forced'
  | (string & {});

export const SCENARIO_IDS = ['all_approve', 'delta_error', 'delta_timeout', 'none_approve'] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export const SORT_CRITERIA = ['installment', 'total'] as const;
export type SortCriterion = (typeof SORT_CRITERIA)[number];

/** What the orchestrator asks every lender. */
export type QuoteInput = {
  readonly treatmentAmountCents: number;
  readonly monthlyIncomeCents: number;
  readonly ageYears: number;
};

/** A lender's answer (before persistence). */
export type LenderDecision =
  | { readonly outcome: 'approved'; readonly approvedAmountCents: number }
  | { readonly outcome: 'refused'; readonly reasonCode: ReasonCode };

/** One row of `lender_results`, as read back from the database. */
export type LenderResult = {
  readonly lenderId: string;
  readonly lenderName: string;
  readonly status: LenderStatus;
  readonly reasonCode: ReasonCode | null;
  readonly approvedAmountCents: number | null;
  readonly monthlyRate: number | null;
  readonly termsMonths: readonly number[];
  readonly latencyMs: number | null;
};

/** One line of the offers table: lender × term, fully computed on the server. */
export type Offer = {
  readonly lenderId: string;
  readonly lenderName: string;
  readonly termMonths: number;
  readonly financedAmountCents: number;
  readonly monthlyRate: number;
  readonly installmentCents: number;
  readonly totalCents: number;
  readonly interestCents: number;
  /** Integer percentage of the treatment covered by the approved amount (floor). */
  readonly coveragePercent: number;
  readonly uncoveredCents: number;
  readonly isPartial: boolean;
};

export type ConsultationOutcome = 'pending' | 'offers' | 'none_approved';

export type NextStep = 'choose' | 'wait' | 'lower_amount' | 'retry';

export type ConsultationSummary = {
  readonly approvedCount: number;
  readonly refusedCount: number;
  readonly unavailableCount: number;
  readonly pendingCount: number;
  readonly outcome: ConsultationOutcome;
  readonly nextStep: NextStep | null;
};

export type ChosenOffer = {
  readonly lenderId: string;
  readonly lenderName: string;
  readonly termMonths: number;
  readonly financedAmountCents: number;
  readonly monthlyRate: number;
  readonly installmentCents: number;
  readonly totalCents: number;
};

/** The one DTO used by server rendering, polling and `curl`. */
export type ConsultationSnapshot = {
  readonly id: string;
  readonly status: ConsultationStatus;
  readonly finishReason: FinishReason | null;
  readonly startedAt: number;
  readonly deadlineAt: number;
  readonly finishedAt: number | null;
  readonly serverNow: number;
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
  readonly forcedScenario: ScenarioId | null;
  readonly treatmentAmountCents: number;
  readonly patient: { readonly fullName: string; readonly cpfMasked: string; readonly ageYears: number };
  readonly lenders: readonly LenderResult[];
  readonly offers: readonly Offer[];
  readonly summary: ConsultationSummary;
  readonly choice: ChosenOffer | null;
};
