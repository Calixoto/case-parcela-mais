import path from 'node:path';

export type AppConfig = {
  /** SQLite file; `':memory:'` for tests. */
  readonly databasePath: string;
  /** Global deadline of one consultation, measured on the server. */
  readonly consultationDeadlineMs: number;
  /** Interval the browser uses to poll the consultation snapshot. */
  readonly pollIntervalMs: number;
  /** `Secure` cookie attribute: only behind TLS. The Docker demo runs over plain HTTP. */
  readonly cookieSecure: boolean;
  /** Civil calendar used to compute ages ("today" for the patient's age). */
  readonly timeZone: string;
};

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Reads configuration from the environment at call time (never captured at build time). */
export function getConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    databasePath: env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'app.sqlite'),
    consultationDeadlineMs: positiveInt(env.CONSULTATION_DEADLINE_MS, 10_000),
    pollIntervalMs: positiveInt(env.POLL_INTERVAL_MS, 750),
    cookieSecure: env.COOKIE_SECURE === 'true',
    timeZone: env.TZ && env.TZ.includes('/') ? env.TZ : 'America/Sao_Paulo',
  };
}
