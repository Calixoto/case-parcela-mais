import { cookies } from 'next/headers';
import { z } from 'zod';
import type { RawDraft } from '@/src/domain/registration-schema';
import { getConfig } from './config';

/**
 * The registration draft lives in one httpOnly cookie holding the RAW strings as typed, so going back
 * (even with an invalid value half typed) and reloading never lose anything. The server re-validates
 * every use; a malformed or outdated cookie counts as absent. Written only by Server Actions.
 */
const DRAFT_COOKIE = 'pm_draft';
const LAST_CONSULTATION_COOKIE = 'pm_last_consultation';
const DRAFT_VERSION = 1;
const DAY_SECONDS = 60 * 60 * 24;

const draftCookieSchema = z.object({
  v: z.literal(DRAFT_VERSION),
  fields: z.record(z.string(), z.string()),
  updatedAt: z.number(),
});

function cookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: 'lax' as const, path: '/', maxAge, secure: getConfig().cookieSecure };
}

export function parseDraftCookie(value: string | undefined): RawDraft {
  if (!value) return {};
  try {
    const parsed = draftCookieSchema.safeParse(JSON.parse(value));
    return parsed.success ? (parsed.data.fields as RawDraft) : {};
  } catch {
    return {};
  }
}

export async function readDraft(): Promise<RawDraft> {
  return parseDraftCookie((await cookies()).get(DRAFT_COOKIE)?.value);
}

/** Replaces the stored draft (callers merge first). */
export async function writeDraft(fields: RawDraft, now = Date.now()): Promise<void> {
  const value = JSON.stringify({ v: DRAFT_VERSION, fields, updatedAt: now });
  (await cookies()).set(DRAFT_COOKIE, value, cookieOptions(DAY_SECONDS));
}

export async function clearDraft(): Promise<void> {
  (await cookies()).delete(DRAFT_COOKIE);
}

export async function readLastConsultationId(): Promise<string | null> {
  const value = (await cookies()).get(LAST_CONSULTATION_COOKIE)?.value;
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

export async function writeLastConsultationId(id: string): Promise<void> {
  (await cookies()).set(LAST_CONSULTATION_COOKIE, id, cookieOptions(7 * DAY_SECONDS));
}

export async function clearLastConsultationId(): Promise<void> {
  (await cookies()).delete(LAST_CONSULTATION_COOKIE);
}
