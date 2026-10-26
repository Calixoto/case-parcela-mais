'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

type Props = {
  readonly children: ReactNode;
  readonly pendingLabel: string;
  readonly variant?: 'primary' | 'secondary';
  readonly name?: string;
  readonly value?: string;
  readonly formNoValidate?: boolean;
};

const styles = {
  primary: 'bg-mint text-enamel hover:bg-[#19775f]',
  secondary: 'border border-rule bg-transparent text-ink hover:border-ink',
} as const;

/** Must be rendered inside the <form>: useFormStatus reads the pending state of the parent form. */
export function SubmitButton({ children, pendingLabel, variant = 'primary', name, value, formNoValidate }: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      formNoValidate={formNoValidate}
      disabled={pending}
      className={`inline-flex h-12 items-center justify-center rounded-control px-5 font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${styles[variant]}`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
