/**
 * Schema migrations, applied in order at the first database access.
 * Adding a column later is one more entry here (e.g. `ALTER TABLE lender_results ADD COLUMN reason_detail TEXT`).
 *
 * Conventions: money in integer cents, rates as decimals (0.0249), timestamps in epoch milliseconds,
 * `terms_months` as a JSON array. `lender_id` and `reason_code` are free text on purpose: a new lender
 * or a new refusal reason must never require a migration.
 */
export type Migration = { readonly name: string; readonly sql: string };

export const MIGRATIONS: readonly Migration[] = [
  {
    name: '001_init',
    sql: `
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  cpf TEXT NOT NULL UNIQUE,
  birth_date TEXT NOT NULL,
  phone TEXT NOT NULL,
  monthly_income_cents INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS consultations (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  treatment_amount_cents INTEGER NOT NULL,
  patient_age_years INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('querying', 'finished')),
  started_at INTEGER NOT NULL,
  deadline_at INTEGER NOT NULL,
  timeout_ms INTEGER NOT NULL,
  finished_at INTEGER,
  finish_reason TEXT CHECK (finish_reason IN ('all_responded', 'deadline', 'reconciled')),
  forced_scenario TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consultations_patient ON consultations(patient_id);

CREATE TABLE IF NOT EXISTS lender_results (
  id TEXT PRIMARY KEY,
  consultation_id TEXT NOT NULL REFERENCES consultations(id),
  lender_id TEXT NOT NULL,
  lender_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('querying', 'approved', 'refused', 'unavailable')),
  reason_code TEXT,
  approved_amount_cents INTEGER,
  monthly_rate REAL,
  terms_months TEXT,
  latency_ms INTEGER,
  started_at INTEGER NOT NULL,
  responded_at INTEGER,
  late_responded_at INTEGER,
  late_outcome_json TEXT,
  UNIQUE (consultation_id, lender_id)
);

CREATE TABLE IF NOT EXISTS chosen_offers (
  id TEXT PRIMARY KEY,
  consultation_id TEXT NOT NULL UNIQUE REFERENCES consultations(id),
  lender_result_id TEXT NOT NULL REFERENCES lender_results(id),
  lender_id TEXT NOT NULL,
  term_months INTEGER NOT NULL,
  financed_amount_cents INTEGER NOT NULL,
  monthly_rate REAL NOT NULL,
  installment_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
`,
  },
];
