import { connection } from 'next/server';
import { getDb } from '@/src/db/client';
import { LENDERS } from '@/src/lenders/registry';
import { json } from '@/src/server/http';
import { getLenderMetrics } from '@/src/server/metrics.service';

/** Response time and failure rate per lender, natural flow only (forced scenarios excluded). */
export async function GET() {
  await connection();
  return json({ generatedAt: Date.now(), lenders: getLenderMetrics(getDb(), LENDERS) });
}
