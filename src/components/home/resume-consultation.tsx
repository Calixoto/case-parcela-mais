import Link from 'next/link';
import { buttonVariants } from '@/src/components/ui/button';
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
    // A navigation, so a real link styled as a button (the classic shadcn pattern) keeps link semantics.
    <Link href={`/consultations/${id}`} className={buttonVariants({ variant: 'outline' })}>
      {copy.home.resume}: {fullName}
    </Link>
  );
}
