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
 * Named presets for the demo (docs/06 D7). Delays are short where the scenario does not need the wait.
 * The timeout preset derives its delay from the deadline, so changing the deadline keeps it timing out.
 */
export function presetOverrides(scenario: ScenarioId, deadlineMs: number): Overrides {
  switch (scenario) {
    case 'all_approve':
      return {
        alfa: { outcome: 'natural', delayMs: 500 },
        beta: { outcome: 'natural', delayMs: 1_000 },
        gama: { outcome: 'natural', delayMs: 1_000 },
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

/** Preset first, explicit per-lender overrides on top (tests and the live demo use the same mechanism). */
export function resolveOverrides(
  scenario: ScenarioId | null,
  overrides: Overrides | undefined,
  deadlineMs: number,
): Overrides {
  return { ...(scenario ? presetOverrides(scenario, deadlineMs) : {}), ...(overrides ?? {}) };
}

const OUTCOMES = ['natural', 'approve', 'refuse', 'error', 'timeout'] as const;

/** Validates the optional per-lender overrides accepted by the JSON API; anything malformed is rejected. */
export function parseOverrides(value: unknown): Overrides | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('overrides must be an object keyed by lender id');
  const result: Record<string, LenderOverride> = {};
  for (const [lenderId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) throw new TypeError(`override for ${lenderId} must be an object`);
    const { outcome, delayMs } = raw as { outcome?: unknown; delayMs?: unknown };
    if (!(OUTCOMES as readonly unknown[]).includes(outcome)) throw new TypeError(`override for ${lenderId}: unknown outcome`);
    if (delayMs !== undefined && !(Number.isInteger(delayMs) && (delayMs as number) >= 0)) throw new TypeError(`override for ${lenderId}: delayMs must be a non-negative integer`);
    result[lenderId] = delayMs === undefined ? { outcome: outcome as LenderOverride['outcome'] } : { outcome: outcome as LenderOverride['outcome'], delayMs: delayMs as number };
  }
  return result;
}
