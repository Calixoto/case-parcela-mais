import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Database } from '@/src/db/client';
import type { ScenarioId } from '@/src/domain/types';
import { LENDERS } from '@/src/lenders/registry';
import type { Overrides } from '@/src/lenders/scenarios';
import { createConsultation } from '@/src/server/consultations.service';
import type { LogEvent } from '@/src/server/log';
import { getLenderResults } from '@/src/server/repositories';
import { getConsultationSnapshot } from '@/src/server/snapshot';
import { systemClock } from './clock';
import { runConsultation } from './run-consultation';

const TODAY = '2026-10-22';
const DEADLINE_MS = 10_000;

/** Persona A of docs/03: 30 years old, income R$ 5.000, treatment R$ 15.000 — approved by Alfa, Beta (60%) and Gama. */
const personaA = {
  patient: { fullName: 'Ana Souza', cpf: '52998224725', birthDate: '1996-03-15', phone: '11912345678', monthlyIncomeCents: 500_000 },
  treatmentAmountCents: 1_500_000,
};

/** Persona B of docs/03: 22 years old, income R$ 1.500, treatment R$ 25.000 — Alfa refuses (income), Gama refuses (age). */
const personaB = {
  patient: { fullName: 'Bruno Lima', cpf: '12345678909', birthDate: '2004-05-10', phone: '21987654321', monthlyIncomeCents: 150_000 },
  treatmentAmountCents: 2_500_000,
};

function sequence(values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}

let db: Database;
let events: LogEvent[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-22T15:00:00Z'));
  db = openDatabase(':memory:');
  events = [];
});

afterEach(() => {
  db.close();
  vi.useRealTimers();
});

function start(input: typeof personaA, scenario: ScenarioId | null, random = sequence([0]), overrides?: Overrides) {
  const { id, deadlineAt } = createConsultation(db, { ...input, scenario }, { now: Date.now(), todayIso: TODAY, deadlineMs: DEADLINE_MS, lenders: LENDERS });
  const run = runConsultation(id, { db, clock: systemClock, random, lenders: LENDERS, log: (event) => events.push(event) }, overrides);
  return { id, deadlineAt, run };
}

const snapshot = (id: string) => getConsultationSnapshot(db, id, { now: Date.now(), pollIntervalMs: 750 })!;
const statuses = (id: string) => Object.fromEntries(getLenderResults(db, id).map((row) => [row.lenderId, `${row.status}:${row.reasonCode ?? ''}`]));

describe('runConsultation', () => {
  it('creates the four querying rows before any lender answers (first frame of the screen)', () => {
    const { id } = start(personaA, 'all_approve');
    expect(statuses(id)).toEqual({ alfa: 'querying:', beta: 'querying:', gama: 'querying:', delta: 'querying:' });
    expect(snapshot(id)).toMatchObject({ status: 'querying', summary: { pendingCount: 4, outcome: 'pending', nextStep: 'wait' } });
  });

  it('all_approve: closes as soon as the last lender answers, well before the deadline', async () => {
    const startedAt = Date.now();
    const { id, run } = start(personaA, 'all_approve');
    await vi.advanceTimersByTimeAsync(1_999);
    expect(snapshot(id).status).toBe('querying');
    await vi.advanceTimersByTimeAsync(1);
    await run;
    const result = snapshot(id);
    expect(result).toMatchObject({ status: 'finished', finishReason: 'all_responded', finishedAt: startedAt + 2_000 });
    expect(statuses(id)).toEqual({ alfa: 'approved:', beta: 'approved:', gama: 'approved:', delta: 'approved:' });
    expect(result.offers).toHaveLength(12);
    expect(result.lenders.find((lender) => lender.lenderId === 'beta')).toMatchObject({ approvedAmountCents: 900_000, latencyMs: 1_000 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('delta_timeout: closes at the deadline with Delta unavailable, and the late answer is ignored', async () => {
    const startedAt = Date.now();
    const { id, run } = start(personaA, 'delta_timeout');
    await vi.advanceTimersByTimeAsync(9_999);
    expect(snapshot(id).status).toBe('querying');
    await vi.advanceTimersByTimeAsync(1);
    await run;
    const atDeadline = snapshot(id);
    expect(atDeadline).toMatchObject({ status: 'finished', finishReason: 'deadline', finishedAt: startedAt + DEADLINE_MS });
    expect(statuses(id)).toEqual({ alfa: 'approved:', beta: 'approved:', gama: 'approved:', delta: 'unavailable:timeout' });
    expect(atDeadline.lenders.find((lender) => lender.lenderId === 'delta')).toMatchObject({ latencyMs: DEADLINE_MS });
    expect(atDeadline.offers).toHaveLength(9);

    await vi.advanceTimersByTimeAsync(2_000); // Delta answers at 12 s
    expect(statuses(id)).toEqual({ alfa: 'approved:', beta: 'approved:', gama: 'approved:', delta: 'unavailable:timeout' });
    expect(snapshot(id).offers).toHaveLength(9);
    expect(events.find((event) => event.event === 'late_result_ignored')).toMatchObject({ lenderId: 'delta', lateByMs: 2_000 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('delta_error: an HTTP 500 is unavailable with its own reason, and the journey goes on with 9 offers', async () => {
    const { id, run } = start(personaA, 'delta_error');
    await vi.advanceTimersByTimeAsync(2_000);
    await run;
    expect(statuses(id)).toEqual({ alfa: 'approved:', beta: 'approved:', gama: 'approved:', delta: 'unavailable:http_500' });
    expect(snapshot(id)).toMatchObject({ finishReason: 'all_responded', summary: { approvedCount: 3, unavailableCount: 1, outcome: 'offers' } });
    expect(snapshot(id).offers).toHaveLength(9);
  });

  it('none_approve: zero offers and the screen gets a reason and a next step', async () => {
    const { id, run } = start(personaA, 'none_approve');
    await vi.advanceTimersByTimeAsync(1_500);
    await run;
    expect(statuses(id)).toEqual({ alfa: 'refused:forced', beta: 'refused:forced', gama: 'refused:forced', delta: 'refused:forced' });
    expect(snapshot(id)).toMatchObject({ offers: [], summary: { refusedCount: 4, outcome: 'none_approved', nextStep: 'retry' } });
  });

  it('none_approve keeps real refusals: persona B is refused by income and age, so the next step is a lower amount', async () => {
    const { id, run } = start(personaB, 'none_approve');
    await vi.advanceTimersByTimeAsync(1_500);
    await run;
    expect(statuses(id)).toEqual({ alfa: 'refused:income_insufficient', beta: 'refused:forced', gama: 'refused:age_below_min', delta: 'refused:forced' });
    expect(snapshot(id)).toMatchObject({ offers: [], summary: { refusedCount: 4, outcome: 'none_approved', nextStep: 'lower_amount' } });
  });

  it('all_approve does not depend on the typed data: persona B gets four approvals (Beta at 60%)', async () => {
    const { id, run } = start(personaB, 'all_approve');
    await vi.advanceTimersByTimeAsync(2_000);
    await run;
    expect(statuses(id)).toEqual({ alfa: 'approved:', beta: 'approved:', gama: 'approved:', delta: 'approved:' });
    expect(snapshot(id).offers).toHaveLength(12);
  });

  it.each([
    ['all_approve', 12],
    ['delta_error', 9],
    ['delta_timeout', 9],
    ['none_approve', 0],
  ] as const)('preset %s reproduces the expected table of docs/05 for persona A: %i offers', async (scenario, offers) => {
    const { id, run } = start(personaA, scenario);
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    await run;
    expect(snapshot(id).offers).toHaveLength(offers);
  });

  it('natural flow, persona B: rules refuse Alfa (income) and Gama (age), Beta covers 60%, Delta fails fast', async () => {
    // random = 0 → shortest delays (500/2000/1000/4000) and Delta's failure draw 0 < 0.3
    const { id, run } = start(personaB, null);
    await vi.advanceTimersByTimeAsync(4_000);
    await run;
    expect(statuses(id)).toEqual({ alfa: 'refused:income_insufficient', beta: 'approved:', gama: 'refused:age_below_min', delta: 'unavailable:http_500' });
    expect(snapshot(id)).toMatchObject({ finishReason: 'all_responded', summary: { approvedCount: 1, refusedCount: 2, unavailableCount: 1, outcome: 'offers' } });
    expect(snapshot(id).lenders.find((lender) => lender.lenderId === 'beta')).toMatchObject({ approvedAmountCents: 1_500_000 });
  });

  it('natural flow with the longest draws still closes by itself when Delta answers before the deadline', async () => {
    const { id, run } = start(personaA, null, sequence([0.5, 0.9])); // Delta: 4000 + 0.5 × 11000 = 9500 ms, failure draw 0.9 → answers
    await vi.advanceTimersByTimeAsync(9_500);
    await run;
    expect(snapshot(id)).toMatchObject({ status: 'finished', finishReason: 'all_responded' });
    expect(statuses(id).delta).toBe('approved:');
  });

  it('explicit per-lender overrides work on top of a preset (Beta can also time out)', async () => {
    const { id, run } = start(personaA, 'all_approve', sequence([0]), { beta: { outcome: 'timeout', delayMs: 12_000 } });
    await vi.advanceTimersByTimeAsync(DEADLINE_MS);
    await run;
    expect(statuses(id)).toEqual({ alfa: 'approved:', beta: 'unavailable:timeout', gama: 'approved:', delta: 'approved:' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(statuses(id).beta).toBe('unavailable:timeout');
  });

  it('does nothing for a consultation that is already finished', async () => {
    const { id, run } = start(personaA, 'all_approve');
    await vi.advanceTimersByTimeAsync(2_000);
    await run;
    const before = events.length;
    await runConsultation(id, { db, clock: systemClock, random: () => 0, lenders: LENDERS, log: (event) => events.push(event) });
    expect(events).toHaveLength(before);
  });
});

describe('reading reconciles a consultation stuck after a restart', () => {
  it('closes pending results as unavailable by timeout once the deadline has passed', () => {
    const { id, deadlineAt } = createConsultation(db, { ...personaA, scenario: null }, { now: Date.now(), todayIso: TODAY, deadlineMs: DEADLINE_MS, lenders: LENDERS });
    // the orchestrator never runs (process died)
    const stillOpen = getConsultationSnapshot(db, id, { now: deadlineAt, pollIntervalMs: 750 })!;
    expect(stillOpen.status).toBe('querying');
    const reconciled = getConsultationSnapshot(db, id, { now: deadlineAt + 1, pollIntervalMs: 750 })!;
    expect(reconciled).toMatchObject({ status: 'finished', finishReason: 'reconciled', finishedAt: deadlineAt, summary: { unavailableCount: 4, outcome: 'none_approved', nextStep: 'retry' } });
    expect(statuses(id)).toEqual({ alfa: 'unavailable:timeout', beta: 'unavailable:timeout', gama: 'unavailable:timeout', delta: 'unavailable:timeout' });
  });

  it('exposes only a masked CPF, the server clock and the poll interval', () => {
    const { id } = createConsultation(db, { ...personaA, scenario: 'all_approve' }, { now: Date.now(), todayIso: TODAY, deadlineMs: DEADLINE_MS, lenders: LENDERS });
    const result = getConsultationSnapshot(db, id, { now: Date.now(), pollIntervalMs: 750 })!;
    expect(result.patient).toEqual({ fullName: 'Ana Souza', cpfMasked: '***.982.247-**', ageYears: 30 });
    expect(result).toMatchObject({ serverNow: Date.now(), timeoutMs: DEADLINE_MS, pollIntervalMs: 750, forcedScenario: 'all_approve', treatmentAmountCents: 1_500_000 });
    expect(JSON.stringify(result)).not.toContain('52998224725');
    expect(result.lenders.map((lender) => lender.lenderId)).toEqual(['alfa', 'beta', 'gama', 'delta']);
  });
});
