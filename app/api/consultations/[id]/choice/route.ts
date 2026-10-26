import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { copy } from '@/src/copy/pt-BR';
import { getDb } from '@/src/db/client';
import { chooseOffer } from '@/src/server/choices.service';
import { apiError, json } from '@/src/server/http';

const bodySchema = z.object({
  lenderId: z.string().min(1),
  termMonths: z.number().int().positive(),
});

/** Saves the chosen offer after validating it against what this consultation actually offered. */
export async function POST(request: NextRequest, context: RouteContext<'/api/consultations/[id]/choice'>) {
  const { id } = await context.params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError('invalid_json', copy.api.invalidJson, 400);
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return apiError('validation_failed', copy.api.validationFailed, 422);

  let result: ReturnType<typeof chooseOffer>;
  try {
    result = chooseOffer(getDb(), { consultationId: id, ...parsed.data }, { now: Date.now() });
  } catch (error) {
    console.error(JSON.stringify({ event: 'choose_offer_failed', consultationId: id, error: error instanceof Error ? error.message : String(error) }));
    return apiError('internal_error', copy.api.internalError, 500);
  }
  if (result.ok) return json({ choice: result.choice }, result.created ? 201 : 200);
  switch (result.code) {
    case 'not_found':
      return apiError(result.code, copy.api.notFound, 404);
    case 'already_chosen':
      return apiError(result.code, copy.api.alreadyChosen, 409);
    case 'lender_not_approved':
      return apiError(result.code, copy.api.lenderNotApproved, 422);
    case 'term_not_offered':
      return apiError(result.code, copy.api.termNotOffered, 422);
  }
}
