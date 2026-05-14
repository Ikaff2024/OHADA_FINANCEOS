import { spawnSync } from "node:child_process";

const seedPath = process.argv[2] || "data/postgres-seed.sql";

run("node", ["scripts/migrate-postgres.js"]);
run("node", ["scripts/seed-postgres.js", seedPath]);

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
