import type { Database } from '@/src/db/client';
import type { QuoteInput, ReasonCode } from '@/src/domain/types';
import { LenderHttpError } from '@/src/lenders/errors';
import type { LenderConfig } from '@/src/lenders/registry';
import { resolveOverrides, type Overrides } from '@/src/lenders/scenarios';
import type { LenderQuote } from '@/src/lenders/simulate';
import type { Logger } from '@/src/server/log';
import { finalizeConsultation, getConsultation, recordLateResult, settleLenderResult, type SettledResult } from '@/src/server/repositories';
import { callLender } from './call-lender';
import type { Clock } from './clock';

export type OrchestrationDeps = {
  readonly db: Database;
  readonly clock: Clock;
  readonly random: () => number;
  readonly lenders: readonly LenderConfig[];
  readonly log: Logger;
};

/**
 * Queries every lender in parallel and closes the consultation at min(all answered, deadline).
 * The deadline is the one persisted at creation (measured on the server), so a restart or a slow
 * start never extends it. The database is the arbiter: an answer that arrives after the close finds
 * its row already terminal (0 rows updated) and is logged as ignored instead of overwriting a timeout.
 *
 * `overrides` is a test seam: it stacks per-lender behaviours on top of the persisted scenario, so the
 * tests can make several lenders fail or time out at once. Production never passes it; the scenario
 * forced on the form travels in the consultation row.
 */
export async function runConsultation(consultationId: string, deps: OrchestrationDeps, overrides?: Overrides): Promise<void> {
  const consultation = getConsultation(deps.db, consultationId);
  if (!consultation || consultation.status !== 'querying') return;

  const input: QuoteInput = {
    treatmentAmountCents: consultation.treatmentAmountCents,
    monthlyIncomeCents: consultation.monthlyIncomeCents,
    ageYears: consultation.patientAgeYears,
  };
  const resolved = resolveOverrides(consultation.forcedScenario, overrides, consultation.timeoutMs);
  const { startedAt, deadlineAt, timeoutMs, forcedScenario } = consultation;

  let deadlineTimer: unknown;
  let deadlineHit = false;
  const deadline = new Promise<void>((resolve) => {
    deadlineTimer = deps.clock.setTimeout(() => {
      deadlineHit = true;
      resolve();
    }, Math.max(0, deadlineAt - deps.clock.now()));
  });

  const calls = deps.lenders.map((lender) =>
    callLender(lender, input, { random: deps.random, setTimeout: deps.clock.setTimeout, override: resolved[lender.id] }).then(
      (quote) => settle(lender, quoteToResult(quote, deps.clock.now(), startedAt)),
      (error: unknown) => settle(lender, errorToResult(error, deps.clock.now(), startedAt)),
    ),
  );

  function settle(lender: LenderConfig, result: SettledResult): void {
    try {
      persist(lender, result);
    } catch (error) {
      deps.log({ event: 'lender_settle_failed', consultationId, lenderId: lender.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  function persist(lender: LenderConfig, result: SettledResult): void {
    const changes = settleLenderResult(deps.db, consultationId, lender.id, result);
    if (changes === 1) {
      deps.log({ event: 'lender_settled', consultationId, lenderId: lender.id, status: result.status, reasonCode: result.reasonCode, latencyMs: result.latencyMs });
      return;
    }
    recordLateResult(deps.db, consultationId, lender.id, result.respondedAt, { status: result.status, reasonCode: result.reasonCode });
    deps.log({ event: 'late_result_ignored', consultationId, lenderId: lender.id, status: result.status, lateByMs: result.respondedAt - deadlineAt });
  }

  await Promise.race([Promise.allSettled(calls), deadline]);
  deps.clock.clearTimeout(deadlineTimer);

  const finishedAt = deps.clock.now();
  const outcome = finalizeConsultation(deps.db, consultationId, {
    finishedAt,
    finishReason: deadlineHit ? 'deadline' : 'all_responded',
    timeoutMs,
  });
  deps.log({
    event: outcome.finished ? 'consultation_finished' : 'consultation_already_finished', // a read may have reconciled it first
    consultationId,
    finishReason: deadlineHit ? 'deadline' : 'all_responded',
    expired: outcome.expired,
    elapsedMs: finishedAt - startedAt,
    forcedScenario,
  });
}

function quoteToResult(quote: LenderQuote, respondedAt: number, startedAt: number): SettledResult {
  const base = { latencyMs: respondedAt - startedAt, respondedAt, monthlyRate: quote.monthlyRate, termsMonths: quote.termsMonths };
  return quote.decision.outcome === 'approved'
    ? { ...base, status: 'approved', reasonCode: null, approvedAmountCents: quote.decision.approvedAmountCents }
    : { ...base, status: 'refused', reasonCode: quote.decision.reasonCode, approvedAmountCents: null };
}

function errorToResult(error: unknown, respondedAt: number, startedAt: number): SettledResult {
  const reasonCode: ReasonCode = error instanceof LenderHttpError ? `http_${error.status}` : 'error';
  return { status: 'unavailable', reasonCode, approvedAmountCents: null, monthlyRate: null, termsMonths: null, latencyMs: respondedAt - startedAt, respondedAt };
}
