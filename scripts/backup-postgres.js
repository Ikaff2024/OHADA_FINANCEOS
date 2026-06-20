import { mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { rootDir } from "../src/config.js";
import { postgresConnection, runPostgresTool } from "./postgres-backup-common.js";
import { backupRetentionPolicy, prunePostgresBackups } from "./postgres-backup-retention.js";

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDirectory = resolve(rootDir, process.env.OHADA_BACKUP_DIR || join("data", "backups"));
const defaultPath = join(backupDirectory, `postgres-${timestamp}.dump`);
const outputPath = resolve(rootDir, process.argv[2] || defaultPath);

await mkdir(dirname(outputPath), { recursive: true });
await runPostgresTool("pg_dump", ["--format=custom", "--no-owner", "--no-privileges"], { outputPath });
const info = await stat(outputPath);
const connection = postgresConnection();
const retention = await prunePostgresBackups(dirname(outputPath), backupRetentionPolicy());

console.log(JSON.stringify({
  ok: true,
  database: connection.database,
  path: outputPath,
  size: info.size,
  createdAt: new Date().toISOString(),
  retention
}, null, 2));
