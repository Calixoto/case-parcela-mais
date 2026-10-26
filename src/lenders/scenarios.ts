import { SCENARIO_IDS, type ScenarioId } from '@/src/domain/types';

export { SCENARIO_IDS, type ScenarioId };

/**
 * A forced behaviour for one lender. `natural` keeps the real rule and the drawn delay;
 * the others replace the outcome, and `delayMs` replaces the drawn delay.
 */
export type LenderOverride = {
  readonly outcome: 'natural' | 'approve' | 'refuse' | 'error' | 'timeout';
  readonly delayMs?: number;
};

export type Overrides = Readonly<Record<string, LenderOverride>>;

/** A `timeout` override answers this long AFTER the deadline, so the late answer is observable. */
export const LATE_RESPONSE_EXTRA_MS = 2_000;

export function isScenarioId(value: unknown): value is ScenarioId {
  return typeof value === 'string' && (SCENARIO_IDS as readonly string[]).includes(value);
}

/**
 * Named presets for the four scenarios the case asks to force (docs/06 D7). Delays are short where
 * the scenario does not need the wait. The timeout preset derives its delay from the deadline, so
 * changing the deadline keeps it timing out.
 */
export function presetOverrides(scenario: ScenarioId, deadlineMs: number): Overrides {
  switch (scenario) {
    case 'all_approve':
      // Alfa and Gama are forced (their rules could refuse the typed data); Beta always approves by rule, capped at 60%.
      return {
        alfa: { outcome: 'approve', delayMs: 500 },
        beta: { outcome: 'natural', delayMs: 1_000 },
        gama: { outcome: 'approve', delayMs: 1_000 },
        delta: { outcome: 'approve', delayMs: 2_000 },
      };
    case 'delta_error':
      return { delta: { outcome: 'error', delayMs: 1_000 } };
    case 'delta_timeout':
      return { delta: { outcome: 'approve', delayMs: deadlineMs + LATE_RESPONSE_EXTRA_MS } };
    case 'none_approve':
      return {
        alfa: { outcome: 'refuse', delayMs: 500 },
        beta: { outcome: 'refuse', delayMs: 1_000 },
        gama: { outcome: 'refuse', delayMs: 1_000 },
        delta: { outcome: 'refuse', delayMs: 1_500 },
      };
  }
}

/** Preset first, explicit per-lender overrides on top (a test seam: production only ever passes the preset). */
export function resolveOverrides(
  scenario: ScenarioId | null,
  overrides: Overrides | undefined,
  deadlineMs: number,
): Overrides {
  return { ...(scenario ? presetOverrides(scenario, deadlineMs) : {}), ...(overrides ?? {}) };
}
