import Link from 'next/link';
import { copy } from '@/src/copy/pt-BR';
import { getDb } from '@/src/db/client';
import { readLastConsultationId } from '@/src/server/draft-cookie';
import { getConsultation } from '@/src/server/repositories';

/**
 * "Retomar consulta": the last consultation started from this browser (httpOnly cookie), if it still exists.
 * Reads the cookie first, so the synchronous SQLite lookup is request-time and never part of the static shell.
 * A convenience only: if the database is unavailable the home page must still render, so failures are logged and hidden.
 */
export async function ResumeConsultation() {
  const id = await readLastConsultationId();
  if (!id) return null;
  let fullName: string | null = null;
  try {
    fullName = getConsultation(getDb(), id)?.fullName ?? null;
  } catch (error) {
    console.error(JSON.stringify({ event: 'resume_lookup_failed', consultationId: id, error: error instanceof Error ? error.message : String(error) }));
  }
  if (!fullName) return null;
  return (
    <Link href={`/consultations/${id}`} className="inline-flex h-12 w-fit items-center rounded-control border border-rule px-5 font-medium text-ink hover:border-ink">
      {copy.home.resume}: {fullName}
    </Link>
  );
}
