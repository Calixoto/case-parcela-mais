import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Database } from '@/src/db/client';
import type { ScenarioId } from '@/src/domain/types';
import { LENDERS } from '@/src/lenders/registry';
import { systemClock } from '@/src/orchestration/clock';
import { runConsultation } from '@/src/orchestration/run-consultation';
import { createConsultation } from './consultations.service';
import { silentLogger } from './log';
import { getLenderMetrics } from './metrics.service';

const personaA = {
  patient: { fullName: 'Ana Souza', cpf: '52998224725', birthDate: '1996-03-15', phone: '11912345678', monthlyIncomeCents: 500_000 },
  treatmentAmountCents: 1_500_000,
};

function sequence(values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}

let db: Database;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-22T15:00:00Z'));
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

async function run(scenario: ScenarioId | null, random: () => number) {
  const { id } = createConsultation(db, { ...personaA, scenario }, { now: Date.now(), todayIso: '2026-10-22', deadlineMs: 10_000, lenders: LENDERS });
  const promise = runConsultation(id, { db, clock: systemClock, random, lenders: LENDERS, log: silentLogger });
  await vi.advanceTimersByTimeAsync(15_000);
  await promise;
}

describe('getLenderMetrics', () => {
  it('lists every lender zeroed before any natural consultation', () => {
    expect(getLenderMetrics(db, LENDERS).map((m) => [m.lenderId, m.calls, m.latencyP50Ms])).toEqual([
      ['alfa', 0, null],
      ['beta', 0, null],
      ['gama', 0, null],
      ['delta', 0, null],
    ]);
  });

  it('aggregates the natural flow only: forced scenarios never skew the rates', async () => {
    await run(null, sequence([0, 0.1])); // every delay at its minimum; Delta's failure draw 0.1 < 0.3 → HTTP 500 at 4 s
    await run(null, sequence([1, 0.9])); // every delay at its maximum; Delta answers at 15 s → timeout at 10 s
    await run('delta_error', () => 0); // forced: must be ignored
    await run('none_approve', () => 0); // forced: must be ignored

    const byId = Object.fromEntries(getLenderMetrics(db, LENDERS).map((m) => [m.lenderId, m]));
    expect(byId.delta).toMatchObject({ calls: 2, approved: 0, unavailable: 2, errorRate: 0.5, timeoutRate: 0.5, lateAnswers: 1, latencyP50Ms: 4_000, latencyP95Ms: 10_000 });
    expect(byId.alfa).toMatchObject({ calls: 2, approved: 2, errorRate: 0, timeoutRate: 0, latencyP50Ms: 500, latencyP95Ms: 1_500 });
    expect(byId.beta).toMatchObject({ calls: 2, approved: 2, latencyP50Ms: 2_000, latencyP95Ms: 5_000 });
    expect(byId.gama).toMatchObject({ calls: 2, approved: 2, latencyP50Ms: 1_000, latencyP95Ms: 3_000 });
  });
});
