import { describe, expect, it } from 'vitest';
import { formatCpfInput, formatMoneyInput, formatOnBlur, formatPhoneInput, maskInput } from './masks';

type Field = 'cpf' | 'phone' | 'monthlyIncome';
type State = { readonly value: string; readonly caret: number };

/** Plays keys the way the browser delivers them to onChange: a character, 'Backspace' or 'Delete' at the caret. */
function press(field: Field, state: State, ...keys: string[]): State {
  return keys.reduce((current, key) => {
    let text: string;
    let caret: number;
    let inputType: string;
    if (key === 'Backspace') {
      if (current.caret === 0) return current;
      text = current.value.slice(0, current.caret - 1) + current.value.slice(current.caret);
      caret = current.caret - 1;
      inputType = 'deleteContentBackward';
    } else if (key === 'Delete') {
      if (current.caret >= current.value.length) return current;
      text = current.value.slice(0, current.caret) + current.value.slice(current.caret + 1);
      caret = current.caret;
      inputType = 'deleteContentForward';
    } else {
      text = current.value.slice(0, current.caret) + key + current.value.slice(current.caret);
      caret = current.caret + key.length;
      inputType = 'insertText';
    }
    return maskInput(field, current.value, text, caret, inputType)!;
  }, state);
}

const typed = (field: Field, keys: string) => press(field, { value: '', caret: 0 }, ...keys);
const at = (value: string, caret: number): State => ({ value, caret });
const paste = (field: Field, text: string) => maskInput(field, '', text, text.length, 'insertFromPaste')!;

describe('formatting as the digits arrive', () => {
  it.each([
    ['5299', '529.9'],
    ['529982247', '529.982.247'],
    ['52998224725', '529.982.247-25'],
  ])('CPF %s → %s', (keys, value) => expect(typed('cpf', keys).value).toBe(value));

  it.each([
    ['1', '(1'],
    ['119', '(11) 9'],
    ['11912345', '(11) 91234-5'],
    ['11912345678', '(11) 91234-5678'],
    ['011912345678', '(11) 91234-5678'],
  ])('celular %s → %s', (keys, value) => expect(typed('phone', keys).value).toBe(value));

  it.each([
    ['5000', 'R$ 5.000'],
    ['15000', 'R$ 15.000'],
    ['15000,5', 'R$ 15.000,5'],
    ['3500.00', 'R$ 3.500,00'],
    ['2500.5', 'R$ 2.500,5'],
  ])('money %s → %s (a typed point is the decimal comma)', (keys, value) => expect(typed('monthlyIncome', keys).value).toBe(value));

  it('keeps the caret at the end while typing at the end', () => {
    expect(typed('cpf', '52998224725')).toEqual(at('529.982.247-25', 14));
    expect(typed('monthlyIncome', '15000,5')).toEqual(at('R$ 15.000,5', 11));
  });
});

describe('limits: a keystroke past them is ignored, never shifts other digits out', () => {
  it('CPF and celular stop at 11 digits, even when typed in the middle', () => {
    expect(press('cpf', at('529.982.247-25', 14), '9')).toEqual(at('529.982.247-25', 14));
    expect(press('phone', at('(11) 91234-5678', 9), '8')).toEqual(at('(11) 91234-5678', 9));
  });

  it('money keeps two decimals, one comma and nine integer digits', () => {
    expect(press('monthlyIncome', at('R$ 15.000,00', 12), '5').value).toBe('R$ 15.000,00');
    expect(press('monthlyIncome', at('R$ 15.000,00', 5), ',').value).toBe('R$ 15.000,00');
    expect(press('monthlyIncome', at('R$ 15.000,00', 5), '.').value).toBe('R$ 15.000,00');
    expect(press('monthlyIncome', at('R$ 15.000', 5), ',').value).toBe('R$ 15.000');
    expect(typed('monthlyIncome', '1234567890').value).toBe('R$ 123.456.789');
  });
});

describe('editing keeps every digit the clinic did not touch', () => {
  it('replacing the first digit keeps the zeros after it (R$ 30.500 → R$ 20.500)', () => {
    expect(press('monthlyIncome', at('R$ 30.500,00', 4), 'Backspace', '2')).toEqual(at('R$ 20.500,00', 4));
  });

  it('clearing the reais keeps the cents and adds no zero of its own (→ R$ 4.500,00)', () => {
    const cleared = press('monthlyIncome', at('R$ 15.000,00', 9), 'Backspace', 'Backspace', 'Backspace', 'Backspace', 'Backspace');
    expect(cleared).toEqual(at('R$ ,00', 3));
    expect(press('monthlyIncome', cleared, '4', '5', '0', '0')).toEqual(at('R$ 4.500,00', 8));
  });

  it('Backspace or Delete over the comma steps over it instead of merging the cents into the reais', () => {
    expect(press('monthlyIncome', at('R$ 15.000,00', 10), 'Backspace')).toEqual(at('R$ 15.000,00', 9));
    expect(press('monthlyIncome', at('R$ 15.000,00', 9), 'Delete')).toEqual(at('R$ 15.000,00', 10));
    expect(press('monthlyIncome', at('R$ 15.000,', 10), 'Backspace')).toEqual(at('R$ 15.000', 9));
  });

  it('Backspace or Delete next to a separator removes the digit beyond it', () => {
    expect(press('cpf', at('529.982.247-25', 4), 'Backspace')).toEqual(at('529.822.472-5', 2));
    expect(press('cpf', at('529.982.247-25', 3), 'Delete')).toEqual(at('529.822.472-5', 3));
    expect(press('phone', at('(11) 91234-5678', 10), 'Delete')).toEqual(at('(11) 91234-678', 10));
    expect(press('monthlyIncome', at('R$ 15.000', 5), 'Delete')).toEqual(at('R$ 1.500', 6));
  });

  it('Backspace from the end empties the field one digit at a time', () => {
    expect(press('phone', at('(11) 9', 6), 'Backspace')).toEqual(at('(11', 3));
    expect(press('monthlyIncome', at('R$ 1', 4), 'Backspace')).toEqual(at('', 0));
  });
});

describe('paste', () => {
  it('reads a celular with country code or trunk prefix as the national number', () => {
    expect(paste('phone', '+55 98 98912-3456').value).toBe('(98) 98912-3456');
    expect(paste('phone', '+55 (11) 91234-5678').value).toBe('(11) 91234-5678');
    expect(paste('phone', '(011) 91234-5678').value).toBe('(11) 91234-5678');
  });

  it('masks a CPF pasted with spaces or a label', () => {
    expect(paste('cpf', ' 529.982.247-25 ').value).toBe('529.982.247-25');
    expect(paste('cpf', 'CPF 52998224725').value).toBe('529.982.247-25');
  });

  it('takes an unambiguous amount and leaves an ambiguous one as pasted, for the schema to reject', () => {
    expect(paste('monthlyIncome', 'R$ 15.000,00').value).toBe('R$ 15.000,00');
    expect(paste('monthlyIncome', '15000').value).toBe('R$ 15.000,00');
    expect(paste('monthlyIncome', '3500.00').value).toBe('3500.00');
    expect(paste('monthlyIncome', '15,000.00').value).toBe('15,000.00');
    expect(paste('phone', '119123456789').value).toBe('119123456789');
  });
});

describe('pure formatters', () => {
  it('format what they get and never invent or drop zeros', () => {
    expect(formatCpfInput('52998224725999')).toBe('529.982.247-25');
    expect(formatPhoneInput('(11) 91234-5678')).toBe('(11) 91234-5678');
    expect(formatMoneyInput('R$ 15.000,00')).toBe('R$ 15.000,00');
    expect(formatMoneyInput('0500')).toBe('R$ 0.500');
    expect(formatMoneyInput(',5')).toBe('R$ ,5');
    expect(formatMoneyInput('abc')).toBe('');
  });

  it('leave fields without a mask alone', () => {
    expect(maskInput('fullName', '', 'Ana', 3, 'insertText')).toBeNull();
  });
});

describe('formatOnBlur', () => {
  it('completes money with its cents', () => {
    expect(formatOnBlur('monthlyIncome', 'R$ 15.000,')).toBe('R$ 15.000,00');
    expect(formatOnBlur('treatmentAmount', 'R$ 1.500,5')).toBe('R$ 1.500,50');
    expect(formatOnBlur('monthlyIncome', 'R$ ,5')).toBe('R$ 0,50');
    expect(formatOnBlur('monthlyIncome', 'R$ 0.500')).toBe('R$ 500,00');
  });

  it('applies the full CPF and celular masks, and is stable', () => {
    expect(formatOnBlur('cpf', ' 52998224725 ')).toBe('529.982.247-25');
    expect(formatOnBlur('phone', formatOnBlur('phone', '11912345678'))).toBe('(11) 91234-5678');
  });

  it('leaves other fields and anything ambiguous as typed', () => {
    expect(formatOnBlur('fullName', ' Ana ')).toBe(' Ana ');
    expect(formatOnBlur('birthDate', '')).toBe('');
    expect(formatOnBlur('monthlyIncome', '3500.00')).toBe('3500.00');
    expect(formatOnBlur('phone', '119123456789')).toBe('119123456789');
  });
});
