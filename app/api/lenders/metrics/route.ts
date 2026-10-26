import { connection } from 'next/server';
import { getDb } from '@/src/db/client';
import { LENDERS } from '@/src/lenders/registry';
import { copy } from '@/src/copy/pt-BR';
import { apiError, json } from '@/src/server/http';
import { getLenderMetrics } from '@/src/server/metrics.service';

/** Response time and failure rate per lender, natural flow only (forced scenarios excluded). */
export async function GET() {
  await connection();
  try {
    return json({ generatedAt: Date.now(), lenders: getLenderMetrics(getDb(), LENDERS) });
  } catch (error) {
    console.error(JSON.stringify({ event: 'metrics_failed', error: error instanceof Error ? error.message : String(error) }));
    return apiError('internal_error', copy.api.internalError, 500);
  }
}
