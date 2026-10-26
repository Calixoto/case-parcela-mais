import type { Database } from '@/src/db/client';
import { installmentCents, totalCents } from '@/src/domain/price';
import type { ChosenOffer } from '@/src/domain/types';
import { getChosenOffer, getConsultation, getLenderResults, insertChosenOffer } from './repositories';

export type ChooseOfferInput = { readonly consultationId: string; readonly lenderId: string; readonly termMonths: number };

export type ChooseOfferResult =
  | { readonly ok: true; readonly choice: ChosenOffer; readonly created: boolean }
  | { readonly ok: false; readonly code: 'not_found' | 'already_chosen' | 'lender_not_approved' | 'term_not_offered' };

/**
 * Validates the choice against what was actually offered in this consultation (never against the
 * current catalog, so a live rate change cannot alter an existing offer), recomputes the money and
 * stores a snapshot. One choice per consultation: the same choice again is idempotent, a different
 * one is refused (docs/02, trap 12).
 */
export function chooseOffer(db: Database, input: ChooseOfferInput, options: { readonly now: number }): ChooseOfferResult {
  const consultation = getConsultation(db, input.consultationId);
  if (!consultation) return { ok: false, code: 'not_found' };

  const existing = getChosenOffer(db, input.consultationId);
  if (existing) {
    const same = existing.lenderId === input.lenderId && existing.termMonths === input.termMonths;
    return same ? { ok: true, choice: existing, created: false } : { ok: false, code: 'already_chosen' };
  }

  const result = getLenderResults(db, input.consultationId).find((row) => row.lenderId === input.lenderId);
  if (!result || result.status !== 'approved' || result.approvedAmountCents === null || result.monthlyRate === null) {
    return { ok: false, code: 'lender_not_approved' };
  }
  if (!result.termsMonths.includes(input.termMonths)) return { ok: false, code: 'term_not_offered' };

  const installment = installmentCents(result.approvedAmountCents, result.monthlyRate, input.termMonths);
  const choice: ChosenOffer = {
    lenderId: result.lenderId,
    lenderName: result.lenderName,
    termMonths: input.termMonths,
    financedAmountCents: result.approvedAmountCents,
    monthlyRate: result.monthlyRate,
    installmentCents: installment,
    totalCents: totalCents(installment, input.termMonths),
  };
  try {
    insertChosenOffer(db, { ...choice, consultationId: input.consultationId, lenderResultId: result.id, createdAt: options.now });
  } catch (error) {
    // Two clicks racing: the UNIQUE(consultation_id) constraint keeps a single choice.
    if (String(error).includes('UNIQUE')) return { ok: false, code: 'already_chosen' };
    throw error;
  }
  return { ok: true, choice, created: true };
}
