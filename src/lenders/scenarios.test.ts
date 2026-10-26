import { describe, expect, it } from 'vitest';
import { isScenarioId, LATE_RESPONSE_EXTRA_MS, presetOverrides, resolveOverrides, SCENARIO_IDS } from './scenarios';

describe('scenario presets', () => {
  it('knows exactly the four scenarios of the case', () => {
    expect(SCENARIO_IDS).toEqual(['all_approve', 'delta_error', 'delta_timeout', 'none_approve']);
    expect(isScenarioId('delta_error')).toBe(true);
    expect(isScenarioId('beta_timeout')).toBe(false);
    expect(isScenarioId(null)).toBe(false);
  });

  it.each([10_000, 15_000, 5_000])('delta_timeout answers %i ms + 2 s, so a changed deadline still times out', (deadlineMs) => {
    expect(presetOverrides('delta_timeout', deadlineMs).delta).toEqual({ outcome: 'approve', delayMs: deadlineMs + LATE_RESPONSE_EXTRA_MS });
  });

  it('none_approve forces the four refusals with short delays', () => {
    const overrides = presetOverrides('none_approve', 10_000);
    expect(Object.keys(overrides).sort()).toEqual(['alfa', 'beta', 'delta', 'gama']);
    for (const override of Object.values(overrides)) {
      expect(override.outcome).toBe('refuse');
      expect(override.delayMs).toBeLessThanOrEqual(1_500);
    }
  });

  it('delta_error only touches Delta; all_approve makes Delta a fast approval', () => {
    expect(presetOverrides('delta_error', 10_000)).toEqual({ delta: { outcome: 'error', delayMs: 1_000 } });
    expect(presetOverrides('all_approve', 10_000).delta).toEqual({ outcome: 'approve', delayMs: 2_000 });
  });

  it('explicit per-lender overrides win over the preset', () => {
    const resolved = resolveOverrides('all_approve', { beta: { outcome: 'timeout', delayMs: 12_000 } }, 10_000);
    expect(resolved.beta).toEqual({ outcome: 'timeout', delayMs: 12_000 });
    expect(resolved.delta).toEqual({ outcome: 'approve', delayMs: 2_000 });
    expect(resolveOverrides(null, undefined, 10_000)).toEqual({});
  });
});
