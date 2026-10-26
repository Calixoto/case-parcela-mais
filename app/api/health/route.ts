import { connection } from 'next/server';
import { getDb } from '@/src/db/client';

export async function GET() {
  await connection(); // never prerendered: the synchronous SQLite read must run per request
  let healthy = false;
  try {
    const row = getDb().prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
    healthy = row?.ok === 1;
  } catch (error) {
    console.error(JSON.stringify({ event: 'health_failed', error: error instanceof Error ? error.message : String(error) }));
  }
  return Response.json(
    { ok: healthy, db: healthy ? 'ok' : 'error' },
    { status: healthy ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
