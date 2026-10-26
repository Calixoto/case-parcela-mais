'use client';

import type { ChangeEventHandler, FocusEventHandler, HTMLInputAutoCompleteAttribute } from 'react';

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
  readonly onBlur?: FocusEventHandler<HTMLInputElement>;
  readonly onChange?: ChangeEventHandler<HTMLInputElement>;
};

/** Ruled input (bottom line only) with its label, optional help and the error message read by screen readers. */
export function TextField({ name, label, defaultValue, error, help, type = 'text', inputMode, placeholder, autoComplete, autoFocus, max, maxLength, onBlur, onChange }: Props) {
  const id = `field-${name}`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, help ? helpId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-ink-muted">
        {label}
      </label>
      <input
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
        className="input-ruled text-xl"
      />
      {help && !error ? (
        <p id={helpId} className="text-sm text-ink-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-brick">
          {error}
        </p>
      ) : null}
    </div>
  );
}
