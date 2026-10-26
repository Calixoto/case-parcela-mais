import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Database } from '@/src/db/client';
import { LENDERS } from '@/src/lenders/registry';
import { systemClock } from '@/src/orchestration/clock';
import { runConsultation } from '@/src/orchestration/run-consultation';
import { chooseOffer } from './choices.service';
import { createConsultation } from './consultations.service';
import { silentLogger } from './log';
import { getConsultationSnapshot } from './snapshot';

/** Reference patient of docs/05: 30 years, income R$ 3.000, treatment R$ 10.000 — the Price table. */
const reference = {
  patient: { fullName: 'Carla Dias', cpf: '52998224725', birthDate: '1996-03-15', phone: '11912345678', monthlyIncomeCents: 300_000 },
  treatmentAmountCents: 1_000_000,
};

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

async function finished(scenario: 'all_approve' | 'none_approve') {
  const { id } = createConsultation(db, { ...reference, scenario }, { now: Date.now(), todayIso: '2026-10-22', deadlineMs: 10_000, lenders: LENDERS });
  const run = runConsultation(id, { db, clock: systemClock, random: () => 0, lenders: LENDERS, log: silentLogger });
  await vi.advanceTimersByTimeAsync(10_000);
  await run;
  return id;
}

describe('chooseOffer', () => {
  it('recalculates the money from the stored result and keeps a snapshot (Beta 24x of docs/05)', async () => {
    const id = await finished('all_approve');
    const result = chooseOffer(db, { consultationId: id, lenderId: 'beta', termMonths: 24 }, { now: Date.now() });
    expect(result).toEqual({
      ok: true,
      created: true,
      choice: { lenderId: 'beta', lenderName: 'Beta', termMonths: 24, financedAmountCents: 600_000, monthlyRate: 0.0199, installmentCents: 31_687, totalCents: 760_488 },
    });
    expect(getConsultationSnapshot(db, id, { now: Date.now(), pollIntervalMs: 750 })!.choice).toMatchObject({ lenderId: 'beta', termMonths: 24 });
  });

  it('is idempotent for the same choice and refuses a different second choice', async () => {
    const id = await finished('all_approve');
    chooseOffer(db, { consultationId: id, lenderId: 'alfa', termMonths: 12 }, { now: Date.now() });
    expect(chooseOffer(db, { consultationId: id, lenderId: 'alfa', termMonths: 12 }, { now: Date.now() })).toMatchObject({ ok: true, created: false });
    expect(chooseOffer(db, { consultationId: id, lenderId: 'gama', termMonths: 6 }, { now: Date.now() })).toEqual({ ok: false, code: 'already_chosen' });
  });

  it('rejects a term the lender did not offer', async () => {
    const id = await finished('all_approve');
    expect(chooseOffer(db, { consultationId: id, lenderId: 'alfa', termMonths: 36 }, { now: Date.now() })).toEqual({ ok: false, code: 'term_not_offered' });
  });

  it('rejects a lender that did not approve, an unknown lender and an unknown consultation', async () => {
    const id = await finished('none_approve');
    expect(chooseOffer(db, { consultationId: id, lenderId: 'alfa', termMonths: 6 }, { now: Date.now() })).toEqual({ ok: false, code: 'lender_not_approved' });
    expect(chooseOffer(db, { consultationId: id, lenderId: 'omega', termMonths: 6 }, { now: Date.now() })).toEqual({ ok: false, code: 'lender_not_approved' });
    expect(chooseOffer(db, { consultationId: 'nope', lenderId: 'alfa', termMonths: 6 }, { now: Date.now() })).toEqual({ ok: false, code: 'not_found' });
  });
});
