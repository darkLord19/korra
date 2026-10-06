/**
 * fs-free migrator for the browser (PGlite on IndexedDB). The SQL is bundled as strings
 * (`migrations.generated.ts`, produced from `migrations/*.sql` by `scripts/gen-migrations.mjs`).
 * Takes a minimal client interface so it works with PGlite, PGliteWorker and test doubles, and the
 * db package needs no PGlite runtime dependency. Applied migrations are tracked by tag in `__korra_migrations`.
 */
export interface BundledMigration {
  tag: string;
  when: number;
  /** Statements already split on `--> statement-breakpoint`. */
  statements: string[];
}

export interface MigrationClient {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(
    fn: (tx: { exec(sql: string): Promise<unknown>; query(sql: string, params?: unknown[]): Promise<unknown> }) => Promise<T>,
  ): Promise<T>;
}

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

export async function migrateBundled(client: MigrationClient, migrations: BundledMigration[]): Promise<MigrateResult> {
  await client.exec(
    'CREATE TABLE IF NOT EXISTS "__korra_migrations" (tag text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const done = new Set((await client.query<{ tag: string }>('SELECT tag FROM "__korra_migrations"')).rows.map((r) => r.tag));
  const result: MigrateResult = { applied: [], skipped: [] };
  for (const m of migrations) {
    if (done.has(m.tag)) {
      result.skipped.push(m.tag);
      continue;
    }
    // Statements + bookkeeping in one transaction: a half-applied migration never persists.
    await client.transaction(async (tx) => {
      for (const stmt of m.statements) await tx.exec(stmt);
      await tx.query('INSERT INTO "__korra_migrations" (tag) VALUES ($1)', [m.tag]);
    });
    result.applied.push(m.tag);
  }
  return result;
}
