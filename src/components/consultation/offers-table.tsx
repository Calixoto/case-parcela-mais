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

/** Offers as a ledger: one line per lender × term, sorted on the client from URL state (`?sort=`). */
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
        <fieldset className="flex items-center gap-2 text-sm">
          <legend className="sr-only">{copy.offers.sortBy}</legend>
          <span className="text-ink-muted">{copy.offers.sortBy}</span>
          {SORT_CRITERIA.map((criterion) => (
            <label key={criterion} className={`cursor-pointer rounded-control border px-3 py-1 ${sort === criterion ? 'border-ink bg-enamel text-ink' : 'border-rule text-ink-muted'}`}>
              <input type="radio" name="sort" value={criterion} checked={sort === criterion} onChange={() => void setSort(criterion)} className="sr-only" />
              {sortLabels[criterion]}
            </label>
          ))}
        </fieldset>
      </div>

      {querying ? <p className="text-sm text-ink-muted">{copy.consultation.inProgress}</p> : null}
      {offers.length === 0 ? <p className="text-ink-muted">{copy.offers.waiting}</p> : null}

      {offers.length > 0 ? (
        <form action={formAction} className="overflow-x-auto">
          <input type="hidden" name="consultationId" value={consultationId} />
          <table className="w-full border-collapse text-left">
            <thead className="text-sm text-ink-muted">
              <tr className="border-b border-rule">
                <th scope="col" className="py-2 pr-3 font-normal">
                  Prazo
                </th>
                <th scope="col" className="py-2 pr-3 font-normal">
                  Parcela
                </th>
                <th scope="col" className="py-2 pr-3 font-normal">
                  Total pago
                </th>
                <th scope="col" className="py-2 pr-3 font-normal">
                  Financeira
                </th>
                <th scope="col" className="py-2 font-normal">
                  <span className="sr-only">Ação</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((offer) => {
                const value = `${offer.lenderId}:${offer.termMonths}`;
                const chosen = choice !== null && choice.lenderId === offer.lenderId && choice.termMonths === offer.termMonths;
                return (
                  <tr key={value} className={`border-b border-rule ${chosen ? 'bg-mint-soft' : ''}`}>
                    <td className="py-3 pr-3 font-display text-2xl">{copy.offers.termTimes(offer.termMonths)}</td>
                    <td className="py-3 pr-3 font-display text-2xl">{formatBRL(offer.installmentCents)}</td>
                    <td className="py-3 pr-3 text-ink-muted">{formatBRL(offer.totalCents)}</td>
                    <td className="py-3 pr-3">
                      <span className="block">{offer.lenderName}</span>
                      <span className={`block text-sm ${offer.isPartial ? 'text-amber' : 'text-ink-muted'}`}>
                        {offer.isPartial ? copy.offers.coveragePartial(offer.coveragePercent, formatBRL(offer.uncoveredCents)) : copy.offers.coverageFull}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <ChooseButton value={value} disabled={choice !== null} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
      className="inline-flex h-10 items-center rounded-control bg-mint px-4 text-sm font-medium text-enamel disabled:opacity-50"
    >
      {mine ? copy.actions.choosing : copy.actions.choose}
    </button>
  );
}
