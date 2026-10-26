import { describe, expect, it } from 'vitest';

import { TREATMENT_MIN_CENTS } from './limits';
import { summarizeConsultation } from './summarize';
import type { LenderResult, LenderStatus, ReasonCode } from './types';

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
  row(id, { status: 'approved', approvedAmountCents, latencyMs: 1200 });
const refused = (id: LenderId, reasonCode: ReasonCode): LenderResult =>
  row(id, { status: 'refused', reasonCode, latencyMs: 900 });
const unavailable = (id: LenderId, reasonCode: 'http_500' | 'timeout'): LenderResult =>
  // docs/07 §4.12: a timeout is recorded with latency_ms = 10000 (the deadline).
  row(id, { status: 'unavailable', reasonCode, latencyMs: reasonCode === 'timeout' ? 10_000 : 6_500 });
const querying = (id: LenderId): LenderResult => row(id, { status: 'querying' });

// docs/05 "Cenários forçados": persona A is 30 years old, income R$ 5.000, treatment R$ 15.000.
const PERSONA_A_TREATMENT_CENTS = 1_500_000;
const PERSONA_A_BETA_PARTIAL_CENTS = 900_000; // 60% of R$ 15.000 = R$ 9.000 (partial)

// docs/05 persona B, no preset: 22 years old, income R$ 1.500, treatment R$ 25.000.
const PERSONA_B_TREATMENT_CENTS = 2_500_000;
const PERSONA_B_BETA_APPROVED_CENTS = 1_500_000; // 60% of R$ 25.000 = R$ 15.000

// docs/05 "Fronteiras de valor": R$ 20.000,01 is the first amount Gama refuses.
const GAMA_FIRST_REFUSED_AMOUNT_CENTS = 2_000_001;

describe('summarizeConsultation', () => {
  describe('counts', () => {
    it('counts each status from the rows; querying is pending', () => {
      const summary = summarizeConsultation(
        [
          approved('alfa', PERSONA_A_TREATMENT_CENTS),
          refused('gama', 'age_below_min'),
          unavailable('delta', 'timeout'),
          querying('beta'),
        ],
        PERSONA_A_TREATMENT_CENTS,
      );

      expect(summary).toEqual({
        approvedCount: 1,
        refusedCount: 1,
        unavailableCount: 1,
        pendingCount: 1,
        outcome: 'offers',
        nextStep: 'choose',
      });
    });

    it('with no rows at all reports zero counts, none_approved and retry', () => {
      // Decision: an empty list cannot blame income or amount, so the safe suggestion is to consult again.
      expect(summarizeConsultation([], PERSONA_A_TREATMENT_CENTS)).toEqual({
        approvedCount: 0,
        refusedCount: 0,
        unavailableCount: 0,
        pendingCount: 0,
        outcome: 'none_approved',
        nextStep: 'retry',
      });
    });
  });

  describe('outcome', () => {
    it.each([
      {
        name: 'all four still querying → pending',
        lenders: [querying('alfa'), querying('beta'), querying('gama'), querying('delta')],
        outcome: 'pending',
      },
      {
        name: 'three refused and one still querying → pending (no approval yet)',
        lenders: [refused('alfa', 'forced'), refused('beta', 'forced'), refused('gama', 'forced'), querying('delta')],
        outcome: 'pending',
      },
      {
        name: 'one approval while three are querying → offers (approval wins, docs/04 premise 3)',
        lenders: [approved('alfa', PERSONA_A_TREATMENT_CENTS), querying('beta'), querying('gama'), querying('delta')],
        outcome: 'offers',
      },
      {
        name: 'two refused and two unavailable → none_approved (both count as "did not approve", docs/04 premise 2)',
        lenders: [
          refused('alfa', 'forced'),
          refused('beta', 'forced'),
          unavailable('gama', 'http_500'),
          unavailable('delta', 'timeout'),
        ],
        outcome: 'none_approved',
      },
      {
        name: 'all four unavailable → none_approved',
        lenders: [
          unavailable('alfa', 'http_500'),
          unavailable('beta', 'timeout'),
          unavailable('gama', 'http_500'),
          unavailable('delta', 'timeout'),
        ],
        outcome: 'none_approved',
      },
    ])('$name', ({ lenders, outcome }) => {
      expect(summarizeConsultation(lenders, PERSONA_A_TREATMENT_CENTS).outcome).toBe(outcome);
    });
  });

  describe('nextStep', () => {
    it('is "choose" when there are offers (persona B: Beta approves while Delta is still querying)', () => {
      const summary = summarizeConsultation(
        [
          refused('alfa', 'income_insufficient'), // 1.500 × 10 = 15.000 < 25.000
          approved('beta', PERSONA_B_BETA_APPROVED_CENTS),
          refused('gama', 'age_below_min'), // 22 < 25 (checked before the amount)
          querying('delta'),
        ],
        PERSONA_B_TREATMENT_CENTS,
      );

      expect(summary.outcome).toBe('offers');
      expect(summary.nextStep).toBe('choose');
    });

    it('is "wait" while the consultation is pending', () => {
      const summary = summarizeConsultation(
        [refused('alfa', 'income_insufficient'), querying('beta'), querying('gama'), querying('delta')],
        PERSONA_B_TREATMENT_CENTS,
      );

      expect(summary.outcome).toBe('pending');
      expect(summary.nextStep).toBe('wait');
    });

    describe('when none approved (docs/02 trap 11)', () => {
      it.each([
        {
          name: 'only unavailable lenders → retry (a smaller amount does not fix an outage)',
          lenders: [
            unavailable('alfa', 'http_500'),
            unavailable('beta', 'timeout'),
            unavailable('gama', 'http_500'),
            unavailable('delta', 'timeout'),
          ],
          treatmentAmountCents: PERSONA_A_TREATMENT_CENTS,
          nextStep: 'retry',
        },
        {
          name: 'only Gama refused, by age, the rest unavailable → retry',
          lenders: [
            unavailable('alfa', 'timeout'),
            unavailable('beta', 'http_500'),
            refused('gama', 'age_below_min'),
            unavailable('delta', 'timeout'),
          ],
          treatmentAmountCents: PERSONA_A_TREATMENT_CENTS,
          nextStep: 'retry',
        },
        {
          name: 'refusals only by age and forced → retry',
          lenders: [
            refused('alfa', 'forced'),
            refused('beta', 'forced'),
            refused('gama', 'age_below_min'),
            refused('delta', 'forced'),
          ],
          treatmentAmountCents: PERSONA_A_TREATMENT_CENTS,
          nextStep: 'retry',
        },
        {
          name: 'Alfa refused by income, the rest unavailable → lower_amount',
          lenders: [
            refused('alfa', 'income_insufficient'),
            unavailable('beta', 'timeout'),
            unavailable('gama', 'http_500'),
            unavailable('delta', 'timeout'),
          ],
          treatmentAmountCents: PERSONA_A_TREATMENT_CENTS,
          nextStep: 'lower_amount',
        },
        {
          name: 'Gama refused by amount at R$ 20.000,01, the rest unavailable → lower_amount',
          lenders: [
            unavailable('alfa', 'http_500'),
            unavailable('beta', 'timeout'),
            refused('gama', 'amount_above_limit'),
            unavailable('delta', 'http_500'),
          ],
          treatmentAmountCents: GAMA_FIRST_REFUSED_AMOUNT_CENTS,
          nextStep: 'lower_amount',
        },
        {
          name: 'mixed refusals, age and income → lower_amount (one refusal by income is enough)',
          lenders: [
            refused('alfa', 'income_insufficient'),
            refused('beta', 'forced'),
            refused('gama', 'age_below_min'),
            unavailable('delta', 'timeout'),
          ],
          treatmentAmountCents: PERSONA_A_TREATMENT_CENTS,
          nextStep: 'lower_amount',
        },
        {
          name: 'refused by income but the amount is already the minimum (R$ 1.000,00) → retry',
          lenders: [
            refused('alfa', 'income_insufficient'), // income below R$ 100 (docs/05, Alfa rule)
            unavailable('beta', 'timeout'),
            refused('gama', 'forced'),
            unavailable('delta', 'http_500'),
          ],
          treatmentAmountCents: TREATMENT_MIN_CENTS,
          nextStep: 'retry',
        },
        {
          name: 'refused by income one cent above the minimum (R$ 1.000,01) → lower_amount',
          lenders: [
            refused('alfa', 'income_insufficient'),
            unavailable('beta', 'timeout'),
            refused('gama', 'forced'),
            unavailable('delta', 'http_500'),
          ],
          treatmentAmountCents: TREATMENT_MIN_CENTS + 1,
          nextStep: 'lower_amount',
        },
        {
          name: 'a reason code we do not know → retry (only income/amount justify a smaller amount)',
          lenders: [
            refused('alfa', 'new_lender_rule'),
            refused('beta', 'forced'),
            refused('gama', 'forced'),
            refused('delta', 'forced'),
          ],
          treatmentAmountCents: PERSONA_A_TREATMENT_CENTS,
          nextStep: 'retry',
        },
        {
          name: 'an income code on a row that is not a refusal is ignored → retry',
          lenders: [
            row('alfa', { status: 'unavailable', reasonCode: 'income_insufficient', latencyMs: 6_500 }),
            unavailable('beta', 'timeout'),
            unavailable('gama', 'http_500'),
            unavailable('delta', 'timeout'),
          ],
          treatmentAmountCents: PERSONA_A_TREATMENT_CENTS,
          nextStep: 'retry',
        },
      ])('$name', ({ lenders, treatmentAmountCents, nextStep }) => {
        const summary = summarizeConsultation(lenders, treatmentAmountCents);

        expect(summary.outcome).toBe('none_approved');
        expect(summary.nextStep).toBe(nextStep);
      });
    });
  });

  describe('forced scenarios of docs/05, persona A', () => {
    // docs/05 counts offers (12/9/9/0): every lender offers 3 terms, so 4/3/3/0 approvals.
    const approvedTrio = [
      approved('alfa', PERSONA_A_TREATMENT_CENTS),
      approved('beta', PERSONA_A_BETA_PARTIAL_CENTS),
      approved('gama', PERSONA_A_TREATMENT_CENTS),
    ];

    it.each([
      {
        preset: 'all_approve (12 offers)',
        lenders: [...approvedTrio, approved('delta', PERSONA_A_TREATMENT_CENTS)],
        expected: { approvedCount: 4, refusedCount: 0, unavailableCount: 0, outcome: 'offers', nextStep: 'choose' },
      },
      {
        preset: 'delta_error (9 offers, Delta unavailable with http_500)',
        lenders: [...approvedTrio, unavailable('delta', 'http_500')],
        expected: { approvedCount: 3, refusedCount: 0, unavailableCount: 1, outcome: 'offers', nextStep: 'choose' },
      },
      {
        preset: 'delta_timeout (9 offers, Delta unavailable with timeout at 10 s)',
        lenders: [...approvedTrio, unavailable('delta', 'timeout')],
        expected: { approvedCount: 3, refusedCount: 0, unavailableCount: 1, outcome: 'offers', nextStep: 'choose' },
      },
      {
        // The preset refuses all four with reasonCode 'forced', which is neither 'income_insufficient'
        // nor 'amount_above_limit': a smaller amount would not change a forced refusal, so the next
        // step is 'retry' (consult again), not 'lower_amount', even though R$ 15.000 > R$ 1.000.
        preset: 'none_approve (0 offers, four forced refusals)',
        lenders: [refused('alfa', 'forced'), refused('beta', 'forced'), refused('gama', 'forced'), refused('delta', 'forced')],
        expected: { approvedCount: 0, refusedCount: 4, unavailableCount: 0, outcome: 'none_approved', nextStep: 'retry' },
      },
    ])('$preset', ({ lenders, expected }) => {
      expect(summarizeConsultation(lenders, PERSONA_A_TREATMENT_CENTS)).toEqual({ ...expected, pendingCount: 0 });
    });
  });
});
