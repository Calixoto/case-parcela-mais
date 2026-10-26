'use client';

import { useActionState, useMemo, type FormEvent } from 'react';
import { submitFinancingStep, submitPatientStep, type StepFormState } from '@/app/register/actions';
import { Alert, AlertDescription, AlertTitle } from '@/src/components/ui/alert';
import { FieldGroup } from '@/src/components/ui/field';
import { copy } from '@/src/copy/pt-BR';
import { createPatientStepSchema, financingStepSchema, type RawDraft } from '@/src/domain/registration-schema';
import { REGISTRATION_STEPS, type StepSlug } from '@/src/domain/registration-steps';
import type { ScenarioId } from '@/src/domain/types';
import type { Hint } from '@/src/url-state/parsers';
import { SubmitButton } from '../form/submit-button';
import { TextField } from '../form/text-field';
import { useStepValidation } from '../form/use-step-validation';
import { ScenarioSelect } from './scenario-select';

const initialStepState: StepFormState = { attempt: 0 };

/** Why the clinic is back on the amount step; the same keys the no-approval panel puts in ?hint=. */
const hintCopy: Record<Hint, string> = { lower_amount: copy.offers.hintLowerAmount, retry: copy.offers.hintRetry, retry_refused: copy.offers.hintRetryRefused };

type Props = {
  readonly step: StepSlug;
  readonly draft: RawDraft;
  readonly scenario: ScenarioId | null;
  readonly hint: Hint | null;
  readonly todayIso: string;
};

/**
 * Owns the Server Action state, so it must stay mounted across re-renders (an action that sets the cookie
 * re-renders the page with a new draft). Only the body remounts: after each server answer (echoed values,
 * fresh client errors) and whenever the stored draft changes ("Nova simulação", back navigation under <Activity>).
 */
export function StepForm(props: Props) {
  const action = props.step === 'patient' ? submitPatientStep : submitFinancingStep;
  const [state, formAction] = useActionState(action, initialStepState);
  return <StepFormBody key={`${state.attempt}:${JSON.stringify(props.draft)}`} {...props} state={state} formAction={formAction} />;
}

type BodyProps = Props & { readonly state: StepFormState; readonly formAction: (formData: FormData) => void };

function StepFormBody({ step, draft, scenario, hint, todayIso, state, formAction }: BodyProps) {
  const values: RawDraft = { ...draft, ...state.values };
  const fields = REGISTRATION_STEPS.find((candidate) => candidate.slug === step)!.fields;
  const schema = useMemo(() => (step === 'patient' ? createPatientStepSchema(todayIso) : financingStepSchema), [step, todayIso]);
  const { errorFor, onBlur, onChange, validateAll } = useStepValidation(schema, fields, state.fieldErrors);

  // "Voltar" never validates; "Continuar" validates on the client first (the server validates again).
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.value === 'back') return;
    if (!validateAll(event.currentTarget)) event.preventDefault();
  };

  const shared = { onBlur, onChange };
  const isFinancing = step === 'financing';

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      <FieldGroup>
        {step === 'patient' ? (
          <>
            <TextField name="fullName" label={copy.fields.fullName.label} placeholder={copy.fields.fullName.placeholder} defaultValue={values.fullName} error={errorFor('fullName')} maxLength={120} autoComplete="name" autoFocus {...shared} />
            <TextField name="cpf" label={copy.fields.cpf.label} placeholder={copy.fields.cpf.placeholder} defaultValue={values.cpf} error={errorFor('cpf')} inputMode="numeric" maxLength={14} autoComplete="off" {...shared} />
            <TextField name="birthDate" label={copy.fields.birthDate.label} type="date" max={todayIso} defaultValue={values.birthDate} error={errorFor('birthDate')} autoComplete="bday" {...shared} />
            <TextField name="phone" label={copy.fields.phone.label} placeholder={copy.fields.phone.placeholder} defaultValue={values.phone} error={errorFor('phone')} inputMode="tel" maxLength={16} autoComplete="tel-national" {...shared} />
          </>
        ) : (
          <>
            {hint ? (
              <Alert id="amount-hint" role="status">
                <AlertDescription>{hintCopy[hint]}</AlertDescription>
              </Alert>
            ) : null}
            <TextField name="monthlyIncome" label={copy.fields.monthlyIncome.label} placeholder={copy.fields.monthlyIncome.placeholder} defaultValue={values.monthlyIncome} error={errorFor('monthlyIncome')} inputMode="decimal" maxLength={24} autoComplete="off" autoFocus={!hint} {...shared} />
            <TextField name="treatmentAmount" label={copy.fields.treatmentAmount.label} placeholder={copy.fields.treatmentAmount.placeholder} help={copy.fields.treatmentAmount.help} defaultValue={values.treatmentAmount} error={errorFor('treatmentAmount')} inputMode="decimal" maxLength={24} autoComplete="off" autoFocus={Boolean(hint)} describedBy={hint ? 'amount-hint' : undefined} {...shared} />
          </>
        )}
      </FieldGroup>

      {/* The scenario is URL state; on step 1 it only travels along to step 2. */}
      {!isFinancing && scenario ? <input type="hidden" name="scenario" value={scenario} /> : null}
      {isFinancing ? <ScenarioSelect /> : null}

      {state.formError ? (
        <Alert variant="destructive">
          <AlertTitle>{state.formError}</AlertTitle>
        </Alert>
      ) : null}

      {/* "Continuar" comes first in the DOM, so Enter in a field moves forward; the row is reversed to keep "Voltar" on the left. */}
      <div className="flex flex-row-reverse flex-wrap justify-end gap-3">
        <SubmitButton name="intent" value="next" pendingLabel={isFinancing ? copy.actions.consulting : copy.actions.sending}>
          {isFinancing ? copy.actions.consult : copy.actions.continue}
        </SubmitButton>
        <SubmitButton variant="secondary" name="intent" value="back" formNoValidate pendingLabel={copy.actions.back}>
          {copy.actions.back}
        </SubmitButton>
      </div>
    </form>
  );
}
