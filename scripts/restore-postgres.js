import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { rootDir } from "../src/config.js";
import { postgresConnection, runPostgresTool } from "./postgres-backup-common.js";

const backupArg = process.argv.find((value) => !value.startsWith("--") && value !== process.argv[0] && value !== process.argv[1]);
if (!backupArg || !process.argv.includes("--confirm")) {
  console.error("Usage: npm.cmd run db:pg:restore -- <backup.dump> --confirm");
  process.exit(1);
}

const backupPath = resolve(rootDir, backupArg);
await access(backupPath);
await runPostgresTool("pg_restore", [
  "--clean",
  "--if-exists",
  "--no-owner",
  "--no-privileges",
  "--exit-on-error"
], { inputPath: backupPath });

const connection = postgresConnection();
console.log(JSON.stringify({
  ok: true,
  database: connection.database,
  restoredFrom: backupPath,
  restoredAt: new Date().toISOString()
}, null, 2));
