import { formatBRL, parseBRL } from '@/src/domain/money';

/**
 * Input masks applied while the clinic types: CPF, celular and money. Pure functions, unit tested with simulated
 * keystrokes. Each edit is read with the value it replaced and the browser's `inputType`, so a mask never turns a
 * slip into a different valid number: a keystroke past the limit is ignored, an ambiguous paste is left as pasted
 * (the schema then explains what is wrong), and deleting a separator removes the digit next to it.
 */

export type MaskedInput = { readonly value: string; readonly caret: number };

const MAX_DOCUMENT_DIGITS = 11;
/** Integer digits a money field accepts: R$ 999.999.999, far above anything the case allows. */
const MAX_MONEY_INTEGER_DIGITS = 9;

const isDigit = (char: string) => char >= '0' && char <= '9';
const isMoneyChar = (char: string) => isDigit(char) || char === ',';
const digitsOf = (text: string) => text.replace(/\D/g, '');
/** No DDD starts with 0, so leading zeros (a trunk prefix such as "011") are dropped. */
const phoneDigitsOf = (text: string) => digitsOf(text).replace(/^0+/, '');
const significantOf = (text: string, significant: (char: string) => boolean) => [...text].filter(significant).join('');
const isPaste = (inputType: string) => inputType === 'insertFromPaste' || inputType === 'insertFromDrop';

/** "52998224725" → "529.982.247-25", growing as the digits arrive ("5299" → "529.9"). */
export function formatCpfInput(text: string): string {
  const d = digitsOf(text).slice(0, MAX_DOCUMENT_DIGITS);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Mobile with DDD, the only shape the schema accepts: "11912345678" → "(11) 91234-5678", growing as typed. */
export function formatPhoneInput(text: string): string {
  const d = phoneDigitsOf(text).slice(0, MAX_DOCUMENT_DIGITS);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Reais first, the way the clinic says them: "15000" → "R$ 15.000", and a comma opens the cents ("15000,5" →
 * "R$ 15.000,5"). Only regroups the thousands: zeros are never added or removed while typing (deleting the "3" of
 * "R$ 30.500" leaves "R$ 0.500", so typing "2" gives "R$ 20.500"); `formatOnBlur` completes the value.
 */
export function formatMoneyInput(text: string): string {
  const kept = text.replace(/[^\d,]/g, '');
  if (kept === '') return '';
  const comma = kept.indexOf(',');
  const integer = comma === -1 ? kept : kept.slice(0, comma);
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return comma === -1 ? `R$ ${grouped}` : `R$ ${grouped},${kept.slice(comma + 1).replace(/,/g, '')}`;
}

/** Caret right after the same number of significant characters it had in `text` (or before the first one). */
function mapCaret(text: string, caret: number, value: string, significant: (char: string) => boolean): number {
  const before = [...text.slice(0, caret)].filter(significant).length;
  if (before === 0) {
    const first = [...value].findIndex(significant);
    return first === -1 ? value.length : first;
  }
  let position = 0;
  for (let seen = 0; position < value.length && seen < before; position++) {
    if (significant(value[position]!)) seen++;
  }
  return position;
}

/** Ignores the edit: back to the previous value, caret where it was before the keystroke. */
function revert(previous: string, text: string, caret: number): MaskedInput {
  return { value: previous, caret: Math.min(previous.length, Math.max(0, caret - (text.length - previous.length))) };
}

/** After Backspace/Delete removed only a separator, removes the significant character next to it instead. */
function deleteBeyondSeparator(text: string, caret: number, forward: boolean, significant: (char: string) => boolean) {
  if (forward) {
    for (let index = caret; index < text.length; index++) {
      if (significant(text[index]!)) return { text: text.slice(0, index) + text.slice(index + 1), caret };
    }
  } else {
    for (let index = caret - 1; index >= 0; index--) {
      if (significant(text[index]!)) return { text: text.slice(0, index) + text.slice(index + 1), caret: index };
    }
  }
  return { text, caret };
}

function maskDocument(field: 'cpf' | 'phone', previous: string, text: string, caret: number, inputType: string): MaskedInput {
  const format = field === 'cpf' ? formatCpfInput : formatPhoneInput;
  const digits = field === 'cpf' ? digitsOf : phoneDigitsOf;
  if (isPaste(inputType)) {
    let pasted = digits(text);
    if (field === 'phone' && pasted.length > MAX_DOCUMENT_DIGITS) pasted = pasted.replace(/^55/, '').replace(/^0+/, ''); // +55 and trunk 0
    if (pasted.length > MAX_DOCUMENT_DIGITS) return { value: text, caret }; // left as pasted: the schema says what is wrong
    const value = format(pasted);
    return { value, caret: value.length };
  }
  if (inputType.startsWith('delete') && text !== previous && digits(text) === digits(previous)) {
    ({ text, caret } = deleteBeyondSeparator(text, caret, inputType === 'deleteContentForward', isDigit));
  }
  if (inputType.startsWith('insert') && digits(text).length > MAX_DOCUMENT_DIGITS) return revert(previous, text, caret);
  const value = format(text);
  return { value, caret: inputType.startsWith('history') ? value.length : mapCaret(text, caret, value, isDigit) };
}

function maskMoney(previous: string, text: string, caret: number, inputType: string): MaskedInput {
  if (isPaste(inputType)) {
    // A pasted amount is taken only when it reads unambiguously in pt-BR ("3500.00" or "15,000" are left as pasted).
    const cents = parseBRL(text.trim().replace(/,$/, ''));
    return cents === null ? { value: text, caret } : { value: formatBRL(cents), caret: formatBRL(cents).length };
  }
  const hadComma = previous.includes(',');
  const typed = inputType === 'insertText' ? text[caret - 1] : undefined;
  if (typed === '.' || typed === ',') {
    // A typed point is the decimal comma (numeric keypads, US layouts); the thousands dots are the mask's own.
    if (hadComma) return revert(previous, text, caret);
    text = `${text.slice(0, caret - 1)},${text.slice(caret)}`;
  }
  if (inputType.startsWith('delete') && text !== previous) {
    const removedOnlyComma = hadComma && !text.includes(',') && previous.length - text.length === 1;
    if (removedOnlyComma && previous.slice(previous.indexOf(',') + 1) !== '') {
      // Deleting the comma would merge the cents into the reais (R$ 15.000,00 → R$ 1.500.000): step over it instead.
      return { value: previous, caret: inputType === 'deleteContentForward' ? caret + 1 : caret };
    }
    if (significantOf(text, isMoneyChar) === significantOf(previous, isMoneyChar)) {
      ({ text, caret } = deleteBeyondSeparator(text, caret, inputType === 'deleteContentForward', isMoneyChar));
    }
  }
  const [integer = '', cents = ''] = text.replace(/[^\d,]/g, '').split(',');
  if (inputType.startsWith('insert') && (cents.length > 2 || integer.length > MAX_MONEY_INTEGER_DIGITS)) return revert(previous, text, caret);
  const value = formatMoneyInput(text);
  return { value, caret: inputType.startsWith('history') ? value.length : mapCaret(text, caret, value, isMoneyChar) };
}

/**
 * Masks one edit of a field: `previous` is what the input showed before it, `text` and `caret` what the browser
 * left after it, `inputType` the InputEvent's. Returns null for fields without a mask.
 */
export function maskInput(field: string, previous: string, text: string, caret: number, inputType: string): MaskedInput | null {
  if (field === 'cpf' || field === 'phone') return maskDocument(field, previous, text, caret, inputType);
  if (field === 'monthlyIncome' || field === 'treatmentAmount') return maskMoney(previous, text, caret, inputType);
  return null;
}

/**
 * Completes a value when the clinic leaves the field, and before submitting: money gets its cents
 * ("R$ 15.000", "R$ 15.000," or "R$ ,5" → "R$ 15.000,00" / "R$ 0,50"); CPF and celular get the full mask.
 * Anything else, including money that does not read unambiguously, stays as typed for the schema to judge.
 */
export function formatOnBlur(field: string, value: string): string {
  const trimmed = value.trim();
  if (field === 'cpf') return digitsOf(trimmed).length <= MAX_DOCUMENT_DIGITS ? formatCpfInput(trimmed) : value;
  if (field === 'phone') return phoneDigitsOf(trimmed).length <= MAX_DOCUMENT_DIGITS ? formatPhoneInput(trimmed) : value;
  if (field === 'monthlyIncome' || field === 'treatmentAmount') {
    const plain = trimmed.replace(/^R\$\s*/, '').replace(/,$/, '');
    const cents = parseBRL(plain.startsWith(',') ? `0${plain}` : plain);
    if (cents !== null) return formatBRL(cents);
  }
  return value;
}
