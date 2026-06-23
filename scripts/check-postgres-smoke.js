import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = Number(process.env.PG_SMOKE_PORT || 3064);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL est obligatoire pour le smoke test PostgreSQL.");
  process.exit(1);
}

const server = spawn(process.execPath, ["src/server.js"], {
  env: {
    ...process.env,
    PORT: String(port),
    OHADA_DB_RUNTIME: "postgres",
    PGSSLMODE: process.env.PGSSLMODE || "disable"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
server.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

try {
  await waitForServer();

  const health = await fetchJson("/api/health");
  assert.equal(health.ok, true);
  assert.equal(health.config.runtimeDatabase, "postgres");
  assert.equal(health.database.runtime, "postgres");

  const login = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@demo.ohada", password: "admin12345" })
  });
  assert.equal(typeof login.token, "string");
  assert.equal(login.user.email, "admin@demo.ohada");

  const headers = { authorization: `Bearer ${login.token}` };
  const accounts = await fetchJson("/api/accounts", { headers });
  const entries = await fetchJson("/api/journal-entries", { headers });
  const trialBalance = await fetchJson("/api/reports/trial-balance", { headers });
  const balanceSheet = await fetchJson("/api/reports/balance-sheet", { headers });

  assert.equal(Array.isArray(accounts), true);
  assert.equal(Array.isArray(entries), true);
  assert.equal(Array.isArray(trialBalance), true);
  assert.equal(typeof balanceSheet.assets, "number");

  const reference = `PG-SMOKE-${Date.now()}`;
  const createdEntry = await fetchJson("/api/journal-entries", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      date: "2026-06-20",
      reference,
      description: "Smoke test PostgreSQL",
      source: "OD",
      lines: [
        { accountCode: "5211", debit: 1000, credit: 0 },
        { accountCode: "7061", debit: 0, credit: 1000 }
      ]
    })
  });
  assert.equal(createdEntry.reference, reference);

  const updatedEntry = await fetchJson(`/api/journal-entries/${createdEntry.id}`, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      date: "2026-06-20",
      reference,
      description: "Smoke test PostgreSQL modifie",
      source: "OD",
      lines: [
        { accountCode: "5211", debit: 1500, credit: 0 },
        { accountCode: "7061", debit: 0, credit: 1500 }
      ]
    })
  });
  assert.equal(updatedEntry.entry.description, "Smoke test PostgreSQL modifie");

  const ledgerAfterUpdate = await fetchJson("/api/reports/general-ledger", { headers });
  assert.equal(
    ledgerAfterUpdate.some((row) => row.reference === reference && row.debit === 1500),
    true
  );

  const deletedEntry = await fetchJson(`/api/journal-entries/${createdEntry.id}`, {
    method: "DELETE",
    headers
  });
  assert.equal(deletedEntry.entry.id, createdEntry.id);

  const missingEntry = await fetch(
    `http://localhost:${port}/api/journal-entries/${createdEntry.id}`,
    { headers }
  );
  assert.equal(missingEntry.status, 404);

  console.log(
    JSON.stringify(
      {
        ok: true,
        runtime: health.config.runtimeDatabase,
        organization: login.organization?.id,
        accounts: accounts.length,
        entries: entries.length,
        trialBalanceRows: trialBalance.length,
        mutationCycle: "create-update-delete"
      },
      null,
      2
    )
  );
} catch (error) {
  if (output) console.error(output);
  throw error;
} finally {
  server.kill();
  await new Promise((resolve) => server.once("exit", resolve));
}

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 7000) {
    try {
      await fetchJson("/api/health");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error(`Serveur PostgreSQL indisponible. Sortie:\n${output}`);
}

async function fetchJson(pathname, options = {}) {
  const response = await fetch(`http://localhost:${port}${pathname}`, options);
  if (!response.ok)
    throw new Error(`HTTP ${response.status} sur ${pathname}: ${await response.text()}`);
  return response.json();
}
