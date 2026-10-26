'use client';

import { useCallback, useRef, useState, type ChangeEvent, type FocusEvent } from 'react';
import type { z } from 'zod';
import { formatCpf, normalizeCpf } from '@/src/domain/cpf';
import { formatBRL, parseBRL } from '@/src/domain/money';
import { fieldErrorsOf, type FieldErrors } from '@/src/domain/registration-schema';

type ClientErrors = Record<string, string | undefined>;

/** Pretty-prints a value when the user leaves the field; the raw text is what gets validated and stored. */
export function formatOnBlur(name: string, value: string): string {
  const trimmed = value.trim();
  if (name === 'cpf' && normalizeCpf(trimmed).length === 11) return formatCpf(normalizeCpf(trimmed));
  if (name === 'phone') {
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (name === 'monthlyIncome' || name === 'treatmentAmount') {
    const cents = parseBRL(trimmed);
    if (cents !== null) return formatBRL(cents);
  }
  return value;
}

/**
 * Instant validation with the same zod schema the Server Action uses: a field is checked when the user
 * leaves it, and again on every keystroke once it has an error. Server errors show for untouched fields.
 */
export function useStepValidation(schema: z.ZodType, fields: readonly string[], serverErrors?: FieldErrors) {
  const [clientErrors, setClientErrors] = useState<ClientErrors>({});
  const touched = useRef(new Set<string>());

  const validate = useCallback(
    (form: HTMLFormElement, onlyField?: string): boolean => {
      const data = new FormData(form);
      const raw = Object.fromEntries(fields.map((field) => [field, String(data.get(field) ?? '')]));
      const result = schema.safeParse(raw);
      const errors: FieldErrors = result.success ? {} : fieldErrorsOf(result.error);
      setClientErrors((previous) => {
        const next: ClientErrors = { ...previous };
        for (const field of fields) {
          if (onlyField && field !== onlyField) continue;
          next[field] = errors[field]?.[0];
        }
        return next;
      });
      return result.success;
    },
    [schema, fields],
  );

  const onBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      input.value = formatOnBlur(input.name, input.value);
      touched.current.add(input.name);
      if (input.form) validate(input.form, input.name);
    },
    [validate],
  );

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      if (clientErrors[input.name] && input.form) validate(input.form, input.name);
    },
    [clientErrors, validate],
  );

  /** Before submitting: validates everything and focuses the first invalid field. Returns true when valid. */
  const validateAll = useCallback(
    (form: HTMLFormElement): boolean => {
      for (const field of fields) touched.current.add(field);
      const valid = validate(form);
      if (!valid) {
        const data = new FormData(form);
        const raw = Object.fromEntries(fields.map((field) => [field, String(data.get(field) ?? '')]));
        const result = schema.safeParse(raw);
        const errors = result.success ? {} : fieldErrorsOf(result.error);
        const first = fields.find((field) => errors[field]?.length);
        if (first) (form.elements.namedItem(first) as HTMLInputElement | null)?.focus();
      }
      return valid;
    },
    [fields, schema, validate],
  );

  const errorFor = (field: string): string | undefined =>
    touched.current.has(field) ? clientErrors[field] : (clientErrors[field] ?? serverErrors?.[field]?.[0]);

  return { errorFor, onBlur, onChange, validateAll };
}
