'use server';

import { redirect } from 'next/navigation';
import { copy } from '@/src/copy/pt-BR';
import { getDb } from '@/src/db/client';
import { chooseOffer } from '@/src/server/choices.service';

export type ChooseOfferState = { readonly error?: string; readonly attempt: number };

const messages = {
  not_found: copy.api.notFound,
  already_chosen: copy.errors.alreadyChosen,
  lender_not_approved: copy.errors.offerUnavailable,
  term_not_offered: copy.errors.offerUnavailable,
} as const;

/** The clicked button carries "lenderId:termMonths"; everything else is re-read from the database. */
export async function chooseOfferAction(prev: ChooseOfferState, formData: FormData): Promise<ChooseOfferState> {
  const consultationId = String(formData.get('consultationId') ?? '');
  const [lenderId, term] = String(formData.get('offer') ?? '').split(':');
  const termMonths = Number(term);
  if (!consultationId || !lenderId || !Number.isInteger(termMonths)) return { error: copy.errors.chooseFailed, attempt: prev.attempt + 1 };

  let result: ReturnType<typeof chooseOffer>;
  try {
    result = chooseOffer(getDb(), { consultationId, lenderId, termMonths }, { now: Date.now() });
  } catch (error) {
    console.error(JSON.stringify({ event: 'choose_offer_failed', consultationId, error: error instanceof Error ? error.message : String(error) }));
    return { error: copy.errors.chooseFailed, attempt: prev.attempt + 1 };
  }
  if (!result.ok) return { error: messages[result.code], attempt: prev.attempt + 1 };
  redirect(`/consultations/${consultationId}/confirmation`);
}
