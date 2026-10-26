import { describe, expect, it } from 'vitest';
import { copy } from '@/src/copy/pt-BR';
import {
  createConsultationInputSchema,
  createPatientStepSchema,
  createRegistrationSchema,
  fieldErrorsOf,
  financingStepSchema,
  type FieldErrors,
  type RawDraft,
} from './registration-schema';
import { isStepSlug, nextStep, previousStep, REGISTRATION_STEPS, stepIndex } from './registration-steps';

/** Reference date of docs/05 "Fronteiras de idade"; every age boundary below is relative to it. */
const TODAY = '2026-10-22';

/** Persona A of docs/03 (happy path), as typed in the form. */
const PERSONA_A: Required<RawDraft> = {
  fullName: 'Maria da Silva',
  cpf: '529.982.247-25',
  birthDate: '15/03/1996',
  phone: '(11) 91234-5678',
  monthlyIncome: 'R$ 5.000,00',
  treatmentAmount: '15.000,00',
};

/** Persona A normalized, as the schemas must return it. */
const PERSONA_A_PATIENT = { fullName: 'Maria da Silva', cpf: '52998224725', birthDate: '1996-03-15', phone: '11912345678' };
const PERSONA_A_FINANCING = { monthlyIncomeCents: 500000, treatmentAmountCents: 1500000 };

function patientErrors(overrides: RawDraft): FieldErrors {
  const result = createPatientStepSchema(TODAY).safeParse({ ...PERSONA_A, ...overrides });
  return result.success ? {} : fieldErrorsOf(result.error);
}

function financingErrors(overrides: RawDraft): FieldErrors {
  const result = financingStepSchema.safeParse({ ...PERSONA_A, ...overrides });
  return result.success ? {} : fieldErrorsOf(result.error);
}

describe('registration steps', () => {
  it('registers the two steps of docs/07 §4.4 in order, with their fields', () => {
    expect(REGISTRATION_STEPS.map((step) => step.slug)).toEqual(['patient', 'financing']);
    expect(REGISTRATION_STEPS[0].fields).toEqual(['fullName', 'cpf', 'birthDate', 'phone']);
    expect(REGISTRATION_STEPS[1].fields).toEqual(['monthlyIncome', 'treatmentAmount']);
  });

  it.each([
    ['patient', true],
    ['financing', true],
    ['confirmation', false],
    ['Patient', false],
    ['', false],
  ])('isStepSlug(%j) -> %s', (value, expected) => {
    expect(isStepSlug(value)).toBe(expected);
  });

  it('indexes the steps from 0', () => {
    expect(stepIndex('patient')).toBe(0);
    expect(stepIndex('financing')).toBe(1);
  });

  it('walks forward and backward, with null at both ends', () => {
    expect(nextStep('patient')).toBe('financing');
    expect(nextStep('financing')).toBeNull();
    expect(previousStep('financing')).toBe('patient');
    expect(previousStep('patient')).toBeNull();
  });
});

describe('createPatientStepSchema', () => {
  it('accepts persona A and normalizes CPF, phone and birth date', () => {
    expect(createPatientStepSchema(TODAY).parse(PERSONA_A)).toEqual(PERSONA_A_PATIENT);
  });

  it('treats missing fields as empty and reports every field with its pt-BR message', () => {
    expect(patientErrors({ fullName: undefined, cpf: undefined, birthDate: undefined, phone: undefined })).toEqual({
      fullName: [copy.errors.fullName],
      cpf: [copy.errors.cpf],
      birthDate: [copy.errors.birthDateInvalid],
      phone: [copy.errors.phone],
    });
  });

  describe('fullName', () => {
    it.each([
      ['Maria da Silva', 'Maria da Silva'],
      ['  Maria da Silva  ', 'Maria da Silva'],
      ["Ana D'Ávila", "Ana D'Ávila"],
      ['Anne-Marie Müller', 'Anne-Marie Müller'],
      ['José Çedilha Ñu', 'José Çedilha Ñu'],
      ['Jo Li', 'Jo Li'],
      [`${'A'.repeat(60)} ${'B'.repeat(59)}`, `${'A'.repeat(60)} ${'B'.repeat(59)}`],
    ])('accepts %j as %j', (input, expected) => {
      expect(createPatientStepSchema(TODAY).parse({ ...PERSONA_A, fullName: input }).fullName).toBe(expected);
    });

    it.each([
      ['', 'empty'],
      ['   ', 'only spaces'],
      ['Maria', 'one word'],
      ['Maria -', 'second word has no letter'],
      ['Jo', 'shorter than 3 characters'],
      ['Maria123 Silva', 'digits'],
      ['Maria@ Silva', 'symbols'],
      ['Maria. Silva', 'period'],
      [`${'A'.repeat(60)} ${'B'.repeat(60)}`, 'longer than 120 characters'],
    ])('rejects %j (%s) with copy.errors.fullName', (input) => {
      expect(patientErrors({ fullName: input })).toEqual({ fullName: [copy.errors.fullName] });
    });
  });

  describe('cpf (docs/05 "CPF")', () => {
    it.each([
      ['529.982.247-25', '52998224725'],
      ['52998224725', '52998224725'],
      ['123.456.789-09', '12345678909'],
      ['  529.982.247-25  ', '52998224725'],
    ])('accepts %j as %j', (input, expected) => {
      expect(createPatientStepSchema(TODAY).parse({ ...PERSONA_A, cpf: input }).cpf).toBe(expected);
    });

    it.each([
      ['111.111.111-11', 'repeated sequence'],
      ['000.000.000-00', 'repeated sequence'],
      ['123.456.789-00', 'wrong check digits'],
      ['1234567890', '10 digits'],
      ['123456789012', '12 digits'],
      ['529.982.24A-25', 'letter'],
      ['', 'empty'],
    ])('rejects %j (%s) with copy.errors.cpf', (input) => {
      expect(patientErrors({ cpf: input })).toEqual({ cpf: [copy.errors.cpf] });
    });
  });

  describe('birthDate (docs/05 "Fronteiras de idade", relative to 22/10/2026)', () => {
    it.each([
      ['15/03/1996', '1996-03-15'],
      ['1996-03-15', '1996-03-15'],
      ['22/10/2008', '2008-10-22'], // 18 today
      ['2008-10-22', '2008-10-22'],
      ['23/10/1945', '1945-10-23'], // 80 today
      ['29/02/2008', '2008-02-29'], // 18, leap-day birthday
      [' 15/03/1996 ', '1996-03-15'],
    ])('accepts %j as %j', (input, expected) => {
      expect(createPatientStepSchema(TODAY).parse({ ...PERSONA_A, birthDate: input }).birthDate).toBe(expected);
    });

    it.each([
      ['', copy.errors.birthDateInvalid],
      ['31/02/2000', copy.errors.birthDateInvalid],
      ['2001-02-29', copy.errors.birthDateInvalid],
      ['15-03-1996', copy.errors.birthDateInvalid],
      ['1996/03/15', copy.errors.birthDateInvalid],
      ['abc', copy.errors.birthDateInvalid],
      ['23/10/2026', copy.errors.birthDateFuture], // tomorrow: future, not age
      ['2027-01-01', copy.errors.birthDateFuture],
      ['01/01/2030', copy.errors.birthDateFuture],
      ['22/10/2026', copy.errors.age], // born today: 0 years
      ['23/10/2008', copy.errors.age], // 17
      ['22/10/1945', copy.errors.age], // 81
    ])('rejects %j with %j', (input, message) => {
      expect(patientErrors({ birthDate: input })).toEqual({ birthDate: [message] });
    });
  });

  describe('phone', () => {
    it.each([
      ['(11) 91234-5678', '11912345678'],
      ['11912345678', '11912345678'],
      ['11 9 1234 5678', '11912345678'],
      ['(99) 99999-9999', '99999999999'],
    ])('accepts %j as %j', (input, expected) => {
      expect(createPatientStepSchema(TODAY).parse({ ...PERSONA_A, phone: input }).phone).toBe(expected);
    });

    it.each([
      ['(11) 81234-5678', 'third digit is not 9'],
      ['1191234567', '10 digits'],
      ['119123456789', '12 digits'],
      ['(10) 91234-5678', 'DDD ending in 0'],
      ['(01) 91234-5678', 'DDD starting with 0'],
      ['+55 (11) 91234-5678', 'country code'],
      ['', 'empty'],
      ['abc', 'letters'],
    ])('rejects %j (%s) with copy.errors.phone', (input) => {
      expect(patientErrors({ phone: input })).toEqual({ phone: [copy.errors.phone] });
    });
  });
});

describe('financingStepSchema', () => {
  it('accepts persona A and returns integer cents under the *Cents names', () => {
    expect(financingStepSchema.parse(PERSONA_A)).toEqual(PERSONA_A_FINANCING);
  });

  it.each([
    ['R$ 5.000,00', 500000],
    ['5000', 500000],
    ['0,01', 1],
    ['R$ 1.234,56', 123456],
  ])('accepts monthlyIncome %j as %i cents', (input, expected) => {
    expect(financingStepSchema.parse({ ...PERSONA_A, monthlyIncome: input }).monthlyIncomeCents).toBe(expected);
  });

  it.each([
    ['', 'empty'],
    ['0', 'zero'],
    ['0,00', 'zero'],
    ['-100', 'negative'],
    ['abc', 'letters'],
    ['1,234.56', 'en-US separators'],
  ])('rejects monthlyIncome %j (%s) with copy.errors.monthlyIncome', (input) => {
    expect(financingErrors({ monthlyIncome: input })).toEqual({ monthlyIncome: [copy.errors.monthlyIncome] });
  });

  it.each([
    ['1.000,00', 100000],
    ['1.000', 100000],
    ['R$ 1.000,00', 100000],
    ['15.000,00', 1500000],
    ['50.000,00', 5000000],
  ])('accepts treatmentAmount %j as %i cents (docs/05 "Fronteiras de valor")', (input, expected) => {
    expect(financingStepSchema.parse({ ...PERSONA_A, treatmentAmount: input }).treatmentAmountCents).toBe(expected);
  });

  it.each([
    ['999,99', 'below the minimum'],
    ['50.000,01', 'above the maximum'],
    ['0', 'zero'],
    ['', 'empty'],
    ['abc', 'letters'],
  ])('rejects treatmentAmount %j (%s) with copy.errors.treatmentAmount', (input) => {
    expect(financingErrors({ treatmentAmount: input })).toEqual({ treatmentAmount: [copy.errors.treatmentAmount] });
  });

  it('treats missing fields as empty and reports both', () => {
    expect(financingErrors({ monthlyIncome: undefined, treatmentAmount: undefined })).toEqual({
      monthlyIncome: [copy.errors.monthlyIncome],
      treatmentAmount: [copy.errors.treatmentAmount],
    });
  });
});

describe('createRegistrationSchema', () => {
  it('parses the whole draft of persona A into the merged normalized output', () => {
    expect(createRegistrationSchema(TODAY).parse(PERSONA_A)).toEqual({ ...PERSONA_A_PATIENT, ...PERSONA_A_FINANCING });
  });

  it('reports every registered field of an empty draft, each with its own message', () => {
    const result = createRegistrationSchema(TODAY).safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = fieldErrorsOf(result.error);
    const everyField = REGISTRATION_STEPS.flatMap((step) => step.fields);
    expect(Object.keys(errors).sort()).toEqual([...everyField].sort());
    expect(errors).toEqual({
      fullName: [copy.errors.fullName],
      cpf: [copy.errors.cpf],
      birthDate: [copy.errors.birthDateInvalid],
      phone: [copy.errors.phone],
      monthlyIncome: [copy.errors.monthlyIncome],
      treatmentAmount: [copy.errors.treatmentAmount],
    });
  });

  it('collects errors from both steps in one pass', () => {
    const result = createRegistrationSchema(TODAY).safeParse({
      ...PERSONA_A,
      cpf: '111.111.111-11',
      treatmentAmount: '999,99',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrorsOf(result.error)).toEqual({
      cpf: [copy.errors.cpf],
      treatmentAmount: [copy.errors.treatmentAmount],
    });
  });
});

describe('createConsultationInputSchema (POST /api/consultations)', () => {
  const VALID_BODY = {
    patient: {
      fullName: 'Maria da Silva',
      cpf: '529.982.247-25',
      birthDate: '1996-03-15',
      phone: '(11) 91234-5678',
      monthlyIncomeCents: 500000,
    },
    treatmentAmountCents: 1500000,
    scenario: 'all_approve',
    overrides: { delta: { outcome: 'timeout' } },
  };

  function apiErrors(body: unknown): FieldErrors {
    const result = createConsultationInputSchema(TODAY).safeParse(body);
    return result.success ? {} : fieldErrorsOf(result.error);
  }

  it('accepts a full body, normalizes the patient and passes scenario and overrides through', () => {
    expect(createConsultationInputSchema(TODAY).parse(VALID_BODY)).toEqual({
      patient: { ...PERSONA_A_PATIENT, monthlyIncomeCents: 500000 },
      treatmentAmountCents: 1500000,
      scenario: 'all_approve',
      overrides: { delta: { outcome: 'timeout' } },
    });
  });

  it('accepts a body without scenario or overrides, and drops unknown keys', () => {
    const body = { patient: VALID_BODY.patient, treatmentAmountCents: VALID_BODY.treatmentAmountCents, extra: true };
    const parsed = createConsultationInputSchema(TODAY).parse(body);
    expect(parsed.scenario).toBeUndefined();
    expect(parsed.overrides).toBeUndefined();
    expect(parsed).not.toHaveProperty('extra');
  });

  it('also accepts the birth date in pt-BR format', () => {
    const body = { ...VALID_BODY, patient: { ...VALID_BODY.patient, birthDate: '15/03/1996' } };
    expect(createConsultationInputSchema(TODAY).parse(body).patient.birthDate).toBe('1996-03-15');
  });

  it.each<[unknown, string]>([
    [1500000.5, 'float cents'],
    ['1500000', 'string instead of number'],
    [99999, 'below the minimum (999,99)'],
    [5000001, 'above the maximum (50.000,01)'],
    [0, 'zero'],
    [undefined, 'missing'],
    [null, 'null'],
  ])('rejects treatmentAmountCents %j (%s) with copy.errors.treatmentAmount', (value) => {
    expect(apiErrors({ ...VALID_BODY, treatmentAmountCents: value })).toEqual({
      treatmentAmountCents: [copy.errors.treatmentAmount],
    });
  });

  it.each([
    [100000, 'the minimum (1.000,00)'],
    [5000000, 'the maximum (50.000,00)'],
  ])('accepts treatmentAmountCents %i (%s)', (value) => {
    expect(createConsultationInputSchema(TODAY).parse({ ...VALID_BODY, treatmentAmountCents: value }).treatmentAmountCents).toBe(value);
  });

  it.each<[unknown, string]>([
    [500000.5, 'float cents'],
    [0, 'zero'],
    [-1, 'negative'],
    ['500000', 'string instead of number'],
    [undefined, 'missing'],
  ])('rejects monthlyIncomeCents %j (%s) with copy.errors.monthlyIncome under patient', (value) => {
    const body = { ...VALID_BODY, patient: { ...VALID_BODY.patient, monthlyIncomeCents: value } };
    expect(apiErrors(body)).toEqual({ patient: [copy.errors.monthlyIncome] });
  });

  it.each(['delta_slow', 'ALL_APPROVE', '', null])('rejects scenario %j with copy.errors.scenario', (value) => {
    expect(apiErrors({ ...VALID_BODY, scenario: value })).toEqual({ scenario: [copy.errors.scenario] });
  });

  it('applies the same patient rules and messages as the form', () => {
    const body = {
      ...VALID_BODY,
      patient: { ...VALID_BODY.patient, cpf: '111.111.111-11', birthDate: '2008-10-23', phone: '1191234567' },
    };
    const errors = apiErrors(body);
    expect(errors.patient).toEqual(expect.arrayContaining([copy.errors.cpf, copy.errors.age, copy.errors.phone]));
    expect(errors.patient).toHaveLength(3);
  });

  it('reports a missing patient object in pt-BR', () => {
    expect(apiErrors({ treatmentAmountCents: 1500000 })).toEqual({ patient: [copy.api.validationFailed] });
  });
});

describe('fieldErrorsOf', () => {
  it('groups messages by top-level field; nested API fields fall under their parent', () => {
    const result = createConsultationInputSchema(TODAY).safeParse({
      patient: { fullName: 'Maria', cpf: '529.982.247-25', birthDate: '1996-03-15', phone: '11912345678', monthlyIncomeCents: 1 },
      treatmentAmountCents: 1,
      scenario: 'none',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrorsOf(result.error)).toEqual({
      patient: [copy.errors.fullName],
      treatmentAmountCents: [copy.errors.treatmentAmount],
      scenario: [copy.errors.scenario],
    });
  });
});
