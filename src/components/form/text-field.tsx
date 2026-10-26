'use client';

import type { ChangeEventHandler, FocusEventHandler, HTMLInputAutoCompleteAttribute } from 'react';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/src/components/ui/field';
import { Input } from '@/src/components/ui/input';

type Props = {
  readonly name: string;
  readonly label: string;
  readonly defaultValue?: string;
  readonly error?: string;
  readonly help?: string;
  readonly type?: 'text' | 'date';
  readonly inputMode?: 'text' | 'numeric' | 'decimal' | 'tel';
  readonly placeholder?: string;
  readonly autoComplete?: HTMLInputAutoCompleteAttribute;
  readonly autoFocus?: boolean;
  readonly max?: string;
  readonly maxLength?: number;
  /** Extra id to announce with the field (e.g. the banner that explains why the clinic is back here). */
  readonly describedBy?: string;
  readonly onBlur?: FocusEventHandler<HTMLInputElement>;
  readonly onChange?: ChangeEventHandler<HTMLInputElement>;
};

/** Labelled input with optional help text and an error message read by screen readers; the help yields to the error. */
export function TextField({ name, label, defaultValue, error, help, type = 'text', inputMode, placeholder, autoComplete, autoFocus, max, maxLength, describedBy: extraDescribedBy, onBlur, onChange }: Props) {
  const id = `field-${name}`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const showHelp = Boolean(help) && !error;
  const describedBy = [error ? errorId : null, showHelp ? helpId : null, extraDescribedBy ?? null].filter(Boolean).join(' ') || undefined;
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        max={max}
        maxLength={maxLength}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onBlur={onBlur}
        onChange={onChange}
      />
      {showHelp ? <FieldDescription id={helpId}>{help}</FieldDescription> : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </Field>
  );
}
