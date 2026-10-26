import { connection, type NextRequest } from 'next/server';
import { copy } from '@/src/copy/pt-BR';
import { apiError, json } from '@/src/server/http';
import { readConsultationSnapshot } from '@/src/server/snapshot';

/** The snapshot the screen polls. Reading reconciles a consultation stuck past its deadline. */
export async function GET(_request: NextRequest, context: RouteContext<'/api/consultations/[id]'>) {
  await connection(); // per-request: the synchronous SQLite read must never be prerendered
  const { id } = await context.params;
  const snapshot = readConsultationSnapshot(id);
  if (!snapshot) return apiError('not_found', copy.api.notFound, 404);
  return json(snapshot);
}
