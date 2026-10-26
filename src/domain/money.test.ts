import { describe, expect, it } from 'vitest';
import { capPercentCents, formatBRL, parseBRL, percentCovered } from './money';

/** Intl separates "R$" from the digits with a non-breaking space; normalize it so expectations read naturally. */
const withPlainSpace = (text: string): string => text.replace(/\u00A0/g, ' ');

describe('parseBRL', () => {
  it.each([
    ['R$ 1.234,56', 123456],
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['1234', 123400],
    ['R$1.000', 100000],
    ['1.000', 100000],
    ['10', 1000],
    ['0,01', 1],
    ['1,5', 150],
    ['0', 0],
    ['  R$ 1.234,56  ', 123456],
    ['\u00A0R$\u00A01.234,56\u00A0', 123456],
    ['1.234.567,89', 123456789],
    // docs/05 fixtures: Beta cap table, value boundaries and the Alfa float trap
    ['33.333,33', 3333333],
    ['1.000,01', 100001],
    ['10.000,00', 1000000],
    ['999,99', 99999],
    ['1.000,00', 100000],
    ['20.000,00', 2000000],
    ['20.000,01', 2000001],
    ['50.000,00', 5000000],
    ['50.000,01', 5000001],
    ['12.345,60', 1234560],
  ])('parses %j to %i cents', (input, expected) => {
    expect(parseBRL(input)).toBe(expected);
  });

  it.each([
    ['', 'empty'],
    ['   ', 'only spaces'],
    ['R$', 'prefix without digits'],
    ['R$ ', 'prefix without digits'],
    ['-10', 'negative'],
    ['-R$ 5,00', 'negative in the Intl shape'],
    ['R$ -10,00', 'negative after the prefix'],
    ['abc', 'letters'],
    ['10 reais', 'letters after digits'],
    ['R$ 10,00 x', 'letter after the amount'],
    ['1,234.56', 'ambiguous: en-US separators'],
    ['1234.56', 'ambiguous: dot as decimal separator'],
    ['12.34', 'ambiguous: dot followed by two digits'],
    ['1.2345', 'ambiguous: dot followed by four digits'],
    ['1,234', 'more than two decimals'],
    ['1,', 'dangling decimal separator'],
    [',50', 'missing integer part'],
    ['1.', 'dangling thousands separator'],
    ['1 000,00', 'space as thousands separator'],
    ['1e3', 'exponent'],
    ['0x10', 'hexadecimal'],
    ['NaN', 'NaN'],
    ['Infinity', 'Infinity'],
    ['99.999.999.999.999.999', 'beyond the safe integer range'],
  ])('rejects %j (%s)', (input) => {
    expect(parseBRL(input)).toBeNull();
  });

  it('keeps the Alfa rule exact: income × 10 ≥ treatment holds in cents and fails in reais (docs/02 §8)', () => {
    expect(parseBRL('R$ 1.234,56')).toBe(123456);
    expect(parseBRL('R$ 12.345,60')).toBe(1234560);
    expect(123456 * 10 >= 1234560).toBe(true);
    // The same comparison in reais: 1234.56 * 10 === 12345.599999999999.
    expect(1234.56 * 10 >= 12345.6).toBe(false);
  });
});

describe('formatBRL', () => {
  it.each([
    [0, 'R$ 0,00'],
    [1, 'R$ 0,01'],
    [1000, 'R$ 10,00'],
    [123456, 'R$ 1.234,56'],
    [60000, 'R$ 600,00'],
    [600000, 'R$ 6.000,00'],
    [1000000, 'R$ 10.000,00'],
    [1999999, 'R$ 19.999,99'],
    [5000000, 'R$ 50.000,00'],
    [123456789, 'R$ 1.234.567,89'],
  ])('formats %i cents as %s', (cents, expected) => {
    expect(withPlainSpace(formatBRL(cents))).toBe(expected);
  });

  it('separates R$ from the amount with a non-breaking space (U+00A0)', () => {
    expect(formatBRL(123456)).toBe('R$\u00A01.234,56');
  });

  it.each([0, 1, 99, 100, 1000, 100000, 123456, 1234560, 1999999, 3333333, 5000001])(
    'round-trips %i cents through parseBRL',
    (cents) => {
      expect(parseBRL(formatBRL(cents))).toBe(cents);
    },
  );

  it.each([1.5, 0.1 + 0.2, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'throws RangeError for %s',
    (cents) => {
      expect(() => formatBRL(cents)).toThrow(RangeError);
    },
  );
});

describe('capPercentCents', () => {
  it.each([
    // docs/05 "Arredondamento do teto da Beta": 60% exact, rounded down (half-up would differ in the first two)
    [3333333, 60, 1999999], // 33.333,33 → 19.999,998 → 19.999,99 (half-up: 20.000,00)
    [100001, 60, 60000], // 1.000,01 → 600,006 → 600,00 (half-up: 600,01)
    [1000000, 60, 600000], // 10.000,00 → 6.000,00
    // Other Beta approvals in docs/05
    [100000, 60, 60000], // treatment 1.000,00 → PV 600,00
    [1500000, 60, 900000], // persona A: 15.000 → 9.000
    [2500000, 60, 1500000], // persona B: 25.000 → 15.000
    [5000000, 60, 3000000], // 50.000 → 30.000
    // Percentage boundaries
    [123456, 0, 0],
    [123456, 100, 123456],
    [1, 1, 0],
    [0, 60, 0],
  ])('caps %i cents at %i%% → %i cents', (cents, percent, expected) => {
    expect(capPercentCents(cents, percent)).toBe(expected);
  });

  it.each([
    [1.5, 60, 'cents is not an integer'],
    [100, 60.5, 'percent is not an integer'],
    [100, -1, 'percent below 0'],
    [100, 101, 'percent above 100'],
    [NaN, 60, 'cents is NaN'],
    [100, NaN, 'percent is NaN'],
    [Infinity, 60, 'cents is infinite'],
  ])('throws RangeError for (%s, %s): %s', (cents, percent) => {
    expect(() => capPercentCents(cents, percent)).toThrow(RangeError);
  });
});

describe('percentCovered', () => {
  it.each([
    [600000, 1000000, 60], // Beta covers 6.000 of 10.000
    [999999, 1000000, 99], // one cent short is still 99, never rounded up
    [1000000, 1000000, 100],
    [1500000, 1000000, 100], // more than the whole is capped at 100
    [0, 1000000, 0],
    [1, 1000000, 0],
    [900000, 1500000, 60], // persona A
    [1500000, 2500000, 60], // persona B
    [1, 0, 0], // no positive whole: 0, never a division by zero
    [1, -100, 0],
    [-1, 100, 0], // never negative
  ])('percentCovered(%i, %i) → %i', (part, whole, expected) => {
    expect(percentCovered(part, whole)).toBe(expected);
  });
});
