import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { rootDir } from "../src/config.js";
import { createPostgresClient } from "./postgres-client.js";

const migrationsDir = join(rootDir, "db", "postgres", "migrations");
const client = createPostgresClient();

try {
  await client.connect();
  await ensureMigrationTable();

  const migrations = (await readdir(migrationsDir))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();
  const applied = await appliedMigrations();
  let appliedCount = 0;

  for (const file of migrations) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW())",
        [file]
      );
      await client.query("COMMIT");
      appliedCount += 1;
      console.log(`Migration appliquee: ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  if (appliedCount === 0) {
    console.log("Aucune migration PostgreSQL a appliquer.");
  } else {
    console.log(`${appliedCount} migration(s) PostgreSQL appliquee(s).`);
  }
} finally {
  await client.end().catch(() => {});
}

async function ensureMigrationTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedMigrations() {
  const result = await client.query("SELECT version FROM schema_migrations");
  return new Set(result.rows.map((row) => basename(row.version)));
}
