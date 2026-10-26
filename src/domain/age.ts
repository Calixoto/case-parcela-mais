/**
 * Civil-calendar dates and age in completed years, with no time zone arithmetic.
 *
 * Dates travel as 'YYYY-MM-DD' strings and are compared as (year, month, day) tuples, so the rules
 * below never touch `Date`. The one exception is `todayIso`, which turns an instant into the civil
 * date of an IANA zone; everything else is string and integer math.
 *
 * Case rules encoded here: FR-003 and §3.4 of docs/07 (age in completed years by calendar date, in
 * 'America/Sao_Paulo') and the age boundaries of docs/05 ("Fronteiras de idade").
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

type CalendarDate = { readonly year: number; readonly month: number; readonly day: number };

/** Gregorian rule: every 4 years, except centuries, except every 400 years (2000 yes, 1900 no). */
function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** Length of a month (1-12); February follows the leap-year rule. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** Reads the three fields of a well-formed 'YYYY-MM-DD'. Does not check that the day exists. */
function splitIso(iso: string): CalendarDate {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)), day: Number(iso.slice(8, 10)) };
}

/**
 * True when `iso` is exactly 'YYYY-MM-DD' and names a real day: month 1-12 and day within that
 * month's length. '2024-02-29' is valid; '2025-02-29' and '2026-02-30' are not. Never relies on
 * `Date` parsing, which would silently roll '2026-02-30' into March.
 */
export function isValidCalendarDate(iso: string): boolean {
  if (!ISO_DATE.test(iso)) return false;
  const { year, month, day } = splitIso(iso);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** `splitIso` for a date that must be valid; throws RangeError otherwise. */
function parseIso(iso: string, label: string): CalendarDate {
  if (!isValidCalendarDate(iso)) throw new RangeError(`${label} is not a valid calendar date: "${iso}"`);
  return splitIso(iso);
}

/**
 * Age in completed years on `todayIso` (FR-003 of docs/07; boundaries of docs/05):
 * `today.year - birth.year`, minus one when (today.month, today.day) < (birth.month, birth.day),
 * i.e. this year's birthday has not happened yet. A 29/02 birthday counts as passed on 01/03 of
 * non-leap years, which falls out of the tuple comparison.
 *
 * Returns 0 on the day of birth and a negative number for a birth date after `todayIso`; a caller
 * that wants a "future date" message compares the ISO strings first (`birthIso > todayIso` is
 * correct because the format is zero-padded). Throws RangeError when either date is invalid.
 */
export function ageInYears(birthIso: string, todayIso: string): number {
  const birth = parseIso(birthIso, 'birth date');
  const today = parseIso(todayIso, 'reference date');
  const birthdayNotYet = today.month < birth.month || (today.month === birth.month && today.day < birth.day);
  return today.year - birth.year - (birthdayNotYet ? 1 : 0);
}

/**
 * Parses a pt-BR date ('dd/mm/yyyy', surrounding whitespace ignored) into 'YYYY-MM-DD'.
 * Returns null unless the input has exactly that shape and names a real day ('31/02/2026' is null).
 */
export function parseBrDate(input: string): string | null {
  const match = BR_DATE.exec(input.trim());
  if (match === null) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  return isValidCalendarDate(iso) ? iso : null;
}

/** Formats a valid 'YYYY-MM-DD' as 'dd/mm/yyyy' for display. Throws RangeError for an invalid date. */
export function formatBrDate(iso: string): string {
  if (!isValidCalendarDate(iso)) throw new RangeError(`cannot format an invalid calendar date: "${iso}"`);
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/**
 * Civil date ('YYYY-MM-DD') of the instant `now` in the given IANA zone, e.g. 'America/Sao_Paulo'
 * (docs/07 §3.4). The only function here that touches `Date`/`Intl`: 'en-CA' is the locale whose
 * numeric pattern is already in ISO order. Near midnight the answer depends on the zone:
 * 2026-10-22T02:30Z is 2026-10-21 in São Paulo and 2026-10-22 in UTC. Throws RangeError for an
 * unknown zone or an invalid Date.
 */
export function todayIso(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
