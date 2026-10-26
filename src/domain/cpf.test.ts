import { describe, expect, it } from 'vitest';
import { formatCpf, isValidCpf, maskCpf, normalizeCpf } from './cpf';

/** "00000000000" … "99999999999": all pass the check-digit algorithm, all invalid by convention (docs/05). */
const REPEATED_SEQUENCES = Array.from({ length: 10 }, (_, digit) => String(digit).repeat(11));

describe('normalizeCpf', () => {
  it.each([
    ['529.982.247-25', '52998224725'],
    ['52998224725', '52998224725'],
    [' 529.982.247-25 ', '52998224725'],
    ['529 982 247 25', '52998224725'],
    ['529.982.24A-25', '5299822425'],
    ['', ''],
  ])('normalizeCpf(%j) → %j', (input, expected) => {
    expect(normalizeCpf(input)).toBe(expected);
  });
});

describe('isValidCpf', () => {
  it.each([
    ['529.982.247-25', 'docs/05: correct check digits, with mask'],
    ['52998224725', 'docs/05: same CPF without mask'],
    ['123.456.789-09', 'docs/05: correct check digits, with mask'],
    ['12345678909', 'docs/05: same CPF without mask'],
    [' 529.982.247-25 ', 'surrounding whitespace is ignored'],
  ])('%s is valid (%s)', (cpf) => {
    expect(isValidCpf(cpf)).toBe(true);
  });

  it.each([
    ['123.456.789-00', 'docs/05: wrong check digits'],
    ['529.982.247-35', 'only the first check digit is wrong'],
    ['529.982.247-24', 'only the second check digit is wrong'],
  ])('%s is invalid (%s)', (cpf) => {
    expect(isValidCpf(cpf)).toBe(false);
  });

  // Remainder rule: remainder 0 or 1 yields check digit 0, never 11 or 10.
  it.each([
    ['123.456.789-09', 'first check digit 0 from remainder 1'],
    ['100.000.006-04', 'first check digit 0 from remainder 0'],
    ['100.000.036-20', 'second check digit 0 from remainder 1'],
    ['100.000.002-80', 'second check digit 0 from remainder 0'],
  ])('%s is valid (%s)', (cpf) => {
    expect(isValidCpf(cpf)).toBe(true);
  });

  it.each(REPEATED_SEQUENCES)('%s is invalid: repeated sequence, with or without mask', (digits) => {
    expect(isValidCpf(digits)).toBe(false);
    expect(isValidCpf(formatCpf(digits))).toBe(false);
  });

  it.each([
    ['1234567890', 'docs/05: 10 digits'],
    ['123456789012', 'docs/05: 12 digits'],
    ['529.982.24A-25', 'docs/05: letter in place of a digit'],
    ['529.982.247-2', 'mask with a missing check digit'],
    ['abc', 'letters only'],
    ['', 'empty string'],
  ])('%s is invalid (%s)', (cpf) => {
    expect(isValidCpf(cpf)).toBe(false);
  });
});

describe('formatCpf', () => {
  it.each([
    ['52998224725', '529.982.247-25'],
    ['12345678909', '123.456.789-09'],
  ])('formatCpf(%s) → %s', (digits, formatted) => {
    expect(formatCpf(digits)).toBe(formatted);
  });

  it.each(['52998224725', '12345678909'])('round-trips through normalizeCpf (%s)', (digits) => {
    expect(normalizeCpf(formatCpf(digits))).toBe(digits);
    expect(isValidCpf(formatCpf(digits))).toBe(true);
  });
});

describe('maskCpf', () => {
  it.each([
    ['52998224725', '***.982.247-**'],
    ['12345678909', '***.456.789-**'],
  ])('maskCpf(%s) → %s (docs/07: snapshot shows only cpfMasked)', (digits, masked) => {
    expect(maskCpf(digits)).toBe(masked);
  });

  it('masks what the form produces after normalization', () => {
    expect(maskCpf(normalizeCpf('529.982.247-25'))).toBe('***.982.247-**');
  });

  it('exposes only the two middle blocks', () => {
    const masked = maskCpf('52998224725');
    expect(masked).toMatch(/^\*{3}\.\d{3}\.\d{3}-\*{2}$/);
    expect(normalizeCpf(masked)).toBe('982247');
  });
});
