import { retryConsultation } from '@/app/register/actions';
import { SubmitButton } from '@/src/components/form/submit-button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/src/components/ui/empty';
import { copy } from '@/src/copy/pt-BR';
import type { ConsultationSummary } from '@/src/domain/types';

/** Nobody approved: say how many refused or failed and offer the next step that can actually help. */
export function NoApprovalPanel({ consultationId, summary }: { readonly consultationId: string; readonly summary: ConsultationSummary }) {
  const lowerAmount = summary.nextStep === 'lower_amount';
  // The same key picks the hint here and the banner on the amount step (?hint=), so the two never contradict each other.
  const hintKey = lowerAmount ? 'lower_amount' : summary.unavailableCount > 0 ? 'retry' : 'retry_refused';
  const hint = { lower_amount: copy.offers.hintLowerAmount, retry: copy.offers.hintRetry, retry_refused: copy.offers.hintRetryRefused }[hintKey];
  return (
    <section aria-labelledby="no-approval-title">
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle className="text-lg">
            <h2 id="no-approval-title">{copy.offers.noneTitle}</h2>
          </EmptyTitle>
          <EmptyDescription>
            {copy.offers.noneLead(summary.refusedCount, summary.unavailableCount)} {hint}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {/* A Server Action, not a link: the form was cleared when this consultation started and is refilled from it. */}
          <form action={retryConsultation}>
            <input type="hidden" name="consultationId" value={consultationId} />
            <input type="hidden" name="hint" value={hintKey} />
            <SubmitButton pendingLabel={copy.actions.sending}>{lowerAmount ? copy.actions.tryLowerAmount : copy.actions.consultAgain}</SubmitButton>
          </form>
        </EmptyContent>
      </Empty>
    </section>
  );
}
