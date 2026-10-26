import { getDb } from '@/src/db/client';
import { LENDERS } from '@/src/lenders/registry';
import type { Overrides } from '@/src/lenders/scenarios';
import { systemClock } from '@/src/orchestration/clock';
import { runConsultation } from '@/src/orchestration/run-consultation';
import { consoleLogger } from './log';

/** Production wiring of the orchestrator (real database, clock, randomness, lenders and log). */
export function startConsultationRun(consultationId: string, overrides?: Overrides): Promise<void> {
  return runConsultation(consultationId, { db: getDb(), clock: systemClock, random: Math.random, lenders: LENDERS, log: consoleLogger }, overrides).catch(
    (error: unknown) => {
      consoleLogger({ event: 'consultation_run_failed', consultationId, error: error instanceof Error ? error.message : String(error) });
    },
  );
}
