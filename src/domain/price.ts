/**
 * Tabela Price (French amortization): the fixed monthly installment of a loan.
 *
 * Pure functions, no I/O. Money is integer cents; the rate is a monthly decimal
 * (2.49% = 0.0249). The only floating-point arithmetic lives inside
 * `installmentCents`, and its result is rounded to whole cents before it leaves.
 *
 * Rules encoded here (docs/02 trap 7, docs/04 "Ofertas", docs/05):
 * - PV is the amount the lender approved, never the treatment amount.
 * - The installment is rounded to cents half-up; total = rounded installment × n.
 * - A zero rate is handled explicitly (PMT = PV / n) instead of producing NaN.
 * - A rate given in percent (2.49) is rejected instead of silently used.
 */

/**
 * Accepts only a monthly rate in decimal form: finite, >= 0 and < 1.
 *
 * A rate typed as a percentage (2.49 instead of 0.0249) would give an installment of
 * R$ 24.900,01 for R$ 10.000 in 12x without any error (docs/02 trap 7), so it is refused.
 * Zero is allowed: an interest-free promotion is a plausible live change (docs/02 trap 7).
 *
 * @throws RangeError when the rate is NaN, infinite, negative or >= 1.
 */
export function assertMonthlyRate(rate: number): void {
  if (!(Number.isFinite(rate) && rate >= 0 && rate < 1)) {
    throw new RangeError(`monthlyRate must be a decimal in [0, 1), e.g. 0.0249 for 2.49%; got ${rate}`);
  }
}

/**
 * Rounds a non-negative amount in cents to a whole number of cents, half-up
 * (x.5 goes up), the convention behind every expected value in docs/05.
 *
 * Why the nudge: `Math.round` rounds halves toward +∞, which is half-up for
 * non-negative numbers, but a result that is exactly x.5 in decimal can be stored
 * in binary as x.4999999999999…, and `Math.round` then sends it down
 * (`Math.round(1.005 * 100)` is 100, not 101). Multiplying by (1 + 1e-9) first
 * lifts such values back over the boundary. A relative 1e-9 is about a million
 * times larger than double-precision noise (~1e-16), so it never misses a true
 * half, and it stays below half a cent for any amount under R$ 5.000.000,00
 * (5e8 cents), so it cannot change a value that is clearly below the boundary.
 * At the case's cap of R$ 50.000,00 the nudge is 0.005 cent. None of the 28
 * reference rows in docs/05 sits near a boundary; this is a guard, not a fix.
 *
 * Negative values are refused: `Math.round(-2.5)` is -2, which is not half-up.
 *
 * @throws RangeError when the value is negative, NaN or infinite.
 */
export function roundHalfUpCents(value: number): number {
  if (!(Number.isFinite(value) && value >= 0)) {
    throw new RangeError(`roundHalfUpCents expects a finite non-negative number; got ${value}`);
  }
  return Math.round(value * (1 + 1e-9));
}

/**
 * Tabela Price installment, in cents, for a financed amount `pvCents` at
 * `monthlyRate` over `termMonths` (docs/07 §4.8):
 *
 *   PMT = PV · i / (1 − (1 + i)^−n)
 *
 * computed in cents and rounded half-up. `pvCents` must be the amount the lender
 * approved, not the treatment amount: for Beta on a R$ 10.000 treatment, PV is
 * R$ 6.000 and 12x costs R$ 567,01, not R$ 945,02 (docs/02 trap 7, docs/05).
 * With `monthlyRate === 0` the formula divides 0 by 0 and JavaScript returns NaN
 * silently, so that case is handled explicitly as PMT = PV / n (docs/05 "Taxa zero").
 *
 * @throws RangeError when pvCents or termMonths is not a positive integer, or the rate is not a decimal in [0, 1).
 */
export function installmentCents(pvCents: number, monthlyRate: number, termMonths: number): number {
  if (!(Number.isInteger(pvCents) && pvCents > 0)) {
    throw new RangeError(`pvCents must be a positive integer number of cents; got ${pvCents}`);
  }
  if (!(Number.isInteger(termMonths) && termMonths > 0)) {
    throw new RangeError(`termMonths must be a positive integer; got ${termMonths}`);
  }
  assertMonthlyRate(monthlyRate);

  if (monthlyRate === 0) {
    return roundHalfUpCents(pvCents / termMonths);
  }
  const discountFactor = 1 - (1 + monthlyRate) ** -termMonths;
  return roundHalfUpCents((pvCents * monthlyRate) / discountFactor);
}

/**
 * Total paid over the term: the rounded installment × n. docs/05 and docs/04
 * ("Arredondamento") fix this rule on purpose, so the total always equals the sum
 * of the installments the patient will actually pay. Multiplying the exact PMT by n
 * instead differs by cents (Alfa 6x: R$ 10.889,36 vs R$ 10.889,34; Delta 36x:
 * R$ 14.558,37 vs R$ 14.558,40), and the screen, the confirmation and the tests
 * must all agree (docs/02 trap 7).
 */
export function totalCents(installmentCents: number, termMonths: number): number {
  return installmentCents * termMonths;
}

/**
 * Interest paid: total − financed amount (docs/05 column "Juros (total − PV)").
 * It can be slightly negative in the zero-rate degenerate case, where rounding the
 * installment down makes installment × n fall short of PV: R$ 10.000 at 0% in 12x
 * gives 12 × 833,33 = 9.999,96, that is, −4 cents (docs/05 "Taxa zero com dízima").
 */
export function interestCents(totalCents: number, pvCents: number): number {
  return totalCents - pvCents;
}
