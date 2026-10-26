import { describe, expect, it } from 'vitest';
import type { QuoteInput } from '@/src/domain/types';
import { ALFA_INCOME_FACTOR, alfa } from './alfa';
import { BETA_CAP_PERCENT, beta } from './beta';
import { delta } from './delta';
import { GAMA_MAX_AMOUNT_CENTS, GAMA_MIN_AGE_YEARS, gama } from './gama';
import { LENDERS } from './registry';

const base: QuoteInput = { treatmentAmountCents: 1_000_000, monthlyIncomeCents: 300_000, ageYears: 30 };

describe('registry', () => {
  it('lists the four lenders of the case in display order', () => {
    expect(LENDERS.map((lender) => lender.id)).toEqual(['alfa', 'beta', 'gama', 'delta']);
    expect(new Set(LENDERS.map((lender) => lender.id)).size).toBe(4);
  });

  it('keeps terms ascending and rates as decimals', () => {
    for (const lender of LENDERS) {
      expect([...lender.termsMonths]).toEqual([...lender.termsMonths].sort((a, b) => a - b));
      expect(lender.monthlyRate).toBeGreaterThan(0);
      expect(lender.monthlyRate).toBeLessThan(1);
      expect(lender.minDelayMs).toBeLessThanOrEqual(lender.maxDelayMs);
    }
  });
});

describe('Alfa: income × 10 ≥ treatment', () => {
  it('approves 100% exactly at the boundary, in integer cents (docs/05 float trap)', () => {
    expect(ALFA_INCOME_FACTOR).toBe(10);
    expect(alfa.decide({ ...base, monthlyIncomeCents: 123_456, treatmentAmountCents: 1_234_560 })).toEqual({
      outcome: 'approved',
      approvedAmountCents: 1_234_560,
    });
  });

  it('refuses one cent below', () => {
    expect(alfa.decide({ ...base, monthlyIncomeCents: 123_455, treatmentAmountCents: 1_234_560 })).toEqual({
      outcome: 'refused',
      reasonCode: 'income_insufficient',
    });
  });
});

describe('Beta: always approves at most 60%, rounded down', () => {
  it.each([
    [1_000_000, 600_000],
    [3_333_333, 1_999_999],
    [100_001, 60_000],
    [1_500_000, 900_000],
  ])('treatment %i cents → %i cents', (treatment, expected) => {
    expect(BETA_CAP_PERCENT).toBe(60);
    expect(beta.decide({ ...base, treatmentAmountCents: treatment })).toEqual({ outcome: 'approved', approvedAmountCents: expected });
  });
});

describe('Gama: age ≥ 25 and amount ≤ R$ 20.000,00', () => {
  it('approves at 25 years and R$ 20.000,00 exactly', () => {
    expect(GAMA_MIN_AGE_YEARS).toBe(25);
    expect(GAMA_MAX_AMOUNT_CENTS).toBe(2_000_000);
    expect(gama.decide({ ...base, ageYears: 25, treatmentAmountCents: 2_000_000 })).toEqual({ outcome: 'approved', approvedAmountCents: 2_000_000 });
  });

  it('refuses at 24 years', () => {
    expect(gama.decide({ ...base, ageYears: 24 })).toEqual({ outcome: 'refused', reasonCode: 'age_below_min' });
  });

  it('refuses at R$ 20.000,01', () => {
    expect(gama.decide({ ...base, treatmentAmountCents: 2_000_001 })).toEqual({ outcome: 'refused', reasonCode: 'amount_above_limit' });
  });

  it('reports the age first when both rules fail', () => {
    expect(gama.decide({ ...base, ageYears: 22, treatmentAmountCents: 2_500_000 })).toEqual({ outcome: 'refused', reasonCode: 'age_below_min' });
  });
});

describe('Delta: approves 100% when it answers', () => {
  it('approves the full amount and fails in 30% of the calls, up to 15 s', () => {
    expect(delta.decide(base)).toEqual({ outcome: 'approved', approvedAmountCents: 1_000_000 });
    expect(delta.failureRate).toBe(0.3);
    expect(delta.maxDelayMs).toBeGreaterThan(10_000);
  });
});
