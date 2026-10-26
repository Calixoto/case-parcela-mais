'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/src/components/ui/button';
import { Spinner } from '@/src/components/ui/spinner';

type Props = {
  readonly children: ReactNode;
  readonly pendingLabel: string;
  readonly variant?: 'primary' | 'secondary';
  readonly name?: string;
  readonly value?: string;
  readonly formNoValidate?: boolean;
};

const variants = { primary: 'default', secondary: 'outline' } as const;

/** Must be rendered inside the <form>: useFormStatus reads the pending state of the parent form. */
export function SubmitButton({ children, pendingLabel, variant = 'primary', name, value, formNoValidate }: Props) {
  const { pending, data } = useFormStatus();
  // Every submit button locks while the form is in flight; only the one that was pressed shows the pending state.
  const pressed = name === undefined || data?.get(name) === (value ?? '');
  return (
    <Button type="submit" variant={variants[variant]} name={name} value={value} formNoValidate={formNoValidate} disabled={pending}>
      {pending && pressed ? (
        <>
          <Spinner aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
