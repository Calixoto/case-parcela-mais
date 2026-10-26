import { describe, expect, it } from 'vitest';

import { assertMonthlyRate, installmentCents, interestCents, roundHalfUpCents, totalCents } from './price';

/**
 * docs/05 "Tabela Price de referência": patient aged 30, income R$ 3.000, treatment
 * R$ 10.000, all four lenders approving. The doc shows BRL; here everything is cents.
 * `installment`, `total` and `interest` are the expected values (total = installment × n).
 */
const referenceTable = [
  { lender: 'Alfa', rate: 0.0249, pvCents: 1_000_000, termMonths: 6, installment: 181_489, total: 1_088_934, interest: 88_934 },
  { lender: 'Alfa', rate: 0.0249, pvCents: 1_000_000, termMonths: 12, installment: 97_428, total: 1_169_136, interest: 169_136 },
  { lender: 'Alfa', rate: 0.0249, pvCents: 1_000_000, termMonths: 18, installment: 69_610, total: 1_252_980, interest: 252_980 },
  { lender: 'Beta', rate: 0.0199, pvCents: 600_000, termMonths: 12, installment: 56_701, total: 680_412, interest: 80_412 },
  { lender: 'Beta', rate: 0.0199, pvCents: 600_000, termMonths: 18, installment: 39_986, total: 719_748, interest: 119_748 },
  { lender: 'Beta', rate: 0.0199, pvCents: 600_000, termMonths: 24, installment: 31_687, total: 760_488, interest: 160_488 },
  { lender: 'Gama', rate: 0.0329, pvCents: 1_000_000, termMonths: 6, installment: 186_376, total: 1_118_256, interest: 118_256 },
  { lender: 'Gama', rate: 0.0329, pvCents: 1_000_000, termMonths: 10, installment: 118_972, total: 1_189_720, interest: 189_720 },
  { lender: 'Gama', rate: 0.0329, pvCents: 1_000_000, termMonths: 12, installment: 102_209, total: 1_226_508, interest: 226_508 },
  { lender: 'Delta', rate: 0.0219, pvCents: 1_000_000, termMonths: 12, installment: 95_666, total: 1_147_992, interest: 147_992 },
  { lender: 'Delta', rate: 0.0219, pvCents: 1_000_000, termMonths: 24, installment: 54_016, total: 1_296_384, interest: 296_384 },
  { lender: 'Delta', rate: 0.0219, pvCents: 1_000_000, termMonths: 36, installment: 40_440, total: 1_455_840, interest: 455_840 },
];

/** docs/05 "Fixtures extras de Price", in cents. The last two rows are the zero-rate degenerate case. */
const extraFixtures = [
  { label: 'Beta, PV mínimo (tratamento R$ 1.000)', pvCents: 60_000, rate: 0.0199, termMonths: 12, installment: 5_670, total: 68_040 },
  { label: 'Beta, PV mínimo', pvCents: 60_000, rate: 0.0199, termMonths: 18, installment: 3_999, total: 71_982 },
  { label: 'Beta, PV mínimo', pvCents: 60_000, rate: 0.0199, termMonths: 24, installment: 3_169, total: 76_056 },
  { label: 'Alfa, PV máximo', pvCents: 5_000_000, rate: 0.0249, termMonths: 6, installment: 907_446, total: 5_444_676 },
  { label: 'Alfa, PV máximo', pvCents: 5_000_000, rate: 0.0249, termMonths: 12, installment: 487_141, total: 5_845_692 },
  { label: 'Alfa, PV máximo', pvCents: 5_000_000, rate: 0.0249, termMonths: 18, installment: 348_050, total: 6_264_900 },
  { label: 'Gama, no limite de R$ 20.000', pvCents: 2_000_000, rate: 0.0329, termMonths: 6, installment: 372_751, total: 2_236_506 },
  { label: 'Gama, no limite', pvCents: 2_000_000, rate: 0.0329, termMonths: 10, installment: 237_944, total: 2_379_440 },
  { label: 'Gama, no limite', pvCents: 2_000_000, rate: 0.0329, termMonths: 12, installment: 204_418, total: 2_453_016 },
  { label: 'Delta, PV máximo', pvCents: 5_000_000, rate: 0.0219, termMonths: 12, installment: 478_332, total: 5_739_984 },
  { label: 'Delta, PV máximo', pvCents: 5_000_000, rate: 0.0219, termMonths: 24, installment: 270_079, total: 6_481_896 },
  { label: 'Delta, PV máximo', pvCents: 5_000_000, rate: 0.0219, termMonths: 36, installment: 202_200, total: 7_279_200 },
  { label: 'Beta, 60% de R$ 50.000', pvCents: 3_000_000, rate: 0.0199, termMonths: 12, installment: 283_505, total: 3_402_060 },
  { label: 'Beta, 60% de R$ 50.000', pvCents: 3_000_000, rate: 0.0199, termMonths: 24, installment: 158_434, total: 3_802_416 },
  { label: 'Taxa zero (caso degenerado, PMT = PV / n)', pvCents: 1_200_000, rate: 0, termMonths: 12, installment: 100_000, total: 1_200_000 },
  { label: 'Taxa zero com dízima', pvCents: 1_000_000, rate: 0, termMonths: 12, installment: 83_333, total: 999_996 },
];

describe('assertMonthlyRate', () => {
  it.each([0, 0.0199, 0.0219, 0.0249, 0.0329, 0.5, 0.999999])('accepts the decimal rate %s', (rate) => {
    expect(() => assertMonthlyRate(rate)).not.toThrow();
  });

  it.each([
    ['a rate in percent (docs/02 trap 7)', 2.49],
    ['a rate in percent below 100', 1.99],
    ['exactly 1', 1],
    ['a negative rate', -0.0249],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('rejects %s', (_label, rate) => {
    expect(() => assertMonthlyRate(rate)).toThrow(RangeError);
  });
});

describe('roundHalfUpCents', () => {
  it.each([
    [0, 0],
    [0.4, 0],
    [0.5, 1],
    [1.5, 2],
    [2.5, 3],
    [56_700.919949, 56_701],
    [83_333.3333, 83_333],
    [1_088_934, 1_088_934],
  ])('rounds %s half-up to %s', (value, expected) => {
    expect(roundHalfUpCents(value)).toBe(expected);
  });

  it('lifts a decimal .5 that binary stores slightly below .5 (why the nudge exists)', () => {
    const value = 1.005 * 100; // 100.49999999999999 in IEEE-754, though 100.5 in decimal
    expect(value).toBeLessThan(100.5);
    expect(Math.round(value)).toBe(100);
    expect(roundHalfUpCents(value)).toBe(101);
  });

  it.each([-0.5, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects %s', (value) => {
    expect(() => roundHalfUpCents(value)).toThrow(RangeError);
  });
});

describe('installmentCents: "Tabela Price de referência" (docs/05)', () => {
  it.each(referenceTable)(
    '$lender $rate × $termMonths on $pvCents → installment $installment, total $total, interest $interest',
    ({ rate, pvCents, termMonths, installment, total, interest }) => {
      const actualInstallment = installmentCents(pvCents, rate, termMonths);
      const actualTotal = totalCents(actualInstallment, termMonths);

      expect(actualInstallment).toBe(installment);
      expect(actualTotal).toBe(total);
      expect(interestCents(actualTotal, pvCents)).toBe(interest);
    },
  );
});

describe('installmentCents: "Fixtures extras de Price" (docs/05)', () => {
  it.each(extraFixtures)(
    '$label: $pvCents at $rate × $termMonths → installment $installment, total $total',
    ({ rate, pvCents, termMonths, installment, total }) => {
      const actualInstallment = installmentCents(pvCents, rate, termMonths);

      expect(actualInstallment).toBe(installment);
      expect(totalCents(actualInstallment, termMonths)).toBe(total);
    },
  );
});

describe('installmentCents: classic errors (docs/05 "Erros clássicos", docs/02 trap 7)', () => {
  it('rejects a rate given in percent (2.49), which would silently give R$ 24.900,01 instead of R$ 974,28', () => {
    expect(() => installmentCents(1_000_000, 2.49, 12)).toThrow(RangeError);
  });

  it('PV must be the approved amount: treatment PV on Beta gives 945,02 instead of 567,01', () => {
    expect(installmentCents(1_000_000, 0.0199, 12)).toBe(94_502);
    expect(installmentCents(600_000, 0.0199, 12)).toBe(56_701);
  });

  it('handles a zero rate explicitly as PV / n instead of returning NaN', () => {
    expect(installmentCents(1_200_000, 0, 12)).toBe(100_000);
    expect(installmentCents(1_000_000, 0, 12)).toBe(83_333);
  });
});

describe('installmentCents: argument validation', () => {
  it.each([
    ['zero', 0],
    ['negative', -1_000_000],
    ['fractional cents', 1_000_000.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects a PV that is %s', (_label, pvCents) => {
    expect(() => installmentCents(pvCents, 0.0249, 12)).toThrow(RangeError);
  });

  it.each([
    ['zero', 0],
    ['negative', -12],
    ['fractional', 1.5],
    ['NaN', Number.NaN],
  ])('rejects a term that is %s', (_label, termMonths) => {
    expect(() => installmentCents(1_000_000, 0.0249, termMonths)).toThrow(RangeError);
  });

  it('accepts a single installment (n = 1): PV plus one month of interest', () => {
    expect(installmentCents(1_000_000, 0.0249, 1)).toBe(1_024_900);
  });
});

describe('totalCents', () => {
  it('is the rounded installment × n, never the exact PMT × n (docs/02 trap 7)', () => {
    // Alfa 6x: exact PMT × n would be 10.889,36; the rule gives 10.889,34.
    expect(totalCents(181_489, 6)).toBe(1_088_934);
    expect(totalCents(181_489, 6)).not.toBe(1_088_936);
    // Delta 36x: exact PMT × n would be 14.558,37; the rule gives 14.558,40.
    expect(totalCents(40_440, 36)).toBe(1_455_840);
    expect(totalCents(40_440, 36)).not.toBe(1_455_837);
  });
});

describe('interestCents', () => {
  it('is total − PV', () => {
    expect(interestCents(1_088_934, 1_000_000)).toBe(88_934);
    expect(interestCents(680_412, 600_000)).toBe(80_412);
  });

  it('is −4 cents for the zero-rate "dízima" row, where 12 × 833,33 falls short of 10.000,00', () => {
    expect(interestCents(999_996, 1_000_000)).toBe(-4);
  });
});
