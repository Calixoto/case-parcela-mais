import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuoteInput } from '@/src/domain/types';
import { alfa } from './alfa';
import { delta } from './delta';
import { LenderHttpError } from './errors';
import { simulateLender } from './simulate';

const input: QuoteInput = { treatmentAmountCents: 1_500_000, monthlyIncomeCents: 500_000, ageYears: 30 };

function sequence(values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}

const context = (random: () => number, override?: Parameters<typeof simulateLender>[2]['override']) => ({
  random,
  setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
  override,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('simulateLender', () => {
  it('draws the delay first (uniform in the range) and answers with the real rule after it', async () => {
    const quote = simulateLender(alfa, input, context(sequence([0.5, 0.9])));
    await vi.advanceTimersByTimeAsync(999);
    let settled = false;
    void quote.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(quote).resolves.toEqual({
      decision: { outcome: 'approved', approvedAmountCents: 1_500_000 },
      monthlyRate: 0.0249,
      termsMonths: [6, 12, 18],
      delayMs: 1_000,
    });
  });

  it('decides the HTTP 500 up front (second draw) but delivers it only after the delay', async () => {
    const quote = simulateLender(delta, input, context(sequence([0, 0.1]))); // delay 4000 ms, 0.1 < 0.3 → failure
    const outcome = quote.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(3_999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(outcome).resolves.toBeInstanceOf(LenderHttpError);
  });

  it('a draw at or above the failure rate answers normally', async () => {
    const quote = simulateLender(delta, input, context(sequence([1, 0.3])));
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(quote).resolves.toMatchObject({ decision: { outcome: 'approved', approvedAmountCents: 1_500_000 }, delayMs: 15_000 });
  });

  it.each([
    ['approve', { outcome: 'approved', approvedAmountCents: 1_500_000 }],
    ['refuse', { outcome: 'refused', reasonCode: 'forced' }],
    ['timeout', { outcome: 'approved', approvedAmountCents: 1_500_000 }],
  ] as const)('override %s replaces the rule and the delay', async (outcome, decision) => {
    const quote = simulateLender(alfa, { ...input, monthlyIncomeCents: 1 }, context(sequence([0.5, 0.5]), { outcome, delayMs: 250 }));
    await vi.advanceTimersByTimeAsync(250);
    await expect(quote).resolves.toMatchObject({ decision, delayMs: 250 });
  });

  it('override error rejects with HTTP 500 after its delay', async () => {
    const quote = simulateLender(alfa, input, context(sequence([0.5, 0.5]), { outcome: 'error', delayMs: 100 }));
    const outcome = quote.then(
      () => 'resolved',
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(100);
    await expect(outcome).resolves.toMatchObject({ status: 500 });
  });

  it('override natural without delay keeps the drawn delay', async () => {
    const quote = simulateLender(alfa, input, context(sequence([0, 0.9]), { outcome: 'natural' }));
    await vi.advanceTimersByTimeAsync(500);
    await expect(quote).resolves.toMatchObject({ delayMs: 500 });
  });
});
