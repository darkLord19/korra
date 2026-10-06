import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { migrateBundled, type MigrationClient } from "./browser-migrate";
import { MIGRATIONS } from "./migrations.generated";
import { createTestDb } from "./testing";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

const columns = async (c: PGlite) =>
  (
    await c.query<{ t: string; c: string; ty: string; n: string }>(
      `SELECT table_name t, column_name c, data_type ty, is_nullable n FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name <> '__korra_migrations' AND table_name NOT LIKE '\\_\\_drizzle%' ORDER BY 1, 2`,
    )
  ).rows;

describe("browser migrator", () => {
  it("bundled migrations match migrations/*.sql (run `pnpm db:bundle-migrations`)", () => {
    for (const m of MIGRATIONS) {
      const sql = readFileSync(join(dir, `${m.tag}.sql`), "utf8");
      expect(m.statements).toEqual(sql.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean));
    }
  });

  it("produces the same schema as the drizzle fs migrator, and is idempotent", async () => {
    const client = new PGlite();
    const first = await migrateBundled(client as unknown as MigrationClient, MIGRATIONS);
    expect(first.applied).toEqual(MIGRATIONS.map((m) => m.tag));
    const second = await migrateBundled(client as unknown as MigrationClient, MIGRATIONS);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(MIGRATIONS.map((m) => m.tag));

    const reference = (await createTestDb()).$client;
    expect(await columns(client)).toEqual(await columns(reference));
  });
});
