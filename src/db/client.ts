import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getConfig } from '@/src/server/config';
import { reconcileExpiredConsultations } from '@/src/server/repositories';
import { MIGRATIONS } from './migrations';

export type Database = DatabaseSync;

/**
 * Opens a SQLite database, applies pragmas and pending migrations.
 * `':memory:'` gives an isolated database (used by the tests with the real repositories).
 */
export function openDatabase(location: string): Database {
  if (location !== ':memory:') mkdirSync(path.dirname(location), { recursive: true });
  const db = new DatabaseSync(location, { timeout: 5_000 }); // busy timeout: wait instead of SQLITE_BUSY
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  reconcileExpiredConsultations(db, Date.now()); // a restart mid-consultation leaves nothing stuck on "consultando"
  return db;
}

/** Applies every migration not yet recorded in `schema_migrations`, each in its own transaction. */
export function runMigrations(db: Database): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const applied = new Set(
    (db.prepare('SELECT name FROM schema_migrations').all() as Array<{ name: string }>).map((row) => row.name),
  );
  const ran: string[] = [];
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) continue;
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(migration.name, Date.now());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    ran.push(migration.name);
  }
  return ran;
}

type GlobalWithDb = typeof globalThis & { __parcelaMaisDb?: Database };

/**
 * Process-wide connection, opened lazily on first use (never at module scope: `next build`
 * imports server modules) and cached on `globalThis` so `next dev` HMR does not reopen it.
 */
export function getDb(): Database {
  const holder = globalThis as GlobalWithDb;
  holder.__parcelaMaisDb ??= openDatabase(getConfig().databasePath);
  return holder.__parcelaMaisDb;
}
