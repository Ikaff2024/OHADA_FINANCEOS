import { mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { rootDir } from "../src/config.js";
import { postgresConnection, runPostgresTool } from "./postgres-backup-common.js";

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const defaultPath = join(rootDir, "data", "backups", `postgres-${timestamp}.dump`);
const outputPath = resolve(rootDir, process.argv[2] || defaultPath);

await mkdir(dirname(outputPath), { recursive: true });
await runPostgresTool("pg_dump", ["--format=custom", "--no-owner", "--no-privileges"], { outputPath });
const info = await stat(outputPath);
const connection = postgresConnection();

console.log(JSON.stringify({
  ok: true,
  database: connection.database,
  path: outputPath,
  size: info.size,
  createdAt: new Date().toISOString()
}, null, 2));
