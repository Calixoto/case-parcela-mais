import type { Database } from '@/src/db/client';
import type { LenderConfig } from '@/src/lenders/registry';

export type LenderMetrics = {
  readonly lenderId: string;
  readonly lenderName: string;
  readonly calls: number;
  readonly approved: number;
  readonly refused: number;
  readonly unavailable: number;
  /** Share of calls that failed with an HTTP error (reason_code http_*). */
  readonly errorRate: number;
  /** Share of calls that did not answer before the deadline. */
  readonly timeoutRate: number;
  /** Answers that arrived after the consultation was closed (ignored, but counted). */
  readonly lateAnswers: number;
  readonly latencyP50Ms: number | null;
  readonly latencyP95Ms: number | null;
};

type Row = { lender_id: string; status: string; reason_code: string | null; latency_ms: number | null; late_responded_at: number | null };

/** Nearest-rank percentile over settled latencies (timeouts count with latency = deadline). */
function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? null;
}

const ratio = (part: number, whole: number) => (whole === 0 ? 0 : Number((part / whole).toFixed(4)));

/**
 * Per-lender numbers from the natural flow only: consultations with a forced scenario are excluded,
 * otherwise a demo would skew the Delta error rate. Lenders with no call yet still appear, zeroed.
 */
export function getLenderMetrics(db: Database, lenders: readonly LenderConfig[]): LenderMetrics[] {
  const rows = db
    .prepare(
      `SELECT r.lender_id, r.status, r.reason_code, r.latency_ms, r.late_responded_at
       FROM lender_results r JOIN consultations c ON c.id = r.consultation_id
       WHERE c.forced_scenario IS NULL AND r.status != 'querying'`,
    )
    .all() as Row[];

  return lenders.map((lender) => {
    const mine = rows.filter((row) => row.lender_id === lender.id);
    const latencies = mine.map((row) => row.latency_ms).filter((value): value is number => value !== null).sort((a, b) => a - b);
    const errors = mine.filter((row) => row.reason_code?.startsWith('http_')).length;
    const timeouts = mine.filter((row) => row.reason_code === 'timeout').length;
    return {
      lenderId: lender.id,
      lenderName: lender.name,
      calls: mine.length,
      approved: mine.filter((row) => row.status === 'approved').length,
      refused: mine.filter((row) => row.status === 'refused').length,
      unavailable: mine.filter((row) => row.status === 'unavailable').length,
      errorRate: ratio(errors, mine.length),
      timeoutRate: ratio(timeouts, mine.length),
      lateAnswers: mine.filter((row) => row.late_responded_at !== null).length,
      latencyP50Ms: percentile(latencies, 50),
      latencyP95Ms: percentile(latencies, 95),
    };
  });
}
