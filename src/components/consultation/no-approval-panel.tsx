import Link from 'next/link';
import { copy } from '@/src/copy/pt-BR';
import type { ConsultationSummary } from '@/src/domain/types';

/** Nobody approved: say how many refused or failed and offer the next step that can actually help. */
export function NoApprovalPanel({ summary }: { readonly summary: ConsultationSummary }) {
  const lowerAmount = summary.nextStep === 'lower_amount';
  return (
    <section className="flex flex-col gap-4 rounded-control border border-rule bg-enamel p-6" aria-labelledby="no-approval-title">
      <h2 id="no-approval-title" className="font-display text-2xl">
        {copy.offers.noneTitle}
      </h2>
      <p className="text-ink-muted">{copy.offers.noneLead(summary.refusedCount, summary.unavailableCount)}</p>
      <p>{lowerAmount ? copy.offers.hintLowerAmount : summary.unavailableCount > 0 ? copy.offers.hintRetry : copy.offers.hintRetryRefused}</p>
      <Link
        href={lowerAmount ? '/register/financing?hint=lower_amount' : '/register/financing?hint=retry'}
        className="inline-flex h-12 w-fit items-center rounded-control bg-mint px-5 font-medium text-enamel"
      >
        {lowerAmount ? copy.actions.tryLowerAmount : copy.actions.consultAgain}
      </Link>
    </section>
  );
}
