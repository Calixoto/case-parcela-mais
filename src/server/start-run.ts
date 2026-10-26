import { getDb } from '@/src/db/client';
import { LENDERS } from '@/src/lenders/registry';
import { systemClock } from '@/src/orchestration/clock';
import { runConsultation } from '@/src/orchestration/run-consultation';
import { consoleLogger } from './log';

/** Production wiring of the orchestrator (real database, clock, randomness, lenders and log). */
export function startConsultationRun(consultationId: string): Promise<void> {
  return runConsultation(consultationId, { db: getDb(), clock: systemClock, random: Math.random, lenders: LENDERS, log: consoleLogger }).catch(
    (error: unknown) => {
      consoleLogger({ event: 'consultation_run_failed', consultationId, error: error instanceof Error ? error.message : String(error) });
    },
  );
}
