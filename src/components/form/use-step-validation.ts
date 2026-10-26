'use client';

import { useCallback, useRef, useState, type ChangeEvent, type CompositionEvent, type FocusEvent } from 'react';
import type { z } from 'zod';
import { fieldErrorsOf, type FieldErrors } from '@/src/domain/registration-schema';
import { formatOnBlur, maskInput } from './masks';

type ClientErrors = Record<string, string | undefined>;

/** What each input showed after its last mask or completion: an edit is read against it. */
const lastValues = new WeakMap<HTMLInputElement, string>();

/** Writes a value only when it changes (assigning to a half-typed date input would clear it) and remembers it. */
function writeValue(input: HTMLInputElement, value: string): void {
  if (value !== input.value) input.value = value;
  lastValues.set(input, value);
}

/** Rewrites the input with its mask while the clinic types, keeping the caret next to what was typed. */
function applyMask(input: HTMLInputElement, inputType: string): void {
  const previous = lastValues.get(input) ?? input.defaultValue;
  const masked = maskInput(input.name, previous, input.value, input.selectionStart ?? input.value.length, inputType);
  if (masked === null) return;
  writeValue(input, masked.value);
  input.setSelectionRange(masked.caret, masked.caret);
}

/**
 * Instant validation with the same zod schema the Server Action uses: a field the clinic changed is checked when it
 * is left, and again on every keystroke once it has an error. Server errors show for untouched fields.
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
      writeValue(input, formatOnBlur(input.name, input.value));
      // No error for a field left as it was (the autofocused one, say), nor when the focus goes to a button that skips
      // validation ("Voltar"): an error appearing mid-click pushes the buttons down and the click is lost.
      const towardsNoValidate = event.relatedTarget instanceof HTMLButtonElement && event.relatedTarget.formNoValidate;
      const untouched = input.value === input.defaultValue && !touched.current.has(input.name);
      if (towardsNoValidate || untouched) return;
      touched.current.add(input.name);
      if (input.form) validate(input.form, input.name);
    },
    [validate],
  );

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const native = event.nativeEvent as InputEvent;
      // While an IME composes, the text is not final: the mask runs on compositionend instead.
      if (native.isComposing) return;
      // Autofill and other edits without an inputType are read like a paste: the whole value is new.
      applyMask(input, native.inputType || 'insertFromPaste');
      if (clientErrors[input.name] && input.form) validate(input.form, input.name);
    },
    [clientErrors, validate],
  );

  /** Before submitting: completes every value (as leaving it would), validates everything and focuses the first invalid field. */
  const validateAll = useCallback(
    (form: HTMLFormElement): boolean => {
      for (const field of fields) {
        touched.current.add(field);
        // Runs before React reads the FormData, so "R$ 15.000," submitted with Enter reaches the server as "R$ 15.000,00".
        const input = form.elements.namedItem(field);
        if (input instanceof HTMLInputElement) writeValue(input, formatOnBlur(field, input.value));
      }
      const valid = validate(form);
      if (!valid) {
        const data = new FormData(form);
        const raw = Object.fromEntries(fields.map((field) => [field, String(data.get(field) ?? '')]));
        const result = schema.safeParse(raw);
        const errors = result.success ? {} : fieldErrorsOf(result.error);
        const first = fields.find((field) => errors[field]?.length);
        // Next frame: a Base UI button focuses itself after its click handlers, which would steal the focus back.
        if (first) requestAnimationFrame(() => (form.elements.namedItem(first) as HTMLInputElement | null)?.focus());
      }
      return valid;
    },
    [fields, schema, validate],
  );

  const errorFor = (field: string): string | undefined =>
    touched.current.has(field) ? clientErrors[field] : (clientErrors[field] ?? serverErrors?.[field]?.[0]);

  const onCompositionEnd = useCallback((event: CompositionEvent<HTMLInputElement>) => applyMask(event.currentTarget, 'insertFromPaste'), []);

  return { errorFor, onBlur, onChange, onCompositionEnd, validateAll };
}
