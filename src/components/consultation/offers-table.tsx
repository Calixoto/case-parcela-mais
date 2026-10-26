'use client';

import { useQueryState } from 'nuqs';
import { useActionState, useMemo } from 'react';
import { useFormStatus } from 'react-dom';
import { chooseOfferAction, type ChooseOfferState } from '@/app/consultations/actions';
import { Alert, AlertTitle } from '@/src/components/ui/alert';
import { Badge } from '@/src/components/ui/badge';
import { Button } from '@/src/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader } from '@/src/components/ui/empty';
import { Spinner } from '@/src/components/ui/spinner';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/src/components/ui/toggle-group';
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

/** Offers sorted on the client from URL state (`?sort=`); the amounts were computed on the server. */
export function OffersTable({ consultationId, offers, choice, querying }: Props) {
  const [sort, setSort] = useQueryState('sort', sortParser);
  const sorted = useMemo(() => sortOffers(offers, sort), [offers, sort]);
  const [state, formAction] = useActionState(chooseOfferAction, initialChooseState);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="offers-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="offers-title" className="text-lg font-medium">
          {copy.offers.title(offers.length)}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{copy.offers.sortBy}</span>
          <ToggleGroup
            variant="outline"
            value={[sort]}
            // Re-clicking the pressed option yields []: ignore it, so one criterion is always selected.
            onValueChange={([next]) => {
              const criterion = SORT_CRITERIA.find((candidate) => candidate === next);
              if (criterion) void setSort(criterion);
            }}
            aria-label={copy.offers.sortBy}
          >
            {SORT_CRITERIA.map((criterion) => (
              <ToggleGroupItem key={criterion} value={criterion}>
                {sortLabels[criterion]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {querying ? <p className="text-sm text-muted-foreground">{copy.consultation.inProgress}</p> : null}

      {offers.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyDescription>{copy.offers.waiting}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="consultationId" value={consultationId} />
          <Table>
            <TableCaption className="sr-only">{copy.offers.listLabel}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{copy.offers.columns.term}</TableHead>
                <TableHead>{copy.offers.columns.installment}</TableHead>
                <TableHead>{copy.offers.columns.total}</TableHead>
                <TableHead>{copy.offers.columns.lender}</TableHead>
                <TableHead className="sr-only">{copy.offers.columns.action}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((offer) => {
                const value = `${offer.lenderId}:${offer.termMonths}`;
                const chosen = choice !== null && choice.lenderId === offer.lenderId && choice.termMonths === offer.termMonths;
                return (
                  <TableRow key={value} data-state={chosen ? 'selected' : undefined}>
                    <TableCell className="font-medium tabular-nums">{copy.offers.termTimes(offer.termMonths)}</TableCell>
                    <TableCell className="font-medium tabular-nums">{formatBRL(offer.installmentCents)}</TableCell>
                    <TableCell className="tabular-nums">{formatBRL(offer.totalCents)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <span>{offer.lenderName}</span>
                        {offer.isPartial ? (
                          <Badge variant="outline">{copy.offers.coveragePartial(offer.coveragePercent, formatBRL(offer.uncoveredCents))}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">{copy.offers.coverageFull}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {chosen ? <Badge>{copy.offers.chosen}</Badge> : <ChooseButton value={value} context={copy.offers.chooseContext(offer.lenderName, offer.termMonths, formatBRL(offer.installmentCents))} disabled={choice !== null} />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {state.error ? (
            <Alert variant="destructive">
              <AlertTitle>{state.error}</AlertTitle>
            </Alert>
          ) : null}
        </form>
      )}
    </section>
  );
}

/** `context` names the offer for assistive technology ("Escolher Beta, 24 parcelas de R$ 475,30"): twelve buttons would otherwise sound alike. */
function ChooseButton({ value, context, disabled }: { readonly value: string; readonly context: string; readonly disabled: boolean }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get('offer') === value;
  return (
    <Button type="submit" size="sm" name="offer" value={value} disabled={disabled || pending}>
      {mine ? (
        <>
          <Spinner aria-hidden />
          {copy.actions.choosing}
        </>
      ) : (
        copy.actions.choose
      )}
      <span className="sr-only"> {context}</span>
    </Button>
  );
}
