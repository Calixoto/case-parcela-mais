/**
 * Brazilian CPF: normalization, validation, display formatting and masking.
 *
 * Case rules (docs/01 "Etapa 1", docs/05 "CPF", docs/07 FR-002): accept the CPF with or without
 * mask, require both check digits to match the standard algorithm, reject the ten repeated
 * sequences (they pass the algorithm but are invalid by convention) and persist only the 11 digits.
 * The full CPF never reaches a URL, a log or the consultation snapshot: only `maskCpf` output does
 * (docs/07 §4.14 "Observabilidade e privacidade").
 *
 * Pure functions: no I/O, no clock, no framework imports.
 */

const CPF_LENGTH = 11;

/** Eleven identical digits: "00000000000" through "99999999999". */
const REPEATED_SEQUENCE = /^(\d)\1{10}$/;

/**
 * Keeps only the digits: "529.982.247-25" → "52998224725".
 * Mask punctuation, spaces and any other non-digit character are dropped.
 */
export function normalizeCpf(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * Standard CPF check digit. Each digit is multiplied by a weight that starts at `firstWeight`
 * and decreases down to 2 (10..2 over the 9 base digits; 11..2 over the base plus the first
 * check digit). Remainder rule: remainder < 2 → 0, otherwise 11 − remainder.
 */
function checkDigit(digits: string, firstWeight: number): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    sum += Number(digits[i]) * (firstWeight - i);
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/**
 * True only when, after normalization, the input has exactly 11 digits, is not a repeated
 * sequence and both check digits match the algorithm (docs/05 CPF table; docs/01 "Implícito").
 */
export function isValidCpf(input: string): boolean {
  const digits = normalizeCpf(input);
  if (digits.length !== CPF_LENGTH) return false;
  if (REPEATED_SEQUENCE.test(digits)) return false;
  const firstCheck = checkDigit(digits.slice(0, 9), 10);
  const secondCheck = checkDigit(digits.slice(0, 10), 11);
  return firstCheck === Number(digits[9]) && secondCheck === Number(digits[10]);
}

/** Display format for 11 normalized digits: "52998224725" → "529.982.247-25". */
export function formatCpf(digits: string): string {
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

/**
 * Masked display for the confirmation screen and the snapshot (`patient.cpfMasked`):
 * "52998224725" → "***.982.247-**". Hides the first block and the check digits so the full CPF
 * is never shown (docs/07 §4.14). Input assumed normalized, like `formatCpf`.
 */
export function maskCpf(digits: string): string {
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}
