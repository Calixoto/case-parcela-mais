import { describe, expect, it } from 'vitest';

import { buildOffers } from './offers';
import type { LenderResult, LenderStatus, Offer, ReasonCode } from './types';

// ---------------------------------------------------------------------------
// Fixtures: the four lenders of the case (rates and terms from docs/05, Price table).
// ---------------------------------------------------------------------------

const LENDERS = {
  alfa: { lenderName: 'Alfa', monthlyRate: 0.0249, termsMonths: [6, 12, 18] },
  beta: { lenderName: 'Beta', monthlyRate: 0.0199, termsMonths: [12, 18, 24] },
  gama: { lenderName: 'Gama', monthlyRate: 0.0329, termsMonths: [6, 10, 12] },
  delta: { lenderName: 'Delta', monthlyRate: 0.0219, termsMonths: [12, 24, 36] },
} as const;

type LenderId = keyof typeof LENDERS;

function row(lenderId: LenderId, overrides: Partial<LenderResult> & { status: LenderStatus }): LenderResult {
  const { lenderName, monthlyRate, termsMonths } = LENDERS[lenderId];
  return {
    lenderId,
    lenderName,
    reasonCode: null,
    approvedAmountCents: null,
    monthlyRate,
    termsMonths,
    latencyMs: null,
    ...overrides,
  };
}

const approved = (id: LenderId, approvedAmountCents: number): LenderResult =>
  row(id, { status: 'approved', approvedAmountCents, latencyMs: 1_200 });
const refused = (id: LenderId, reasonCode: ReasonCode): LenderResult =>
  row(id, { status: 'refused', reasonCode, latencyMs: 900 });
const unavailable = (id: LenderId, reasonCode: 'http_500' | 'timeout'): LenderResult =>
  row(id, { status: 'unavailable', reasonCode, latencyMs: reasonCode === 'timeout' ? 10_000 : 6_500 });
const querying = (id: LenderId): LenderResult => row(id, { status: 'querying' });

// docs/05 "Tabela Price de referência": patient aged 30, income R$ 3.000, treatment R$ 10.000,
// all four approving. Alfa, Gama and Delta approve R$ 10.000; Beta approves 60% = R$ 6.000.
const TREATMENT_CENTS = 1_000_000;
const BETA_APPROVED_CENTS = 600_000;

const ALL_APPROVE: readonly LenderResult[] = [
  approved('alfa', TREATMENT_CENTS),
  approved('beta', BETA_APPROVED_CENTS),
  approved('gama', TREATMENT_CENTS),
  approved('delta', TREATMENT_CENTS),
];

/** The 12 rows of docs/05, in cents, in registry order with terms ascending. */
const referenceTable = [
  { lender: 'Alfa', rate: 0.0249, financed: 1_000_000, termMonths: 6, installment: 181_489, total: 1_088_934, interest: 88_934 },
  { lender: 'Alfa', rate: 0.0249, financed: 1_000_000, termMonths: 12, installment: 97_428, total: 1_169_136, interest: 169_136 },
  { lender: 'Alfa', rate: 0.0249, financed: 1_000_000, termMonths: 18, installment: 69_610, total: 1_252_980, interest: 252_980 },
  { lender: 'Beta', rate: 0.0199, financed: 600_000, termMonths: 12, installment: 56_701, total: 680_412, interest: 80_412 },
  { lender: 'Beta', rate: 0.0199, financed: 600_000, termMonths: 18, installment: 39_986, total: 719_748, interest: 119_748 },
  { lender: 'Beta', rate: 0.0199, financed: 600_000, termMonths: 24, installment: 31_687, total: 760_488, interest: 160_488 },
  { lender: 'Gama', rate: 0.0329, financed: 1_000_000, termMonths: 6, installment: 186_376, total: 1_118_256, interest: 118_256 },
  { lender: 'Gama', rate: 0.0329, financed: 1_000_000, termMonths: 10, installment: 118_972, total: 1_189_720, interest: 189_720 },
  { lender: 'Gama', rate: 0.0329, financed: 1_000_000, termMonths: 12, installment: 102_209, total: 1_226_508, interest: 226_508 },
  { lender: 'Delta', rate: 0.0219, financed: 1_000_000, termMonths: 12, installment: 95_666, total: 1_147_992, interest: 147_992 },
  { lender: 'Delta', rate: 0.0219, financed: 1_000_000, termMonths: 24, installment: 54_016, total: 1_296_384, interest: 296_384 },
  { lender: 'Delta', rate: 0.0219, financed: 1_000_000, termMonths: 36, installment: 40_440, total: 1_455_840, interest: 455_840 },
];

const label = (offer: Offer): string => `${offer.lenderName} ${offer.termMonths}x`;

describe('buildOffers: "Tabela Price de referência" (docs/05)', () => {
  const offers = buildOffers(ALL_APPROVE, TREATMENT_CENTS);

  it('builds the 12 offers in registry order, each lender with its terms ascending', () => {
    expect(offers.map(label)).toEqual(referenceTable.map((r) => `${r.lender} ${r.termMonths}x`));
  });

  it.each(referenceTable)(
    '$lender $termMonths x → installment $installment, total $total, interest $interest',
    ({ lender, rate, financed, termMonths, installment, total, interest }) => {
      const offer = offers.find((o) => o.lenderName === lender && o.termMonths === termMonths);

      expect(offer).toMatchObject({
        lenderId: lender.toLowerCase(),
        monthlyRate: rate,
        financedAmountCents: financed,
        installmentCents: installment,
        totalCents: total,
        interestCents: interest,
      });
    },
  );

  it('Beta finances the approved R$ 6.000, never the R$ 10.000 treatment (docs/02 trap 7)', () => {
    const beta12 = offers.find((o) => o.lenderName === 'Beta' && o.termMonths === 12);

    expect(beta12?.financedAmountCents).toBe(600_000);
    expect(beta12?.installmentCents).toBe(56_701); // treatment as PV would give 94_502
  });

  it('Beta rows are partial: cover 60%, leaving R$ 4.000,00 uncovered (docs/02 trap 6)', () => {
    const betaRows = offers.filter((o) => o.lenderName === 'Beta');

    expect(betaRows).toHaveLength(3);
    for (const offer of betaRows) {
      expect(offer).toMatchObject({ coveragePercent: 60, uncoveredCents: 400_000, isPartial: true });
    }
  });

  it('rows that cover the whole treatment are not partial', () => {
    const fullRows = offers.filter((o) => o.lenderName !== 'Beta');

    expect(fullRows).toHaveLength(9);
    for (const offer of fullRows) {
      expect(offer).toMatchObject({ coveragePercent: 100, uncoveredCents: 0, isPartial: false });
    }
  });
});

describe('buildOffers: lenders that produce no offers (docs/02 trap 12)', () => {
  it.each([
    ['refused by income', refused('alfa', 'income_insufficient')],
    ['refused by age', refused('gama', 'age_below_min')],
    ['refused by a forced scenario', refused('beta', 'forced')],
    ['unavailable by error 500', unavailable('delta', 'http_500')],
    ['unavailable by timeout', unavailable('delta', 'timeout')],
    ['still querying', querying('delta')],
  ])('a lender %s produces no offer', (_label, lender) => {
    expect(buildOffers([lender], TREATMENT_CENTS)).toEqual([]);
  });

  it.each([
    ['without an approved amount', row('alfa', { status: 'approved', approvedAmountCents: null })],
    ['without a rate', row('alfa', { status: 'approved', approvedAmountCents: TREATMENT_CENTS, monthlyRate: null })],
  ])('an "approved" row %s is skipped, not an error', (_label, lender) => {
    expect(buildOffers([lender], TREATMENT_CENTS)).toEqual([]);
  });

  it('with no lenders at all returns an empty list', () => {
    expect(buildOffers([], TREATMENT_CENTS)).toEqual([]);
  });

  it('only the approved lenders contribute; the others keep their place out of the list', () => {
    const offers = buildOffers(
      [approved('alfa', TREATMENT_CENTS), refused('beta', 'forced'), querying('gama'), approved('delta', TREATMENT_CENTS)],
      TREATMENT_CENTS,
    );

    expect(offers.map(label)).toEqual(['Alfa 6x', 'Alfa 12x', 'Alfa 18x', 'Delta 12x', 'Delta 24x', 'Delta 36x']);
  });
});

describe('buildOffers: forced scenarios for persona A (docs/05 "Cenários forçados")', () => {
  // Persona A: 30 years old, income R$ 5.000, treatment R$ 15.000. Beta approves 60% = R$ 9.000.
  const PERSONA_A_TREATMENT_CENTS = 1_500_000;
  const PERSONA_A_BETA_CENTS = 900_000;

  it('"Todas aprovam": 12 offers, with the partial warning on Beta', () => {
    const offers = buildOffers(
      [
        approved('alfa', PERSONA_A_TREATMENT_CENTS),
        approved('beta', PERSONA_A_BETA_CENTS),
        approved('gama', PERSONA_A_TREATMENT_CENTS),
        approved('delta', PERSONA_A_TREATMENT_CENTS),
      ],
      PERSONA_A_TREATMENT_CENTS,
    );

    expect(offers).toHaveLength(12);
    expect(offers.filter((o) => o.isPartial).map(label)).toEqual(['Beta 12x', 'Beta 18x', 'Beta 24x']);
    expect(offers.find((o) => o.lenderName === 'Beta')).toMatchObject({ coveragePercent: 60, uncoveredCents: 600_000 });
  });

  it.each([
    ['"Delta falha"', unavailable('delta', 'http_500')],
    ['"Delta estoura o tempo"', unavailable('delta', 'timeout')],
  ])('%s: 9 offers', (_label, delta) => {
    const offers = buildOffers(
      [approved('alfa', PERSONA_A_TREATMENT_CENTS), approved('beta', PERSONA_A_BETA_CENTS), approved('gama', PERSONA_A_TREATMENT_CENTS), delta],
      PERSONA_A_TREATMENT_CENTS,
    );

    expect(offers).toHaveLength(9);
    expect(offers.some((o) => o.lenderName === 'Delta')).toBe(false);
  });

  it('"Nenhuma aprova": zero offers', () => {
    const offers = buildOffers(
      [refused('alfa', 'forced'), refused('beta', 'forced'), refused('gama', 'forced'), refused('delta', 'forced')],
      PERSONA_A_TREATMENT_CENTS,
    );

    expect(offers).toEqual([]);
  });
});

describe('buildOffers: coverage boundaries', () => {
  it.each([
    ['one cent short of the treatment', 999_999, { coveragePercent: 99, uncoveredCents: 1, isPartial: true }],
    ['exactly the treatment', 1_000_000, { coveragePercent: 100, uncoveredCents: 0, isPartial: false }],
    ['above the treatment (never happens, but must not go negative)', 1_000_001, { coveragePercent: 100, uncoveredCents: 0, isPartial: false }],
  ])('approved %s → %o', (_label, approvedAmountCents, expected) => {
    const [offer] = buildOffers([approved('alfa', approvedAmountCents)], TREATMENT_CENTS);

    expect(offer).toMatchObject(expected);
  });

  it('coverage is floored, never rounded up: Beta on R$ 33.333,33 approves R$ 19.999,99 (docs/05) and covers 59%', () => {
    const [offer] = buildOffers([approved('beta', 1_999_999)], 3_333_333);

    expect(offer).toMatchObject({ coveragePercent: 59, uncoveredCents: 1_333_334, isPartial: true });
  });
});

describe('buildOffers: terms', () => {
  it('orders the terms ascending even when the registry lists them otherwise, without touching the input', () => {
    const termsMonths = [18, 6, 12];
    const lender = row('alfa', { status: 'approved', approvedAmountCents: TREATMENT_CENTS, termsMonths });

    const offers = buildOffers([lender], TREATMENT_CENTS);

    expect(offers.map((o) => o.termMonths)).toEqual([6, 12, 18]);
    expect(termsMonths).toEqual([18, 6, 12]);
  });

  it('a lender with no terms produces no offers', () => {
    const lender = row('alfa', { status: 'approved', approvedAmountCents: TREATMENT_CENTS, termsMonths: [] });

    expect(buildOffers([lender], TREATMENT_CENTS)).toEqual([]);
  });
});

describe('buildOffers: feeCents (IOF / fixed fee hook, docs/03)', () => {
  const FEE_CENTS = 3_800; // R$ 38,00

  it('defaults to zero: omitted options and an empty options object give the same offers', () => {
    const plain = buildOffers(ALL_APPROVE, TREATMENT_CENTS);

    expect(buildOffers(ALL_APPROVE, TREATMENT_CENTS, {})).toEqual(plain);
    expect(buildOffers(ALL_APPROVE, TREATMENT_CENTS, { feeCents: 0 })).toEqual(plain);
  });

  it('adds the fee to the total and to the interest of every offer, not to the installment', () => {
    const plain = buildOffers(ALL_APPROVE, TREATMENT_CENTS);
    const withFee = buildOffers(ALL_APPROVE, TREATMENT_CENTS, { feeCents: FEE_CENTS });

    expect(withFee).toHaveLength(plain.length);
    withFee.forEach((offer, index) => {
      expect(offer.installmentCents).toBe(plain[index].installmentCents);
      expect(offer.totalCents).toBe(plain[index].totalCents + FEE_CENTS);
      expect(offer.interestCents).toBe(plain[index].interestCents + FEE_CENTS);
    });
    // Alfa 6x: 10.889,34 + 38,00 = 10.927,34; interest 889,34 + 38,00 = 927,34.
    expect(withFee[0]).toMatchObject({ installmentCents: 181_489, totalCents: 1_092_734, interestCents: 92_734 });
  });

  it.each([
    ['negative', -1],
    ['fractional cents', 0.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects a fee that is %s', (_label, feeCents) => {
    expect(() => buildOffers(ALL_APPROVE, TREATMENT_CENTS, { feeCents })).toThrow(RangeError);
  });
});

describe('buildOffers: zero rate, the interest-free promotion (docs/02 trap 7, docs/05 "Taxa zero")', () => {
  it('R$ 12.000 at 0% in 12x is 12 × R$ 1.000,00 with zero interest, not NaN', () => {
    const promo = row('alfa', { status: 'approved', approvedAmountCents: 1_200_000, monthlyRate: 0, termsMonths: [12] });

    expect(buildOffers([promo], 1_200_000)[0]).toMatchObject({
      installmentCents: 100_000,
      totalCents: 1_200_000,
      interestCents: 0,
    });
  });

  it('R$ 10.000 at 0% in 12x: 12 × 833,33 = 9.999,96, interest −4 cents ("Taxa zero com dízima")', () => {
    const promo = row('alfa', { status: 'approved', approvedAmountCents: 1_000_000, monthlyRate: 0, termsMonths: [12] });

    expect(buildOffers([promo], 1_000_000)[0]).toMatchObject({
      installmentCents: 83_333,
      totalCents: 999_996,
      interestCents: -4,
    });
  });
});

describe('buildOffers: a corrupt approval is reported, not hidden', () => {
  // Decision: an "approved" row with a zero amount or a rate in percent (2.49) is a bug upstream;
  // the Price validation throws and the error surfaces instead of a silently shorter list.
  it.each([
    ['a zero approved amount', { approvedAmountCents: 0 }],
    ['a rate given in percent (docs/02 trap 7)', { approvedAmountCents: TREATMENT_CENTS, monthlyRate: 2.49 }],
  ])('throws RangeError for %s', (_label, overrides) => {
    const lender = row('alfa', { status: 'approved', ...overrides });

    expect(() => buildOffers([lender], TREATMENT_CENTS)).toThrow(RangeError);
  });
});
