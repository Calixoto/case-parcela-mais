import Link from 'next/link';
import { buttonVariants } from '@/src/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/src/components/ui/empty';
import { copy } from '@/src/copy/pt-BR';
import type { ConsultationSummary } from '@/src/domain/types';

/** Nobody approved: say how many refused or failed and offer the next step that can actually help. */
export function NoApprovalPanel({ summary }: { readonly summary: ConsultationSummary }) {
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
          <Link href={`/register/financing?hint=${hintKey}`} className={buttonVariants()}>
            {lowerAmount ? copy.actions.tryLowerAmount : copy.actions.consultAgain}
          </Link>
        </EmptyContent>
      </Empty>
    </section>
  );
}
