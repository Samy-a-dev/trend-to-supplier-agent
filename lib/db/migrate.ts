/** Idempotent ClickHouse migration: applies every CREATE TABLE in schema.sql. */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { command, pingClickhouse } from "../adapters/clickhouse";

const here = dirname(fileURLToPath(import.meta.url));

export async function migrate(): Promise<void> {
  const sql = await readFile(join(here, "schema.sql"), "utf-8");
  // Strip full-line comments first (a comment may contain ';'), then split.
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    const name = stmt.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] ?? "(statement)";
    await command(stmt);
    console.log(`  ✓ ${name}`);
  }
}

// Run directly via `pnpm db:migrate`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  (async () => {
    console.log("Pinging ClickHouse…");
    if (!(await pingClickhouse())) {
      throw new Error("ClickHouse ping failed — check CLICKHOUSE_URL/USER/PASSWORD.");
    }
    console.log("Applying schema…");
    await migrate();
    console.log("Migration complete.");
    process.exit(0);
  })().catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  });
}
