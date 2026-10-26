'use client';

import { useQueryState } from 'nuqs';
import { copy } from '@/src/copy/pt-BR';
import { SCENARIO_IDS, type ScenarioId } from '@/src/domain/types';
import { scenarioParser } from '@/src/url-state/parsers';

/**
 * The demo scenario is URL state (shareable, survives reload) AND a form field (travels to the
 * Server Action without JavaScript). Discreet: closed unless a scenario is active.
 */
export function ScenarioSelect() {
  const [scenario, setScenario] = useQueryState('scenario', scenarioParser);
  return (
    <details open={scenario !== null} className="rounded-control border border-rule px-4 py-3 text-sm text-ink-muted">
      <summary className="cursor-pointer select-none">{copy.fields.scenario.label}</summary>
      <select
        name="scenario"
        value={scenario ?? ''}
        onChange={(event) => void setScenario(event.target.value ? (event.target.value as ScenarioId) : null)}
        aria-label={copy.fields.scenario.label}
        className="mt-3 w-full rounded-control border border-rule bg-enamel px-3 py-2 text-base text-ink"
      >
        <option value="">{copy.scenarios.natural}</option>
        {SCENARIO_IDS.map((id) => (
          <option key={id} value={id}>
            {copy.scenarios[id]}
          </option>
        ))}
      </select>
    </details>
  );
}
