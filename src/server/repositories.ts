import type { Database } from '@/src/db/client';
import type { ChosenOffer, FinishReason, LenderResult, LenderStatus, ReasonCode, ScenarioId } from '@/src/domain/types';

/** Short synchronous transaction. The callback must not await: the single connection is held from BEGIN to COMMIT. */
export function withTransaction<T>(db: Database, run: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = run();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export type PatientInput = {
  readonly fullName: string;
  readonly cpf: string; // 11 digits
  readonly birthDate: string; // YYYY-MM-DD
  readonly phone: string; // 11 digits
  readonly monthlyIncomeCents: number;
};

/** A patient is identified by CPF; a new registration updates the stored data (docs/04: same CPF may consult again). */
export function upsertPatient(db: Database, patient: PatientInput, now: number): string {
  const row = db
    .prepare(
      `INSERT INTO patients (id, full_name, cpf, birth_date, phone, monthly_income_cents, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cpf) DO UPDATE SET
         full_name = excluded.full_name, birth_date = excluded.birth_date, phone = excluded.phone,
         monthly_income_cents = excluded.monthly_income_cents, updated_at = excluded.updated_at
       RETURNING id`,
    )
    .get(crypto.randomUUID(), patient.fullName, patient.cpf, patient.birthDate, patient.phone, patient.monthlyIncomeCents, now, now) as {
    id: string;
  };
  return row.id;
}

export type NewConsultationRow = {
  readonly id: string;
  readonly patientId: string;
  readonly treatmentAmountCents: number;
  readonly patientAgeYears: number;
  readonly startedAt: number;
  readonly deadlineAt: number;
  readonly timeoutMs: number;
  readonly forcedScenario: ScenarioId | null;
};

export function insertConsultation(db: Database, row: NewConsultationRow): void {
  db.prepare(
    `INSERT INTO consultations (id, patient_id, treatment_amount_cents, patient_age_years, status, started_at, deadline_at, timeout_ms, forced_scenario, created_at)
     VALUES (?, ?, ?, ?, 'querying', ?, ?, ?, ?, ?)`,
  ).run(row.id, row.patientId, row.treatmentAmountCents, row.patientAgeYears, row.startedAt, row.deadlineAt, row.timeoutMs, row.forcedScenario, row.startedAt);
}

export function insertQueryingResults(
  db: Database,
  consultationId: string,
  lenders: readonly { readonly id: string; readonly name: string }[],
  startedAt: number,
): void {
  const statement = db.prepare(
    `INSERT INTO lender_results (id, consultation_id, lender_id, lender_name, status, started_at) VALUES (?, ?, ?, ?, 'querying', ?)`,
  );
  for (const lender of lenders) statement.run(crypto.randomUUID(), consultationId, lender.id, lender.name, startedAt);
}

export type SettledResult = {
  readonly status: Exclude<LenderStatus, 'querying'>;
  readonly reasonCode: ReasonCode | null;
  readonly approvedAmountCents: number | null;
  readonly monthlyRate: number | null;
  readonly termsMonths: readonly number[] | null;
  readonly latencyMs: number;
  readonly respondedAt: number;
};

/**
 * Terminal-state guard: only a result still `querying` can be settled. Returns the number of rows
 * changed, so a late answer (0 rows) is detected by the caller and never overwrites a timeout.
 */
export function settleLenderResult(db: Database, consultationId: string, lenderId: string, settled: SettledResult): number {
  const result = db
    .prepare(
      `UPDATE lender_results
       SET status = ?, reason_code = ?, approved_amount_cents = ?, monthly_rate = ?, terms_months = ?, latency_ms = ?, responded_at = ?
       WHERE consultation_id = ? AND lender_id = ? AND status = 'querying'`,
    )
    .run(
      settled.status,
      settled.reasonCode,
      settled.approvedAmountCents,
      settled.monthlyRate,
      settled.termsMonths ? JSON.stringify(settled.termsMonths) : null,
      settled.latencyMs,
      settled.respondedAt,
      consultationId,
      lenderId,
    );
  return Number(result.changes);
}

/** Keeps the late answer for metrics without touching the terminal state. */
export function recordLateResult(db: Database, consultationId: string, lenderId: string, respondedAt: number, outcome: unknown): void {
  db.prepare(`UPDATE lender_results SET late_responded_at = ?, late_outcome_json = ? WHERE consultation_id = ? AND lender_id = ?`).run(
    respondedAt,
    JSON.stringify(outcome),
    consultationId,
    lenderId,
  );
}

export type FinalizeInput = { readonly finishedAt: number; readonly finishReason: FinishReason; readonly timeoutMs: number };

/**
 * Closes a consultation: every result still `querying` becomes unavailable by timeout (latency = the
 * timeout itself) and the consultation becomes `finished`. Idempotent: a second call changes nothing.
 */
export function finalizeConsultation(db: Database, consultationId: string, input: FinalizeInput): { expired: number; finished: boolean } {
  return withTransaction(db, () => {
    const expired = db
      .prepare(
        `UPDATE lender_results SET status = 'unavailable', reason_code = 'timeout', latency_ms = ?, responded_at = ?
         WHERE consultation_id = ? AND status = 'querying'`,
      )
      .run(input.timeoutMs, input.finishedAt, consultationId);
    const finished = db
      .prepare(`UPDATE consultations SET status = 'finished', finished_at = ?, finish_reason = ? WHERE id = ? AND status = 'querying'`)
      .run(input.finishedAt, input.finishReason, consultationId);
    return { expired: Number(expired.changes), finished: Number(finished.changes) === 1 };
  });
}

/** Server restarted mid-consultation: anything past its deadline is closed as reconciled (also done on every read). */
export function reconcileExpiredConsultations(db: Database, now: number): number {
  const rows = db.prepare(`SELECT id, deadline_at, timeout_ms FROM consultations WHERE status = 'querying' AND deadline_at < ?`).all(now) as Array<{
    id: string;
    deadline_at: number;
    timeout_ms: number;
  }>;
  for (const row of rows) finalizeConsultation(db, row.id, { finishedAt: row.deadline_at, finishReason: 'reconciled', timeoutMs: row.timeout_ms });
  return rows.length;
}

export type ConsultationRow = {
  readonly id: string;
  readonly patientId: string;
  readonly fullName: string;
  readonly cpf: string;
  readonly birthDate: string;
  readonly phone: string;
  readonly monthlyIncomeCents: number;
  readonly treatmentAmountCents: number;
  readonly patientAgeYears: number;
  readonly status: 'querying' | 'finished';
  readonly startedAt: number;
  readonly deadlineAt: number;
  readonly timeoutMs: number;
  readonly finishedAt: number | null;
  readonly finishReason: FinishReason | null;
  readonly forcedScenario: ScenarioId | null;
};

export function getConsultation(db: Database, id: string): ConsultationRow | null {
  const row = db
    .prepare(
      `SELECT c.id, c.patient_id, p.full_name, p.cpf, p.birth_date, p.phone, p.monthly_income_cents,
              c.treatment_amount_cents, c.patient_age_years, c.status, c.started_at, c.deadline_at, c.timeout_ms,
              c.finished_at, c.finish_reason, c.forced_scenario
       FROM consultations c JOIN patients p ON p.id = c.patient_id WHERE c.id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    fullName: String(row.full_name),
    cpf: String(row.cpf),
    birthDate: String(row.birth_date),
    phone: String(row.phone),
    monthlyIncomeCents: Number(row.monthly_income_cents),
    treatmentAmountCents: Number(row.treatment_amount_cents),
    patientAgeYears: Number(row.patient_age_years),
    status: row.status as 'querying' | 'finished',
    startedAt: Number(row.started_at),
    deadlineAt: Number(row.deadline_at),
    timeoutMs: Number(row.timeout_ms),
    finishedAt: row.finished_at === null ? null : Number(row.finished_at),
    finishReason: (row.finish_reason as FinishReason | null) ?? null,
    forcedScenario: (row.forced_scenario as ScenarioId | null) ?? null,
  };
}

export type LenderResultRow = LenderResult & { readonly id: string };

/** Results in insertion order, which is the registry order. */
export function getLenderResults(db: Database, consultationId: string): LenderResultRow[] {
  const rows = db
    .prepare(
      `SELECT id, lender_id, lender_name, status, reason_code, approved_amount_cents, monthly_rate, terms_months, latency_ms
       FROM lender_results WHERE consultation_id = ? ORDER BY rowid`,
    )
    .all(consultationId) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    lenderId: String(row.lender_id),
    lenderName: String(row.lender_name),
    status: row.status as LenderStatus,
    reasonCode: (row.reason_code as ReasonCode | null) ?? null,
    approvedAmountCents: row.approved_amount_cents === null ? null : Number(row.approved_amount_cents),
    monthlyRate: row.monthly_rate === null ? null : Number(row.monthly_rate),
    termsMonths: typeof row.terms_months === 'string' ? (JSON.parse(row.terms_months) as number[]) : [],
    latencyMs: row.latency_ms === null ? null : Number(row.latency_ms),
  }));
}

export function getChosenOffer(db: Database, consultationId: string): ChosenOffer | null {
  const row = db
    .prepare(
      `SELECT o.lender_id, r.lender_name, o.term_months, o.financed_amount_cents, o.monthly_rate, o.installment_cents, o.total_cents
       FROM chosen_offers o JOIN lender_results r ON r.id = o.lender_result_id WHERE o.consultation_id = ?`,
    )
    .get(consultationId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    lenderId: String(row.lender_id),
    lenderName: String(row.lender_name),
    termMonths: Number(row.term_months),
    financedAmountCents: Number(row.financed_amount_cents),
    monthlyRate: Number(row.monthly_rate),
    installmentCents: Number(row.installment_cents),
    totalCents: Number(row.total_cents),
  };
}

export function insertChosenOffer(
  db: Database,
  input: { readonly consultationId: string; readonly lenderResultId: string } & Omit<ChosenOffer, 'lenderName'> & { readonly createdAt: number },
): void {
  db.prepare(
    `INSERT INTO chosen_offers (id, consultation_id, lender_result_id, lender_id, term_months, financed_amount_cents, monthly_rate, installment_cents, total_cents, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    input.consultationId,
    input.lenderResultId,
    input.lenderId,
    input.termMonths,
    input.financedAmountCents,
    input.monthlyRate,
    input.installmentCents,
    input.totalCents,
    input.createdAt,
  );
}
