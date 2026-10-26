import type { FieldErrors } from '@/src/domain/registration-schema';

/** JSON response that is never cached: every consultation read must reflect the database now. */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export type ApiError = { readonly code: string; readonly message: string; readonly errors?: FieldErrors };

export function apiError(code: string, message: string, status: number, errors?: FieldErrors): Response {
  const body: ApiError = errors ? { code, message, errors } : { code, message };
  return json(body, status);
}
