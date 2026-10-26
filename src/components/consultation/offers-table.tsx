'use client';

import { useQueryState } from 'nuqs';
import { useActionState, useMemo } from 'react';
import { useFormStatus } from 'react-dom';
import { chooseOfferAction, type ChooseOfferState } from '@/app/consultations/actions';
import { copy } from '@/src/copy/pt-BR';
import { formatBRL } from '@/src/domain/money';
import { sortOffers } from '@/src/domain/sorting';
import { SORT_CRITERIA, type ChosenOffer, type Offer, type SortCriterion } from '@/src/domain/types';
import { sortParser } from '@/src/url-state/parsers';

type Props = {
  readonly consultationId: string;
  readonly offers: readonly Offer[];
  readonly choice: ChosenOffer | null;
  readonly querying: boolean;
};

const initialChooseState: ChooseOfferState = { attempt: 0 };

const sortLabels: Record<SortCriterion, string> = { installment: copy.offers.sortInstallment, total: copy.offers.sortTotal };

/** Desktop: one ledger line per lender × term. Mobile: the same line folded in two (amounts, then details). */
const ROW_GRID = 'md:grid md:grid-cols-[4rem_8.5rem_9rem_1fr_auto] md:items-center md:gap-x-4';

/** Offers sorted on the client from URL state (`?sort=`); the amounts were computed on the server. */
export function OffersTable({ consultationId, offers, choice, querying }: Props) {
  const [sort, setSort] = useQueryState('sort', sortParser);
  const sorted = useMemo(() => sortOffers(offers, sort), [offers, sort]);
  const [state, formAction] = useActionState(chooseOfferAction, initialChooseState);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="offers-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="offers-title" className="font-display text-2xl">
          {copy.offers.title(offers.length)}
        </h2>
        <fieldset className="flex flex-wrap items-center gap-2 text-sm">
          <legend className="sr-only">{copy.offers.sortBy}</legend>
          <span className="text-ink-muted">{copy.offers.sortBy}</span>
          {SORT_CRITERIA.map((criterion) => (
            <label
              key={criterion}
              className={`cursor-pointer rounded-control border px-3 py-1 ${sort === criterion ? 'border-ink bg-enamel text-ink' : 'border-rule text-ink-muted'}`}
            >
              <input type="radio" name="sort" value={criterion} checked={sort === criterion} onChange={() => void setSort(criterion)} className="sr-only" />
              {sortLabels[criterion]}
            </label>
          ))}
        </fieldset>
      </div>

      {querying ? <p className="text-sm text-ink-muted">{copy.consultation.inProgress}</p> : null}
      {offers.length === 0 ? <p className="text-ink-muted">{copy.offers.waiting}</p> : null}

      {offers.length > 0 ? (
        <form action={formAction}>
          <input type="hidden" name="consultationId" value={consultationId} />
          <div aria-hidden className={`hidden border-b border-rule pb-2 text-sm text-ink-muted ${ROW_GRID}`}>
            <span>{copy.offers.columns.term}</span>
            <span>{copy.offers.columns.installment}</span>
            <span>{copy.offers.columns.total}</span>
            <span>{copy.offers.columns.lender}</span>
            <span />
          </div>
          <ul aria-label={copy.offers.listLabel} className="divide-y divide-rule border-b border-rule">
            {sorted.map((offer) => {
              const value = `${offer.lenderId}:${offer.termMonths}`;
              const chosen = choice !== null && choice.lenderId === offer.lenderId && choice.termMonths === offer.termMonths;
              return (
                <li key={value} className={`flex items-start justify-between gap-3 py-3 ${ROW_GRID} ${chosen ? 'bg-mint-soft' : ''}`}>
                  <div className="flex flex-col gap-0.5 md:contents">
                    <div className="flex items-baseline gap-3 md:contents">
                      <span className="font-display text-2xl">{copy.offers.termTimes(offer.termMonths)}</span>
                      <span className="font-display text-2xl">{formatBRL(offer.installmentCents)}</span>
                    </div>
                    <span className="text-sm text-ink-muted md:text-base">{copy.offers.total(formatBRL(offer.totalCents))}</span>
                    <span className="text-sm md:text-base">
                      <span className="md:block">{offer.lenderName}</span>
                      <span className={`md:block ${offer.isPartial ? 'text-amber' : 'text-ink-muted'}`}>
                        {' '}
                        {offer.isPartial ? copy.offers.coveragePartial(offer.coveragePercent, formatBRL(offer.uncoveredCents)) : copy.offers.coverageFull}
                      </span>
                    </span>
                  </div>
                  <ChooseButton value={value} disabled={choice !== null} />
                </li>
              );
            })}
          </ul>
          {state.error ? (
            <p role="alert" className="mt-3 rounded-control bg-brick-soft px-4 py-3 text-brick">
              {state.error}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}

function ChooseButton({ value, disabled }: { readonly value: string; readonly disabled: boolean }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get('offer') === value;
  return (
    <button
      type="submit"
      name="offer"
      value={value}
      disabled={disabled || pending}
      className="inline-flex h-10 shrink-0 items-center rounded-control bg-mint px-4 text-sm font-medium text-enamel disabled:opacity-50"
    >
      {mine ? copy.actions.choosing : copy.actions.choose}
    </button>
  );
}
