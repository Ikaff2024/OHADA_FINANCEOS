import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { createPostgresClient } from "../src/postgresRuntime.js";
import { rootDir } from "../src/config.js";

const port = Number(process.env.PG_FULL_E2E_PORT || 3065);
const databaseName = new URL(
  process.env.DATABASE_URL || "postgres://invalid/invalid"
).pathname.slice(1);
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL est obligatoire pour le test PostgreSQL complet.");
  process.exit(1);
}
if (!/(test|e2e)/i.test(databaseName) && process.env.PG_FULL_E2E_ALLOW_NON_TEST !== "true") {
  console.error(
    `Test refuse sur la base '${databaseName}'. Utilisez une base dont le nom contient test ou e2e.`
  );
  process.exit(1);
}

const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const testStartedAt = new Date().toISOString();
const periodId = `period-pg-full-${runId}`;
const userEmail = `pg-full-${runId}@ohada.test`;
const artifacts = {
  userId: null,
  entryIds: [],
  letteringGroupIds: [],
  bankBatchId: null,
  jobId: null,
  fileId: null,
  filePath: null
};

const server = spawn(process.execPath, ["src/server.js"], {
  env: {
    ...process.env,
    PORT: String(port),
    OHADA_DB_RUNTIME: "postgres",
    OHADA_EXPOSE_AUTH_TOKENS: "true",
    OHADA_JOB_WORKER_INTERVAL_MS: "150",
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

  const login = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email: "admin@demo.ohada", password: "admin12345" })
  });
  const authHeaders = jsonHeaders(login.token);

  const periodResponse = await fetchJson("/api/accounting-periods", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      id: periodId,
      name: "Exercice PostgreSQL E2E 2098",
      startDate: "2098-01-01",
      endDate: "2098-12-31"
    })
  });
  assert.equal(periodResponse.period.id, periodId);

  const invitation = await fetchJson("/api/users/invitations", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      email: userEmail,
      name: "Utilisateur PostgreSQL E2E",
      role: "accountant"
    })
  });
  artifacts.userId = invitation.user.id;
  assert.equal(typeof invitation.invitation.token, "string");

  await fetchJson("/api/auth/invitations/accept", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ token: invitation.invitation.token, password: "pgFull12345" })
  });
  const invitedLogin = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email: userEmail, password: "pgFull12345" })
  });
  assert.equal(invitedLogin.user.role, "accountant");

  const updatedUser = await fetchJson(`/api/users/${artifacts.userId}`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({
      name: "Utilisateur PostgreSQL E2E Senior",
      role: "viewer",
      status: "active"
    })
  });
  assert.equal(updatedUser.user.role, "viewer");

  const resetRequest = await fetchJson("/api/auth/password-reset/request", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email: userEmail })
  });
  assert.equal(typeof resetRequest.reset.token, "string");
  await fetchJson("/api/auth/password-reset/confirm", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ token: resetRequest.reset.token, password: "pgFull67890" })
  });
  const resetLogin = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email: userEmail, password: "pgFull67890" })
  });
  assert.equal(resetLogin.user.email, userEmail);

  const invoice = await createEntry(authHeaders, {
    date: "2098-02-01",
    reference: `PGFULL-FAC-${runId}`,
    description: "Facture PostgreSQL E2E",
    lines: [
      { accountCode: "4111", debit: 987654, credit: 0 },
      { accountCode: "7061", debit: 0, credit: 987654 }
    ]
  });
  const payment = await createEntry(authHeaders, {
    date: "2098-02-02",
    reference: `PGFULL-REG-${runId}`,
    description: "Reglement PostgreSQL E2E",
    lines: [
      { accountCode: "5211", debit: 987654, credit: 0 },
      { accountCode: "4111", debit: 0, credit: 987654 }
    ]
  });
  artifacts.entryIds.push(invoice.id, payment.id);

  const lettering = await fetchJson("/api/lettering/auto", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ accountCode: "4111" })
  });
  assert.equal(lettering.matchedLineCount >= 2, true);
  artifacts.letteringGroupIds.push(...lettering.groups.map((group) => group.id));

  await fetchJson(`/api/accounting-periods/${periodId}/lock`, {
    method: "POST",
    headers: authHeaders
  });
  const lockedWrite = await fetch(`http://localhost:${port}/api/journal-entries`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      date: "2098-03-01",
      reference: `PGFULL-LOCK-${runId}`,
      description: "Ecriture verrouillee PostgreSQL E2E",
      lines: [
        { accountCode: "5211", debit: 100, credit: 0 },
        { accountCode: "7061", debit: 0, credit: 100 }
      ]
    })
  });
  assert.equal(lockedWrite.status, 423);
  await fetchJson(`/api/accounting-periods/${periodId}/unlock`, {
    method: "POST",
    headers: authHeaders
  });

  const csv = [
    "date,description,amount",
    `2098-04-01,PGFULL encaissement ${runId},43210`,
    `2098-04-02,PGFULL paiement ${runId},-12345`
  ].join("\n");
  const preview = await fetchJson("/api/bank-imports/preview", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ csv })
  });
  assert.equal(preview.transactions.length, 2);
  const committedImport = await fetchJson("/api/bank-imports/commit", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ csv, transactions: preview.transactions })
  });
  artifacts.bankBatchId = committedImport.batch.id;
  artifacts.entryIds.push(...committedImport.entries.map((entry) => entry.id));
  assert.equal(committedImport.importedCount, 2);
  const voidedImport = await fetchJson(`/api/bank-imports/batches/${artifacts.bankBatchId}/void`, {
    method: "POST",
    headers: authHeaders
  });
  assert.equal(voidedImport.removedCount, 2);

  const queuedExport = await fetchJson("/api/reports/export", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ from: "2098-01-01", to: "2098-12-31" })
  });
  artifacts.jobId = queuedExport.job.id;
  const finishedJob = await waitForJob(authHeaders, artifacts.jobId);
  assert.equal(finishedJob.status, "done");
  artifacts.fileId = finishedJob.result.fileId;
  artifacts.filePath = finishedJob.result.path;

  const exportedFile = await fetch(
    `http://localhost:${port}/api/files/${artifacts.fileId}/content`,
    { headers: authHeaders }
  );
  assert.equal(exportedFile.status, 200);
  const exportedJson = await exportedFile.json();
  assert.equal(Array.isArray(exportedJson.trialBalance), true);

  console.log(
    JSON.stringify(
      {
        ok: true,
        database: databaseName,
        users: "invite-accept-update-reset-login",
        periods: "create-lock-block-unlock",
        letteringGroups: artifacts.letteringGroupIds.length,
        bankTransactions: committedImport.importedCount,
        exportJob: finishedJob.status
      },
      null,
      2
    )
  );
} catch (error) {
  if (output) console.error(output);
  throw error;
} finally {
  if (!server.killed) server.kill();
  if (server.exitCode === null) await new Promise((resolve) => server.once("exit", resolve));
  await cleanupArtifacts().catch((error) =>
    console.error(`Nettoyage PostgreSQL incomplet: ${error.message}`)
  );
}

async function createEntry(headers, entry) {
  return fetchJson("/api/journal-entries", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...entry, source: "OD" })
  });
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

async function waitForJob(headers, jobId) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const jobs = await fetchJson("/api/jobs", { headers });
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (job && ["done", "failed"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Job ${jobId} non termine.`);
}

function jsonHeaders(token) {
  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {})
  };
}

async function fetchJson(pathname, options = {}) {
  const response = await fetch(`http://localhost:${port}${pathname}`, options);
  if (!response.ok)
    throw new Error(`HTTP ${response.status} sur ${pathname}: ${await response.text()}`);
  return response.json();
}

async function cleanupArtifacts() {
  if (artifacts.filePath) {
    const absolutePath = resolve(rootDir, artifacts.filePath);
    if (absolutePath.startsWith(resolve(rootDir))) await rm(absolutePath, { force: true });
  }

  const client = createPostgresClient();
  await client.connect();
  try {
    await client.query("BEGIN");
    if (artifacts.letteringGroupIds.length > 0) {
      await client.query("DELETE FROM lettering_groups WHERE id = ANY($1::text[])", [
        artifacts.letteringGroupIds
      ]);
    }
    if (artifacts.entryIds.length > 0) {
      await client.query("DELETE FROM journal_lines WHERE entry_id = ANY($1::text[])", [
        artifacts.entryIds
      ]);
      await client.query("DELETE FROM journal_entries WHERE id = ANY($1::text[])", [
        artifacts.entryIds
      ]);
    }
    if (artifacts.bankBatchId)
      await client.query("DELETE FROM bank_import_batches WHERE id = $1", [artifacts.bankBatchId]);
    if (artifacts.jobId) await client.query("DELETE FROM jobs WHERE id = $1", [artifacts.jobId]);
    if (artifacts.fileId)
      await client.query("DELETE FROM stored_files WHERE id = $1", [artifacts.fileId]);
    if (artifacts.userId) {
      await client.query("DELETE FROM auth_sessions WHERE user_id = $1", [artifacts.userId]);
      await client.query("DELETE FROM auth_tokens WHERE user_id = $1", [artifacts.userId]);
      await client.query("DELETE FROM organization_users WHERE user_id = $1", [artifacts.userId]);
      await client.query("DELETE FROM users WHERE id = $1", [artifacts.userId]);
    }
    await client.query("DELETE FROM accounting_periods WHERE id = $1", [periodId]);
    await client.query(
      "DELETE FROM audit_events WHERE organization_id = 'demo-company' AND created_at >= $1",
      [testStartedAt]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}
