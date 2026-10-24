import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Locate the migrations folder both from sources (src/db) and the bundle (dist). */
export function migrationsDir(): string {
  const candidates = [path.resolve(here, "../../migrations"), path.resolve(here, "../migrations"), path.resolve(process.cwd(), "migrations")];
  return process.env.MIGRATIONS_DIR ?? candidates.find((c) => existsSync(c)) ?? candidates[0]!;
}

/** Apply pending *.sql migrations in filename order, each in its own transaction. */
export async function migrate(pool: pg.Pool, dir = migrationsDir()): Promise<string[]> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set((await pool.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  const done: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      done.push(file);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return done;
}
