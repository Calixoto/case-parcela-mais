/**
 * Deterministic ordering of the offers table (docs/07 §4.8, FR-017; docs/02 trap 6; docs/04
 * "Ordenação padrão e desempate"). Pure: the server computes the amounts, the client only sorts.
 */
import { SORT_CRITERIA, type Offer, type SortCriterion } from './types';

type AmountKey = 'installmentCents' | 'totalCents';

/**
 * Per criterion: the amount that orders the list and the other amount, which is the first
 * tie-breaker. `Record<SortCriterion, …>` makes a new criterion in `SORT_CRITERIA` a type error
 * here until its keys are added (docs/03: "nova ordenação" is a plausible live change).
 */
const SORT_KEYS: Record<SortCriterion, { readonly primary: AmountKey; readonly secondary: AmountKey }> = {
  installment: { primary: 'installmentCents', secondary: 'totalCents' },
  total: { primary: 'totalCents', secondary: 'installmentCents' },
};

/**
 * Returns a NEW array with the offers in ascending order of `criterion`: the installment for
 * 'installment' (the default on screen), the total paid for 'total'. The input is never mutated.
 *
 * Ties are broken in a fixed order, so the list is identical on every render and in every test
 * (docs/02 trap 6; docs/04): the other amount, then the monthly rate, then the lender name under
 * pt-BR collation (accents and case do not reorder names), then the term. Offers that tie on all
 * five keep their input order, because `Array.prototype.sort` is stable.
 *
 * Expected results: the lists "Por menor parcela" and "Por menor custo total" of docs/05.
 *
 * @throws RangeError for a criterion outside `SORT_CRITERIA` (the value comes from `?sort`).
 */
export function sortOffers(offers: readonly Offer[], criterion: SortCriterion): Offer[] {
  if (!SORT_CRITERIA.includes(criterion)) {
    throw new RangeError(`sort criterion must be one of ${SORT_CRITERIA.join(', ')}; got ${String(criterion)}`);
  }
  const { primary, secondary } = SORT_KEYS[criterion];

  return [...offers].sort(
    (a, b) =>
      a[primary] - b[primary] ||
      a[secondary] - b[secondary] ||
      a.monthlyRate - b.monthlyRate ||
      a.lenderName.localeCompare(b.lenderName, 'pt-BR') ||
      a.termMonths - b.termMonths,
  );
}
