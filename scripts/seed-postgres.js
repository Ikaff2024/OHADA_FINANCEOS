import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { rootDir } from "../src/config.js";
import { createPostgresClient } from "./postgres-client.js";

const seedPath = resolve(rootDir, process.argv[2] || "data/postgres-seed.sql");

try {
  await access(seedPath);
} catch {
  console.error(`Seed PostgreSQL introuvable: ${seedPath}`);
  console.error("Generez-le d'abord avec: npm.cmd run db:pg:dump");
  process.exit(1);
}

const sql = await readFile(seedPath, "utf8");
const client = createPostgresClient();

try {
  await client.connect();
  await client.query(sql);
  console.log(`Seed PostgreSQL applique: ${seedPath}`);
} finally {
  await client.end().catch(() => {});
}
