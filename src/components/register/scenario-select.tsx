'use client';

import { useQueryState } from 'nuqs';
import { Field, FieldDescription, FieldLabel } from '@/src/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/src/components/ui/native-select';
import { copy } from '@/src/copy/pt-BR';
import { SCENARIO_IDS } from '@/src/domain/types';
import { scenarioParser } from '@/src/url-state/parsers';

/**
 * The forced scenario the case asks for. URL state (shareable, survives reload) AND a form field
 * (travels to the Server Action without JavaScript): a native select needs nothing to hydrate.
 */
export function ScenarioSelect() {
  const [scenario, setScenario] = useQueryState('scenario', scenarioParser);
  return (
    <Field>
      <FieldLabel htmlFor="scenario">{copy.fields.scenario.label}</FieldLabel>
      <NativeSelect
        id="scenario"
        name="scenario"
        value={scenario ?? ''}
        onChange={(event) => void setScenario(scenarioParser.parse(event.target.value))}
        aria-describedby="scenario-help"
        className="w-full"
      >
        <NativeSelectOption value="">{copy.scenarios.natural}</NativeSelectOption>
        {SCENARIO_IDS.map((id) => (
          <NativeSelectOption key={id} value={id}>
            {copy.scenarios[id]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <FieldDescription id="scenario-help">{copy.fields.scenario.help}</FieldDescription>
    </Field>
  );
}
