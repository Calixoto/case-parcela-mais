/**
 * The offers table: one line per approved lender × term, fully computed on the server
 * (docs/07 §4.8; docs/02 traps 6, 7 and 12; docs/04 "Ofertas").
 *
 * Pure: no I/O, no clock. Money is integer cents; rates are monthly decimals (2.49% = 0.0249).
 * The Price arithmetic lives in `price.ts`; this module only flattens and annotates.
 */
import { percentCovered } from './money';
import { installmentCents, interestCents, totalCents } from './price';
import type { LenderResult, Offer } from './types';

export type BuildOffersOptions = {
  /**
   * Fixed amount, in cents, added to the total of every offer. Default 0. This is the hook for
   * IOF or a fixed fee, a plausible live change (docs/03 "Taxa 0% ... incluir IOF ou tarifa fixa").
   */
  readonly feeCents?: number;
};

/** A `lender_results` row that can produce offers: approved, with the amount and the rate present. */
type ApprovedLender = LenderResult & {
  readonly status: 'approved';
  readonly approvedAmountCents: number;
  readonly monthlyRate: number;
};

/**
 * Builds the flat list of offers: for each approved lender, in the order the lenders come (the
 * registry order), one `Offer` per term in `termsMonths`, ascending. Lenders whose status is not
 * 'approved', or that lack an approved amount or a rate, produce nothing: a refused, unavailable
 * or still-querying lender never has an offer (docs/02 trap 12).
 *
 * Per offer (docs/02 trap 7; docs/05 "Tabela Price de referência"):
 * - `financedAmountCents` is the amount the lender approved, never the treatment amount: Beta on
 *   a R$ 10.000 treatment finances R$ 6.000, so 12x costs R$ 567,01, not R$ 945,02;
 * - `installmentCents` is the Tabela Price installment; `totalCents` is installment × n plus
 *   `feeCents`; `interestCents` is total − financed, so a fee counts as cost of credit;
 * - coverage (docs/02 trap 6; docs/04 "Oferta parcial"): `coveragePercent` is
 *   floor(approved · 100 / treatment), `uncoveredCents` is what the treatment still lacks and
 *   `isPartial` flags an approved amount below the treatment. A partial offer is still an offer.
 *
 * @throws RangeError when `feeCents` is not a non-negative integer, or when an approved row
 *   carries an amount or rate the Price formula refuses (zero amount, rate in percent): a corrupt
 *   approval is reported, not silently dropped.
 */
export function buildOffers(
  lenders: readonly LenderResult[],
  treatmentAmountCents: number,
  options: BuildOffersOptions = {},
): Offer[] {
  const feeCents = options.feeCents ?? 0;
  if (!Number.isSafeInteger(feeCents) || feeCents < 0) {
    throw new RangeError(`feeCents must be a non-negative integer number of cents; got ${feeCents}`);
  }

  return lenders
    .filter(isApprovedLender)
    .flatMap((lender) => offersForLender(lender, treatmentAmountCents, feeCents));
}

function isApprovedLender(lender: LenderResult): lender is ApprovedLender {
  return lender.status === 'approved' && lender.approvedAmountCents !== null && lender.monthlyRate !== null;
}

/** One offer per term, ascending. The lender's `termsMonths` is copied, never sorted in place. */
function offersForLender(lender: ApprovedLender, treatmentAmountCents: number, feeCents: number): Offer[] {
  const financed = lender.approvedAmountCents;
  const terms = [...lender.termsMonths].sort((a, b) => a - b);

  return terms.map((termMonths) => {
    const installment = installmentCents(financed, lender.monthlyRate, termMonths);
    const total = totalCents(installment, termMonths) + feeCents;

    return {
      lenderId: lender.lenderId,
      lenderName: lender.lenderName,
      termMonths,
      financedAmountCents: financed,
      monthlyRate: lender.monthlyRate,
      installmentCents: installment,
      totalCents: total,
      interestCents: interestCents(total, financed),
      coveragePercent: percentCovered(financed, treatmentAmountCents),
      uncoveredCents: Math.max(0, treatmentAmountCents - financed),
      isPartial: financed < treatmentAmountCents,
    };
  });
}
