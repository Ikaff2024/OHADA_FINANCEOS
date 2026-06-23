import { createPostgresRuntime } from "../src/postgresRuntime.js";

const tables = [
  "organizations",
  "users",
  "companies",
  "accounting_periods",
  "journals",
  "custom_accounts",
  "auxiliary_accounts",
  "journal_entries",
  "journal_lines",
  "jobs",
  "stored_files"
];

let runtime;

try {
  runtime = createPostgresRuntime();
  const server = await runtime.one(
    "SELECT current_database() AS database, current_schema() AS schema"
  );
  const counts = {};
  for (const table of tables) {
    const row = await runtime.one(`SELECT COUNT(*)::int AS count FROM ${table}`);
    counts[table] = row.count;
  }

  console.log(JSON.stringify({ ok: true, server, counts }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
} finally {
  await runtime?.close();
}
