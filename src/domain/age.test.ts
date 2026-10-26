import { describe, expect, it } from 'vitest';
import { ageInYears, formatBrDate, isValidCalendarDate, parseBrDate, todayIso } from './age';

/** Reference date of docs/05 "Fronteiras de idade"; every birth date in that table is relative to it. */
const REFERENCE_DATE = '2026-10-22';

/** Turns a docs/05 fixture ('dd/mm/yyyy') into ISO, failing loudly if the fixture itself is broken. */
function iso(br: string): string {
  const parsed = parseBrDate(br);
  if (parsed === null) throw new Error(`fixture is not a valid pt-BR date: "${br}"`);
  return parsed;
}

describe('isValidCalendarDate', () => {
  it.each([
    ['2024-02-29', true],
    ['2000-02-29', true],
    ['2025-02-29', false],
    ['1900-02-29', false],
    ['2026-02-28', true],
    ['2026-02-30', false],
    ['2026-02-31', false],
    ['2026-04-30', true],
    ['2026-04-31', false],
    ['2026-12-31', true],
    ['2026-01-01', true],
  ])('%s -> %s (month lengths and leap years)', (input, expected) => {
    expect(isValidCalendarDate(input)).toBe(expected);
  });

  it.each([
    '2026-13-01',
    '2026-00-15',
    '2026-01-00',
    '2026-01-32',
    '',
    '2026-1-5',
    '22/10/2008',
    '2026-10-22T00:00:00Z',
    ' 2026-10-22',
    '2026-10-22 ',
  ])('rejects %j (wrong shape or out-of-range field)', (input) => {
    expect(isValidCalendarDate(input)).toBe(false);
  });
});

describe('ageInYears', () => {
  it.each([
    ['22/10/2008', 18],
    ['23/10/2008', 17],
    ['22/10/2001', 25],
    ['23/10/2001', 24],
    ['23/10/1945', 80],
    ['22/10/1945', 81],
    ['29/02/2008', 18],
  ])('born %s is %i on 22/10/2026 (docs/05 "Fronteiras de idade")', (birth, expected) => {
    expect(ageInYears(iso(birth), REFERENCE_DATE)).toBe(expected);
  });

  it('treats a 29/02 birthday as passed on 01/03 of a non-leap year', () => {
    expect(ageInYears('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageInYears('2008-02-29', '2026-03-01')).toBe(18);
  });

  it('counts the birthday itself as a completed year, in a leap year too', () => {
    expect(ageInYears('2008-02-29', '2028-02-28')).toBe(19);
    expect(ageInYears('2008-02-29', '2028-02-29')).toBe(20);
  });

  it('is 0 on the day of birth and negative for a birth date after the reference date', () => {
    expect(ageInYears(REFERENCE_DATE, REFERENCE_DATE)).toBe(0);
    expect(ageInYears('2026-10-23', REFERENCE_DATE)).toBe(-1);
    expect(ageInYears('2027-01-01', REFERENCE_DATE)).toBe(-1);
  });

  it.each([
    ['2026-02-31', REFERENCE_DATE],
    ['', REFERENCE_DATE],
    ['22/10/2008', REFERENCE_DATE],
    ['2008-10-22', '2026-02-31'],
    ['2008-10-22', ''],
  ])('throws RangeError for an invalid date (birth %j, today %j)', (birth, today) => {
    expect(() => ageInYears(birth, today)).toThrow(RangeError);
  });
});

describe('parseBrDate', () => {
  it.each([
    ['22/10/2008', '2008-10-22'],
    ['  22/10/2008  ', '2008-10-22'],
    ['29/02/2008', '2008-02-29'],
    ['01/01/1900', '1900-01-01'],
    ['22/10/2026', REFERENCE_DATE],
  ])('%j -> %s', (input, expected) => {
    expect(parseBrDate(input)).toBe(expected);
  });

  it.each([
    '31/02/2026',
    '29/02/2025',
    '',
    '   ',
    '2008-10-22',
    '2/10/2008',
    '22/10/08',
    '22-10-2008',
    '22/10/2008x',
    'aa/bb/cccc',
    '00/10/2008',
    '22/13/2008',
  ])('%j -> null', (input) => {
    expect(parseBrDate(input)).toBeNull();
  });
});

describe('formatBrDate', () => {
  it.each([
    ['2008-10-22', '22/10/2008'],
    ['2008-02-29', '29/02/2008'],
    ['1945-10-23', '23/10/1945'],
  ])('%s -> %s', (input, expected) => {
    expect(formatBrDate(input)).toBe(expected);
  });

  it('round-trips with parseBrDate', () => {
    expect(parseBrDate(formatBrDate('2001-10-23'))).toBe('2001-10-23');
    expect(formatBrDate(iso('23/10/2001'))).toBe('23/10/2001');
  });

  it.each(['2026-02-31', '', '22/10/2008'])('throws RangeError for %j', (input) => {
    expect(() => formatBrDate(input)).toThrow(RangeError);
  });
});

describe('todayIso', () => {
  const nearMidnightInSaoPaulo = new Date('2026-10-22T02:30:00Z');

  it('is the civil date of the zone, so it can differ from UTC near midnight', () => {
    expect(todayIso('America/Sao_Paulo', nearMidnightInSaoPaulo)).toBe('2026-10-21');
    expect(todayIso('UTC', nearMidnightInSaoPaulo)).toBe('2026-10-22');
  });

  it('agrees across zones away from midnight', () => {
    const afternoon = new Date('2026-10-22T15:00:00Z');
    expect(todayIso('America/Sao_Paulo', afternoon)).toBe('2026-10-22');
    expect(todayIso('UTC', afternoon)).toBe('2026-10-22');
  });

  it('feeds ageInYears directly: the docs/05 table holds on the São Paulo reference date', () => {
    const today = todayIso('America/Sao_Paulo', new Date('2026-10-22T12:00:00-03:00'));
    expect(today).toBe(REFERENCE_DATE);
    expect(ageInYears(iso('22/10/2008'), today)).toBe(18);
    expect(ageInYears(iso('23/10/2008'), today)).toBe(17);
  });

  it('defaults to the current instant and still yields a valid calendar date', () => {
    expect(isValidCalendarDate(todayIso('America/Sao_Paulo'))).toBe(true);
  });

  it('throws RangeError for an unknown zone or an invalid Date', () => {
    expect(() => todayIso('Mars/Olympus', nearMidnightInSaoPaulo)).toThrow(RangeError);
    expect(() => todayIso('UTC', new Date('not a date'))).toThrow(RangeError);
  });
});
