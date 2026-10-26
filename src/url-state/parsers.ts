import { createLoader, parseAsStringLiteral } from 'nuqs/server';
import { SCENARIO_IDS, SORT_CRITERIA } from '@/src/domain/types';

/**
 * URL state shared by server (createLoader) and client (useQueryState). Only interface state lives
 * here: never personal data. `history: 'replace'` keeps the Back button for real navigation.
 */
export const sortParser = parseAsStringLiteral(SORT_CRITERIA)
  .withDefault('installment')
  .withOptions({ history: 'replace', shallow: true, clearOnDefault: true });

/** Demo scenario; absent = natural flow. Lives in the URL during registration and in the database after. */
export const scenarioParser = parseAsStringLiteral(SCENARIO_IDS).withOptions({ history: 'replace', shallow: true });

export const HINTS = ['lower_amount', 'retry'] as const;
export type Hint = (typeof HINTS)[number];

/** Why the clinic came back to the amount step ("try a lower amount" / "consult again"); only changes the banner. */
export const hintParser = parseAsStringLiteral(HINTS).withOptions({ history: 'replace', shallow: true });

export const loadConsultationSearchParams = createLoader({ sort: sortParser });
export const loadRegisterSearchParams = createLoader({ scenario: scenarioParser, hint: hintParser });

/** Query string that carries the scenario between steps; empty for the natural flow. */
export function scenarioQuery(scenario: string | null | undefined): string {
  return scenario ? `?scenario=${encodeURIComponent(scenario)}` : '';
}
