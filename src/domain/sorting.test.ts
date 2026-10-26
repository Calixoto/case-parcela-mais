import { describe, expect, it } from 'vitest';

import { buildOffers } from './offers';
import { sortOffers } from './sorting';
import type { LenderResult, Offer, SortCriterion } from './types';

// ---------------------------------------------------------------------------
// Fixtures: the 12 offers of docs/05 "Tabela Price de referência" (treatment R$ 10.000; Alfa, Gama
// and Delta approve R$ 10.000, Beta approves 60% = R$ 6.000), built by `buildOffers`, whose own
// test proves every amount against the doc. Frozen: `sortOffers` must never touch its input.
// ---------------------------------------------------------------------------

function approved(
  lenderId: string,
  lenderName: string,
  approvedAmountCents: number,
  monthlyRate: number,
  termsMonths: readonly number[],
): LenderResult {
  return { lenderId, lenderName, status: 'approved', reasonCode: null, approvedAmountCents, monthlyRate, termsMonths, latencyMs: 1_200 };
}

const REFERENCE_OFFERS: readonly Offer[] = Object.freeze(
  buildOffers(
    [
      approved('alfa', 'Alfa', 1_000_000, 0.0249, [6, 12, 18]),
      approved('beta', 'Beta', 600_000, 0.0199, [12, 18, 24]),
      approved('gama', 'Gama', 1_000_000, 0.0329, [6, 10, 12]),
      approved('delta', 'Delta', 1_000_000, 0.0219, [12, 24, 36]),
    ],
    1_000_000,
  ),
);

/** docs/05 "Por menor parcela": [lender, term, installment in cents]. */
const BY_INSTALLMENT = [
  ['Beta', 24, 31_687],
  ['Beta', 18, 39_986],
  ['Delta', 36, 40_440],
  ['Delta', 24, 54_016],
  ['Beta', 12, 56_701],
  ['Alfa', 18, 69_610],
  ['Delta', 12, 95_666],
  ['Alfa', 12, 97_428],
  ['Gama', 12, 102_209],
  ['Gama', 10, 118_972],
  ['Alfa', 6, 181_489],
  ['Gama', 6, 186_376],
];

/** docs/05 "Por menor custo total": [lender, term, total in cents]. */
const BY_TOTAL = [
  ['Beta', 12, 680_412],
  ['Beta', 18, 719_748],
  ['Beta', 24, 760_488],
  ['Alfa', 6, 1_088_934],
  ['Gama', 6, 1_118_256],
  ['Delta', 12, 1_147_992],
  ['Alfa', 12, 1_169_136],
  ['Gama', 10, 1_189_720],
  ['Gama', 12, 1_226_508],
  ['Alfa', 18, 1_252_980],
  ['Delta', 24, 1_296_384],
  ['Delta', 36, 1_455_840],
];

/** A full-coverage Alfa 12x offer to derive tie-breaker cases from. */
const BASE_OFFER: Offer = {
  lenderId: 'alfa',
  lenderName: 'Alfa',
  termMonths: 12,
  financedAmountCents: 1_000_000,
  monthlyRate: 0.0249,
  installmentCents: 97_428,
  totalCents: 1_169_136,
  interestCents: 169_136,
  coveragePercent: 100,
  uncoveredCents: 0,
  isPartial: false,
};

const offer = (overrides: Partial<Offer>): Offer => ({ ...BASE_OFFER, ...overrides });

describe('sortOffers: "Ordenações esperadas" (docs/05)', () => {
  it.each([
    ['installment', 'installmentCents', BY_INSTALLMENT],
    ['total', 'totalCents', BY_TOTAL],
  ] as const)('by %s returns exactly the 12-line list of docs/05', (criterion, key, expected) => {
    const sorted = sortOffers(REFERENCE_OFFERS, criterion);

    expect(sorted.map((o) => [o.lenderName, o.termMonths, o[key]])).toEqual(expected);
  });

  it('Beta leads both lists only because it finances less: its rows are partial (docs/02 trap 6)', () => {
    const [cheapestInstallment] = sortOffers(REFERENCE_OFFERS, 'installment');
    const [cheapestTotal] = sortOffers(REFERENCE_OFFERS, 'total');

    expect(cheapestInstallment).toMatchObject({ lenderName: 'Beta', termMonths: 24, isPartial: true, uncoveredCents: 400_000 });
    expect(cheapestTotal).toMatchObject({ lenderName: 'Beta', termMonths: 12, isPartial: true, uncoveredCents: 400_000 });
  });

  it.each(['installment', 'total'] as const)('by %s does not depend on the input order', (criterion) => {
    const reversed = [...REFERENCE_OFFERS].reverse();
    const interleaved = REFERENCE_OFFERS.filter((_, i) => i % 2 === 0).concat(REFERENCE_OFFERS.filter((_, i) => i % 2 === 1));

    const expected = sortOffers(REFERENCE_OFFERS, criterion);

    expect(sortOffers(reversed, criterion)).toEqual(expected);
    expect(sortOffers(interleaved, criterion)).toEqual(expected);
  });
});

describe('sortOffers: never mutates, always returns a new array', () => {
  it.each(['installment', 'total'] as const)('by %s', (criterion) => {
    const input = [...REFERENCE_OFFERS];
    const snapshot = [...input];

    const sorted = sortOffers(input, criterion);

    expect(sorted).not.toBe(input);
    expect(input).toEqual(snapshot);
    expect(sorted).not.toEqual(input); // the registry order is not a sorted order
  });

  it('accepts a frozen input (which would throw on any in-place sort)', () => {
    expect(Object.isFrozen(REFERENCE_OFFERS)).toBe(true);
    expect(() => sortOffers(REFERENCE_OFFERS, 'installment')).not.toThrow();
  });

  it('returns a new, empty array for an empty input', () => {
    const input: Offer[] = [];

    const sorted = sortOffers(input, 'installment');

    expect(sorted).toEqual([]);
    expect(sorted).not.toBe(input);
  });
});

describe('sortOffers: tie-breakers (docs/04 "Ordenação padrão e desempate")', () => {
  it('by installment, equal installments are broken by the total', () => {
    const dearer = offer({ lenderId: 'x', totalCents: 1_169_137 });
    const cheaper = offer({ lenderId: 'y', totalCents: 1_169_136 });

    expect(sortOffers([dearer, cheaper], 'installment')).toEqual([cheaper, dearer]);
  });

  it('by total, equal totals are broken by the installment', () => {
    const dearer = offer({ lenderId: 'x', installmentCents: 97_429 });
    const cheaper = offer({ lenderId: 'y', installmentCents: 97_428 });

    expect(sortOffers([dearer, cheaper], 'total')).toEqual([cheaper, dearer]);
  });

  it.each(['installment', 'total'] as const)('by %s, equal amounts are broken by the lower rate', (criterion) => {
    const higherRate = offer({ lenderId: 'x', monthlyRate: 0.0329 });
    const lowerRate = offer({ lenderId: 'y', monthlyRate: 0.0219 });

    expect(sortOffers([higherRate, lowerRate], criterion)).toEqual([lowerRate, higherRate]);
  });

  it.each(['installment', 'total'] as const)('by %s, equal amounts and rate are broken by the name in pt-BR order', (criterion) => {
    // By UTF-16 code units 'Zeta' < 'Ômega' (Z is U+005A, Ô is U+00D4); pt-BR collation puts Ômega first.
    const zeta = offer({ lenderId: 'x', lenderName: 'Zeta' });
    const omega = offer({ lenderId: 'y', lenderName: 'Ômega' });
    const lowercase = offer({ lenderId: 'z', lenderName: 'alfa' });

    expect(sortOffers([zeta, omega, lowercase], criterion).map((o) => o.lenderName)).toEqual(['alfa', 'Ômega', 'Zeta']);
  });

  it.each(['installment', 'total'] as const)('by %s, equal amounts, rate and name are broken by the shorter term', (criterion) => {
    const longer = offer({ lenderId: 'x', termMonths: 24 });
    const shorter = offer({ lenderId: 'y', termMonths: 12 });

    expect(sortOffers([longer, shorter], criterion)).toEqual([shorter, longer]);
  });

  it.each(['installment', 'total'] as const)('by %s, offers equal on every key keep their input order (stable)', (criterion) => {
    const first = offer({ lenderId: 'first' });
    const second = offer({ lenderId: 'second' });

    expect(sortOffers([first, second], criterion)).toEqual([first, second]);
    expect(sortOffers([second, first], criterion)).toEqual([second, first]);
  });
});

describe('sortOffers: criterion', () => {
  it.each(['interest', 'INSTALLMENT', ''])('rejects "%s", which is not a SortCriterion', (criterion) => {
    expect(() => sortOffers(REFERENCE_OFFERS, criterion as SortCriterion)).toThrow(RangeError);
  });
});
