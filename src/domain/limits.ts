/**
 * Registration limits of the case, inclusive at both ends (docs/07 §3.4; boundaries in docs/05
 * "Fronteiras de idade" and "Fronteiras de valor"). Shared by the registration schema, the lenders
 * and the consultation summary. Money is integer cents; ages are completed years.
 */

/** Smallest treatment amount accepted: R$ 1.000,00. docs/05: 999,99 is rejected, 1.000,00 is accepted. */
export const TREATMENT_MIN_CENTS = 100_000;

/** Largest treatment amount accepted: R$ 50.000,00. docs/05: 50.000,00 is accepted, 50.000,01 is rejected. */
export const TREATMENT_MAX_CENTS = 5_000_000;

/** Youngest patient accepted, in completed years. docs/05: 18 is accepted, 17 is rejected. */
export const MIN_AGE_YEARS = 18;

/** Oldest patient accepted, in completed years. docs/05: 80 is accepted, 81 is rejected. */
export const MAX_AGE_YEARS = 80;
