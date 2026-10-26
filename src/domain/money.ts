/**
 * Money helpers: integer cents in, integer cents out, pt-BR text only at the edges.
 *
 * Case rule (docs/04 "Valores monetários"; docs/07 §2, principle 3): money travels as integer cents in
 * the API, the database and every business rule, and the pt-BR mask exists only in the UI. Rule
 * percentages are integers (the Beta cap is `60`, never `0.6`).
 */

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * pt-BR money text, optionally prefixed by `R$`: an integer part with optional `.` thousands groups,
 * then an optional `,` with one or two decimals. Anchored at both ends, so any other shape is rejected.
 */
const BRL_TEXT = /^(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/**
 * Parses pt-BR money text into integer cents: "R$ 1.234,56", "1.234,56", "1234,56" → 123456;
 * "1234" → 123400; "R$1.000" → 100000. `.` is always the thousands separator and `,` the decimal
 * separator, so "1.000" is one thousand reais and "1,234.56" is ambiguous and rejected. Surrounding
 * spaces and NBSP are ignored. Returns `null` for empty, negative, letters, more than two decimals or
 * any other shape. Range rules (minimum treatment, income > 0) belong to the schema, so "0" parses to 0.
 * The digits are combined with integer arithmetic, never through a float (docs/02 §8).
 */
export function parseBRL(input: string): number | null {
  const match = BRL_TEXT.exec(input.trim()); // trim() also strips NBSP (U+00A0)
  if (match === null) return null;
  const [, integerPart, decimalPart = ''] = match;
  const cents = Number(integerPart.replace(/\./g, '')) * 100 + Number(decimalPart.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/**
 * Formats integer cents as pt-BR currency through `Intl.NumberFormat('pt-BR', { style: 'currency',
 * currency: 'BRL' })`: 123456 → "R$ 1.234,56". The separator after `R$` is a non-breaking space
 * (U+00A0), not a plain space. Presentation only; never feed the result back into a rule
 * (docs/07 §2, principle 3).
 * @throws RangeError when `cents` is not an integer.
 */
export function formatBRL(cents: number): string {
  assertInteger(cents, 'cents');
  // The division is the only float here. Intl rounds half-expand to two decimals, which recovers the
  // exact cents for any amount the case can produce.
  return BRL_FORMATTER.format(cents / 100);
}

/**
 * Applies an integer percentage to an amount, rounding DOWN to the cent. The Beta approves "at most
 * 60%", so 33.333,33 → 19.999,99 and 1.000,01 → 600,00 (docs/05 "Arredondamento do teto da Beta";
 * docs/04 "Teto da Beta"). Integer arithmetic throughout (docs/02 §8).
 * @throws RangeError unless both arguments are integers and `percent` is within 0..100.
 */
export function capPercentCents(cents: number, percent: number): number {
  assertInteger(cents, 'cents');
  assertInteger(percent, 'percent');
  if (percent < 0 || percent > 100) {
    throw new RangeError(`percent must be within 0..100, got ${percent}`);
  }
  return Math.floor((cents * percent) / 100);
}

/**
 * Integer percentage of `wholeCents` covered by `partCents`, rounded down and clamped to 0..100:
 * 6.000,00 approved of a 10.000,00 treatment → 60; 9.999,99 → 99, never rounded up to 100
 * (docs/07 §4.8 `coveragePercent`; docs/02 §6, show coverage on every offer row). Returns 0 when
 * there is no positive whole to compare against.
 */
export function percentCovered(partCents: number, wholeCents: number): number {
  if (wholeCents <= 0) return 0;
  const percent = Math.floor((partCents * 100) / wholeCents);
  return Math.min(100, Math.max(0, percent));
}

/** Money and rule percentages must be exact, so only safe integers (|n| < 2^53) are accepted. */
function assertInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be an integer, got ${value}`);
  }
}
