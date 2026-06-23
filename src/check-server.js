import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";

const port = 3060;
const testDbPath = join("data", `test-db-${Date.now()}.sqlite`);
const testStoragePath = join("data", `test-storage-${Date.now()}`);
const server = spawn(process.execPath, ["src/server.js"], {
  env: {
    ...process.env,
    PORT: String(port),
    OHADA_EXPOSE_AUTH_TOKENS: "true",
    OHADA_DB_PATH: testDbPath,
    OHADA_STORAGE_DIR: testStoragePath,
    OHADA_CORS_ALLOWED_ORIGINS: "http://localhost:9999",
    OHADA_MAX_REQUEST_BODY_BYTES: "65536"
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
  await waitForServer(port);
  await assertProductionStartupGuard();
  await assertAuthTokensHiddenByDefault();

  const health = await fetchJson(`http://localhost:${port}/api/health`);
  assert.equal(health.ok, true);
  assert.equal(health.config.runtimeDatabase, "sqlite");
  assert.equal(health.config.postgresConfigured, false);
  assert.equal(health.database.runtime, "sqlite");
  assert.equal(health.database.sqlite.ok, true);
  assert.equal(health.database.postgres.configured, false);

  const databaseHealth = await fetchJson(`http://localhost:${port}/api/health/database`);
  assert.equal(databaseHealth.ok, true);
  assert.equal(databaseHealth.database.sqlite.ok, true);
  const healthWithHeaders = await fetch(`http://localhost:${port}/api/health`);
  assert.equal(healthWithHeaders.headers.get("x-content-type-options"), "nosniff");
  assert.equal(healthWithHeaders.headers.get("x-frame-options"), "DENY");
  assert.match(healthWithHeaders.headers.get("content-security-policy"), /default-src 'self'/);
  assert.ok(healthWithHeaders.headers.get("x-request-id"), "x-request-id doit etre present");
  const correlatedHealth = await fetch(`http://localhost:${port}/api/health`, {
    headers: { "x-request-id": "test-correlation-id" }
  });
  assert.equal(correlatedHealth.headers.get("x-request-id"), "test-correlation-id");
  const corsPreflight = await fetch(`http://localhost:${port}/api/health`, {
    method: "OPTIONS",
    headers: {
      origin: "http://localhost:9999",
      "access-control-request-method": "GET"
    }
  });
  assert.equal(corsPreflight.status, 204);
  assert.equal(corsPreflight.headers.get("access-control-allow-origin"), "http://localhost:9999");
  assert.match(corsPreflight.headers.get("access-control-allow-headers"), /x-organization-id/);

  const oversizedBody = await fetch(`http://localhost:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "a@b.c", password: "x".repeat(70000) })
  });
  assert.equal(oversizedBody.status, 413);

  const metricsResponse = await fetch(`http://localhost:${port}/api/metrics`);
  assert.equal(metricsResponse.status, 200);
  const metricsBody = await metricsResponse.text();
  assert.match(metricsBody, /http_requests_total/);
  assert.match(metricsBody, /http_request_duration_seconds_bucket/);
  assert.match(metricsBody, /process_uptime_seconds/);

  const anonymousMe = await fetch(`http://localhost:${port}/api/auth/me`);
  assert.equal(anonymousMe.status, 401);

  const anonymousCompany = await fetch(`http://localhost:${port}/api/company`);
  assert.equal(anonymousCompany.status, 401);

  const anonymousAccounts = await fetch(`http://localhost:${port}/api/accounts`);
  assert.equal(anonymousAccounts.status, 401);

  const anonymousWrite = await fetch(`http://localhost:${port}/api/company`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Tentative anonyme",
      country: "CI",
      currency: "XOF",
      fiscalYearStart: "2026-01-01",
      fiscalYearEnd: "2026-12-31"
    })
  });
  assert.equal(anonymousWrite.status, 401);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const denied = await fetch(`http://localhost:${port}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "rate-limit@test.local", password: "bad-password" })
    });
    assert.equal(denied.status, 401);
  }
  const blockedAttempt = await fetch(`http://localhost:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "rate-limit@test.local", password: "bad-password" })
  });
  assert.equal(blockedAttempt.status, 429);
  const blockedPayload = await blockedAttempt.json();
  assert.equal(typeof blockedPayload.retryAfterMs, "number");
  assert.equal(blockedPayload.retryAfterMs > 0, true);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const adminDenied = await fetch(`http://localhost:${port}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@demo.ohada", password: "bad-password" })
    });
    assert.equal(adminDenied.status, 401);
  }

  const login = await fetch(`http://localhost:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@demo.ohada", password: "admin12345" })
  });
  assert.equal(login.status, 200);
  const loginBody = await login.json();
  assert.equal(typeof loginBody.token, "string");
  assert.equal(loginBody.user.role, "owner");
  const adminDeniedAfterSuccess = await fetch(`http://localhost:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@demo.ohada", password: "bad-password" })
  });
  assert.equal(adminDeniedAfterSuccess.status, 401);
  const authHeaders = {
    "content-type": "application/json",
    authorization: `Bearer ${loginBody.token}`
  };
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (url, options = {}) => {
    const headers = new Headers(options.headers);
    if (String(url).includes("/api/") && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${loginBody.token}`);
    }
    return nativeFetch(url, { ...options, headers });
  };

  const me = await fetch(`http://localhost:${port}/api/auth/me`, { headers: authHeaders });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.email, "admin@demo.ohada");

  const organizations = await fetch(`http://localhost:${port}/api/organizations`, {
    headers: authHeaders
  });
  assert.equal(organizations.status, 200);
  assert.equal((await organizations.json()).length >= 1, true);

  const createOrganization = await fetch(`http://localhost:${port}/api/organizations`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "Client Nouvelle SARL",
      country: "CI",
      currency: "XOF",
      fiscalYearStart: "2026-01-01",
      fiscalYearEnd: "2026-12-31",
      ownerName: "Proprietaire Client",
      ownerEmail: "owner.client@ohada.local",
      ownerPassword: "owner12345"
    })
  });
  assert.equal(createOrganization.status, 201);
  const createOrganizationBody = await createOrganization.json();
  assert.equal(createOrganizationBody.organization.id, "client-nouvelle-sarl");
  assert.equal(createOrganizationBody.owner.role, "owner");

  const organizationsAfterCreate = await fetchJson(`http://localhost:${port}/api/organizations`);
  assert.equal(
    organizationsAfterCreate.some((organization) => organization.id === "client-nouvelle-sarl"),
    true
  );

  const ownerLogin = await fetch(`http://localhost:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "owner.client@ohada.local", password: "owner12345" })
  });
  assert.equal(ownerLogin.status, 200);
  const ownerLoginBody = await ownerLogin.json();
  assert.equal(ownerLoginBody.organization.id, "client-nouvelle-sarl");
  const ownerHeaders = {
    "content-type": "application/json",
    authorization: `Bearer ${ownerLoginBody.token}`
  };

  const ownerCompany = await fetch(`http://localhost:${port}/api/company`, {
    headers: ownerHeaders
  });
  assert.equal(ownerCompany.status, 200);
  assert.equal((await ownerCompany.json()).name, "Client Nouvelle SARL");

  const ownerUsers = await fetch(`http://localhost:${port}/api/users`, { headers: ownerHeaders });
  assert.equal(ownerUsers.status, 200);
  const ownerUsersBody = await ownerUsers.json();
  assert.equal(ownerUsersBody.length, 1);
  assert.equal(ownerUsersBody[0].email, "owner.client@ohada.local");

  const ownerEntries = await fetch(`http://localhost:${port}/api/journal-entries`, {
    headers: ownerHeaders
  });
  assert.equal(ownerEntries.status, 200);
  assert.equal((await ownerEntries.json()).length, 0);

  const ownerPeriods = await fetch(`http://localhost:${port}/api/accounting-periods`, {
    headers: ownerHeaders
  });
  assert.equal(ownerPeriods.status, 200);
  const ownerPeriodsBody = await ownerPeriods.json();
  assert.equal(ownerPeriodsBody.length, 1);
  assert.equal(ownerPeriodsBody[0].id, "period-client-nouvelle-sarl-2026");

  const createUser = await fetch(`http://localhost:${port}/api/users`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      email: "comptable.demo@ohada.local",
      name: "Comptable Demo",
      role: "accountant",
      password: "demo12345"
    })
  });
  assert.equal(createUser.status, 201);
  const createdUser = await createUser.json();
  assert.equal(createdUser.user.role, "accountant");

  const updateUser = await fetch(`http://localhost:${port}/api/users/${createdUser.user.id}`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ name: "Comptable Demo Senior", role: "viewer", status: "active" })
  });
  assert.equal(updateUser.status, 200);
  assert.equal((await updateUser.json()).user.role, "viewer");

  const users = await fetch(`http://localhost:${port}/api/users`, { headers: authHeaders });
  assert.equal(users.status, 200);
  assert.equal(
    (await users.json()).some(
      (user) => user.email === "comptable.demo@ohada.local" && user.name === "Comptable Demo Senior"
    ),
    true
  );

  const inviteUser = await fetch(`http://localhost:${port}/api/users/invitations`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      email: "invite.demo@ohada.local",
      name: "Invite Demo",
      role: "viewer"
    })
  });
  assert.equal(inviteUser.status, 201);
  const inviteUserBody = await inviteUser.json();
  assert.equal(inviteUserBody.user.status, "disabled");
  assert.equal(typeof inviteUserBody.invitation.token, "string");

  const acceptInvitation = await fetch(`http://localhost:${port}/api/auth/invitations/accept`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: inviteUserBody.invitation.token, password: "invite12345" })
  });
  assert.equal(acceptInvitation.status, 200);
  assert.equal((await acceptInvitation.json()).user.status, "active");

  const invitedLogin = await fetch(`http://localhost:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "invite.demo@ohada.local", password: "invite12345" })
  });
  assert.equal(invitedLogin.status, 200);

  const resetRequest = await fetch(`http://localhost:${port}/api/auth/password-reset/request`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "invite.demo@ohada.local" })
  });
  assert.equal(resetRequest.status, 200);
  const resetRequestBody = await resetRequest.json();
  assert.equal(typeof resetRequestBody.reset.token, "string");

  const resetPassword = await fetch(`http://localhost:${port}/api/auth/password-reset/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: resetRequestBody.reset.token, password: "invite67890" })
  });
  assert.equal(resetPassword.status, 200);

  const resetLogin = await fetch(`http://localhost:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "invite.demo@ohada.local", password: "invite67890" })
  });
  assert.equal(resetLogin.status, 200);

  const createJournal = await fetch(`http://localhost:${port}/api/journals`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ code: "CA", label: "Caisse test", type: "cash" })
  });
  assert.equal(createJournal.status, 201);
  assert.equal((await createJournal.json()).journal.code, "CA");

  const journals = await fetch(`http://localhost:${port}/api/journals`, { headers: authHeaders });
  assert.equal(journals.status, 200);
  assert.equal(
    (await journals.json()).some((journal) => journal.code === "CA"),
    true
  );

  const createAccount = await fetch(`http://localhost:${port}/api/accounts`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ code: "7088", label: "Produits digitaux test", type: "revenue" })
  });
  assert.equal(createAccount.status, 201);
  assert.equal((await createAccount.json()).account.code, "7088");

  const accounts = await fetch(`http://localhost:${port}/api/accounts`, { headers: authHeaders });
  assert.equal(accounts.status, 200);
  assert.equal(
    (await accounts.json()).some(
      (account) => account.code === "7088" && account.source === "custom"
    ),
    true
  );

  const customAccountEntry = await fetch(`http://localhost:${port}/api/journal-entries`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      date: "2026-02-15",
      reference: "CA-001",
      description: "Vente caisse compte custom",
      source: "CA",
      lines: [
        { accountCode: "5211", debit: 1000, credit: 0 },
        { accountCode: "7088", debit: 0, credit: 1000 }
      ]
    })
  });
  assert.equal(customAccountEntry.status, 201);
  const customAccountEntryBody = await customAccountEntry.json();

  const ledgerWithCustomAccount = await fetchJson(
    `http://localhost:${port}/api/reports/general-ledger`
  );
  assert.equal(
    ledgerWithCustomAccount.some(
      (row) =>
        row.reference === "CA-001" &&
        row.accountCode === "7088" &&
        row.accountLabel === "Produits digitaux test"
    ),
    true
  );

  const createJob = await fetch(`http://localhost:${port}/api/jobs`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ type: "bank-import-preview", payload: { source: "check-server" } })
  });
  assert.equal(createJob.status, 201);
  assert.equal((await createJob.json()).job.status, "queued");

  const jobs = await fetch(`http://localhost:${port}/api/jobs`, { headers: authHeaders });
  assert.equal(jobs.status, 200);
  assert.equal(
    (await jobs.json()).some((job) => job.type === "bank-import-preview"),
    true
  );

  const exportJob = await fetch(`http://localhost:${port}/api/reports/export`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ from: "2026-01-01", to: "2026-12-31" })
  });
  assert.equal(exportJob.status, 202);
  const exportJobBody = await exportJob.json();
  const finishedExportJob = await waitForJob(port, exportJobBody.job.id);
  assert.equal(finishedExportJob.status, "done");
  assert.equal(typeof finishedExportJob.result.fileId, "string");

  const exportedFile = await fetch(
    `http://localhost:${port}/api/files/${finishedExportJob.result.fileId}/content`,
    {
      headers: authHeaders
    }
  );
  assert.equal(exportedFile.status, 200);
  const exportedJson = await exportedFile.json();
  assert.equal(exportedJson.company.name, "Demo PME OHADA");
  assert.equal(Array.isArray(exportedJson.trialBalance), true);

  const createFile = await fetch(`http://localhost:${port}/api/files/text`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "phase2-test.txt",
      content: "verification phase 2",
      mimeType: "text/plain"
    })
  });
  assert.equal(createFile.status, 201);
  assert.equal((await createFile.json()).file.name, "phase2-test.txt");

  const files = await fetch(`http://localhost:${port}/api/files`, { headers: authHeaders });
  assert.equal(files.status, 200);
  assert.equal(
    (await files.json()).some((file) => file.name === "phase2-test.txt"),
    true
  );

  const html = await fetch(`http://localhost:${port}/`);
  assert.equal(html.status, 200);
  assert.equal(html.headers.get("x-content-type-options"), "nosniff");
  assert.equal(html.headers.get("x-frame-options"), "DENY");
  assert.match(await html.text(), /OHADA FinanceOS/);

  const updateCompany = await fetch(`http://localhost:${port}/api/company`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Client Demo FinanceOS",
      country: "CI",
      currency: "XOF",
      fiscalYearStart: "2026-01-01",
      fiscalYearEnd: "2026-12-31"
    })
  });
  assert.equal(updateCompany.status, 200);
  const updatedCompany = await updateCompany.json();
  assert.equal(updatedCompany.company.name, "Client Demo FinanceOS");

  const balanceSheet = await fetchJson(`http://localhost:${port}/api/reports/balance-sheet`);
  assert.equal(typeof balanceSheet.assets, "number");

  const closingControls = await fetchJson(`http://localhost:${port}/api/reports/closing-controls`);
  assert.equal(closingControls.ready, true);
  assert.equal(Array.isArray(closingControls.controls), true);

  const createAuxiliary = await fetch(`http://localhost:${port}/api/auxiliary-accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "C-BETA", label: "Client Beta", accountCode: "4111" })
  });
  assert.equal(createAuxiliary.status, 201);

  const auxiliaries = await fetchJson(`http://localhost:${port}/api/auxiliary-accounts`);
  assert.equal(
    auxiliaries.some((auxiliary) => auxiliary.code === "C-BETA"),
    true
  );

  const sample = await fetch(`http://localhost:${port}/api/bank-imports/sample`);
  assert.equal(sample.status, 200);
  const sampleCsv = await sample.text();

  const preview = await fetch(`http://localhost:${port}/api/bank-imports/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ csv: sampleCsv })
  });
  assert.equal(preview.status, 200);
  const previewBody = await preview.json();
  assert.equal(previewBody.transactions.length, 4);
  assert.equal(typeof previewBody.transactions[0].fingerprint, "string");

  const commit = await fetch(`http://localhost:${port}/api/bank-imports/commit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ csv: sampleCsv, transactions: previewBody.transactions })
  });
  assert.equal(commit.status, 201);
  const commitBody = await commit.json();
  assert.equal(commitBody.importedCount, 4);
  assert.equal(commitBody.batch.status, "posted");

  const duplicatePreview = await fetch(`http://localhost:${port}/api/bank-imports/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ csv: sampleCsv })
  });
  const duplicatePreviewBody = await duplicatePreview.json();
  assert.equal(
    duplicatePreviewBody.transactions.every((transaction) => transaction.duplicate),
    true
  );

  const batches = await fetchJson(`http://localhost:${port}/api/bank-imports/batches`);
  assert.equal(batches.length, 1);

  const voidBatch = await fetch(
    `http://localhost:${port}/api/bank-imports/batches/${commitBody.batch.id}/void`,
    {
      method: "POST"
    }
  );
  assert.equal(voidBatch.status, 200);
  assert.equal((await voidBatch.json()).removedCount, 4);

  const invalid = await fetch(`http://localhost:${port}/api/journal-entries`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      date: "2026-02-01",
      reference: "ERR-001",
      description: "Test desequilibre",
      lines: [
        { accountCode: "5211", debit: 1000, credit: 0 },
        { accountCode: "7061", debit: 0, credit: 500 }
      ]
    })
  });
  assert.equal(invalid.status, 422);

  const periods = await fetchJson(`http://localhost:${port}/api/accounting-periods`);
  assert.equal(periods.length, 1);
  assert.equal(periods[0].status, "open");

  const locked = await fetch(
    `http://localhost:${port}/api/accounting-periods/${periods[0].id}/lock`,
    {
      method: "POST"
    }
  );
  assert.equal(locked.status, 200);

  const lockedManual = await fetch(`http://localhost:${port}/api/journal-entries`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      date: "2026-03-01",
      reference: "LOCK-001",
      description: "Saisie test verrouillee",
      lines: [
        { accountCode: "5211", debit: 1000, credit: 0 },
        { accountCode: "7061", debit: 0, credit: 1000 }
      ]
    })
  });
  assert.equal(lockedManual.status, 423);

  const lockedUpdate = await fetch(
    `http://localhost:${port}/api/journal-entries/${customAccountEntryBody.id}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: "2026-02-15",
        reference: "CA-001-MOD",
        description: "Modification refusee periode verrouillee",
        source: "CA",
        lines: [
          { accountCode: "5211", debit: 1000, credit: 0 },
          { accountCode: "7088", debit: 0, credit: 1000 }
        ]
      })
    }
  );
  assert.equal(lockedUpdate.status, 423);

  const unlocked = await fetch(
    `http://localhost:${port}/api/accounting-periods/${periods[0].id}/unlock`,
    {
      method: "POST"
    }
  );
  assert.equal(unlocked.status, 200);

  const nextPeriod = await fetch(`http://localhost:${port}/api/accounting-periods`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(nextPeriod.status, 201);
  const nextPeriodBody = await nextPeriod.json();
  assert.equal(nextPeriodBody.period.startDate, "2027-01-01");

  const allPeriods = await fetchJson(`http://localhost:${port}/api/accounting-periods`);
  assert.equal(allPeriods.length, 2);

  const auditAfterPeriod = await fetchJson(`http://localhost:${port}/api/audit-events`);
  assert.equal(
    auditAfterPeriod.some((event) => event.action === "period.create"),
    true
  );
  assert.equal(
    auditAfterPeriod.some((event) => event.action === "period.lock"),
    true
  );

  const manual = await fetch(`http://localhost:${port}/api/journal-entries`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      date: "2026-03-01",
      reference: "MAN-001",
      description: "Saisie test suppression",
      lines: [
        { accountCode: "5211", debit: 1000, credit: 0 },
        { accountCode: "7061", debit: 0, credit: 1000 }
      ]
    })
  });
  assert.equal(manual.status, 201);
  const manualBody = await manual.json();

  const updatedManual = await fetch(
    `http://localhost:${port}/api/journal-entries/${manualBody.id}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        date: "2026-03-01",
        reference: "MAN-001-MOD",
        description: "Saisie test modifiee avant suppression",
        source: "OD",
        lines: [
          { accountCode: "5211", debit: 1500, credit: 0 },
          { accountCode: "7061", debit: 0, credit: 1500 }
        ]
      })
    }
  );
  assert.equal(updatedManual.status, 200);
  const updatedManualBody = await updatedManual.json();
  assert.equal(updatedManualBody.entry.description, "Saisie test modifiee avant suppression");

  const auxiliaryManual = await fetch(`http://localhost:${port}/api/journal-entries`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      date: "2026-03-02",
      reference: "FAC-002",
      description: "Facture auxiliaire beta",
      lines: [
        { accountCode: "4111", auxiliaryCode: "C-BETA", debit: 2000, credit: 0 },
        { accountCode: "7061", debit: 0, credit: 2000 }
      ]
    })
  });
  assert.equal(auxiliaryManual.status, 201);

  const receivablePayment = await fetch(`http://localhost:${port}/api/journal-entries`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      date: "2026-03-03",
      reference: "REG-002",
      description: "Reglement client beta",
      lines: [
        { accountCode: "5211", debit: 2000, credit: 0 },
        { accountCode: "4111", auxiliaryCode: "C-BETA", debit: 0, credit: 2000 }
      ]
    })
  });
  assert.equal(receivablePayment.status, 201);

  const autoLettering = await fetch(`http://localhost:${port}/api/lettering/auto`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountCode: "4111" })
  });
  assert.equal(autoLettering.status, 201);
  const autoLetteringBody = await autoLettering.json();
  assert.equal(autoLetteringBody.groups.length >= 1, true);
  assert.equal(autoLetteringBody.matchedLineCount >= 2, true);

  const supplierInvoice = await fetch(`http://localhost:${port}/api/journal-entries`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      date: "2026-03-04",
      reference: "FF-001",
      description: "Facture fournisseur test",
      lines: [
        { accountCode: "6222", debit: 300, credit: 0 },
        { accountCode: "4011", debit: 0, credit: 300 }
      ]
    })
  });
  assert.equal(supplierInvoice.status, 201);

  const supplierPayment = await fetch(`http://localhost:${port}/api/journal-entries`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      date: "2026-03-05",
      reference: "RF-001",
      description: "Reglement fournisseur test",
      lines: [
        { accountCode: "4011", debit: 300, credit: 0 },
        { accountCode: "5211", debit: 0, credit: 300 }
      ]
    })
  });
  assert.equal(supplierPayment.status, 201);

  const supplierLetteringRows = await fetchJson(
    `http://localhost:${port}/api/lettering?accountCode=4011`
  );
  const supplierRefs = supplierLetteringRows.rows
    .filter((row) => ["FF-001", "RF-001"].includes(row.reference))
    .map((row) => row.lineRef);
  assert.equal(supplierRefs.length, 2);

  const manualLettering = await fetch(`http://localhost:${port}/api/lettering/manual`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lineRefs: supplierRefs })
  });
  assert.equal(manualLettering.status, 201);
  const manualLetteringBody = await manualLettering.json();
  assert.equal(manualLetteringBody.group.mode, "manual");

  const subscription = await fetch(`http://localhost:${port}/api/subscriptions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Loyer test",
      description: "Abonnement loyer test",
      startDate: "2026-04-05",
      endDate: "2026-06-05",
      dayOfMonth: 5,
      lines: [
        { accountCode: "6222", label: "Loyer bureau", debit: 100, credit: 0 },
        { accountCode: "4011", label: "Fournisseur loyer", debit: 0, credit: 100 }
      ]
    })
  });
  assert.equal(subscription.status, 201);
  const subscriptionBody = await subscription.json();
  assert.equal(subscriptionBody.entries.length, 3);

  const subscriptions = await fetchJson(`http://localhost:${port}/api/subscriptions`);
  assert.equal(
    subscriptions.some((batch) => batch.name === "Loyer test" && batch.entryCount === 3),
    true
  );

  const auxiliaryBalance = await fetchJson(
    `http://localhost:${port}/api/reports/auxiliary-balance`
  );
  assert.equal(
    auxiliaryBalance.some(
      (row) => row.code === "C-BETA" && row.debit === 2000 && row.credit === 2000
    ),
    true
  );

  const generalLedger = await fetchJson(`http://localhost:${port}/api/reports/general-ledger`);
  assert.equal(
    generalLedger.some((row) => row.reference === "FAC-002" && row.auxiliaryCode === "C-BETA"),
    true
  );
  assert.equal(
    generalLedger.some((row) => row.reference.startsWith("ABN-") && row.source === "subscription"),
    true
  );

  const marchLedger = await fetchJson(
    `http://localhost:${port}/api/reports/general-ledger?from=2026-03-01&to=2026-03-31`
  );
  assert.equal(
    marchLedger.every((row) => row.date >= "2026-03-01" && row.date <= "2026-03-31"),
    true
  );
  assert.equal(
    marchLedger.some((row) => row.reference === "FAC-002"),
    true
  );
  assert.equal(
    marchLedger.some((row) => row.reference.startsWith("ABN-")),
    false
  );

  const marchBalance = await fetchJson(
    `http://localhost:${port}/api/reports/trial-balance?from=2026-03-01&to=2026-03-31`
  );
  assert.equal(
    marchBalance.some((row) => row.code === "4111" && row.debit === 2000 && row.credit === 2000),
    true
  );

  const lettering = await fetchJson(`http://localhost:${port}/api/lettering?accountCode=4111`);
  assert.equal(
    lettering.rows.filter((row) => row.reference === "FAC-002" && row.letteringCode).length,
    1
  );
  assert.equal(
    lettering.rows.filter((row) => row.reference === "REG-002" && row.letteringCode).length,
    1
  );

  const detail = await fetchJson(`http://localhost:${port}/api/journal-entries/${manualBody.id}`);
  assert.equal(detail.description, "Saisie test modifiee avant suppression");
  assert.equal(detail.reference, "MAN-001-MOD");
  assert.equal(detail.source, "OD");

  const deleted = await fetch(`http://localhost:${port}/api/journal-entries/${manualBody.id}`, {
    method: "DELETE"
  });
  assert.equal(deleted.status, 200);

  const missing = await fetch(`http://localhost:${port}/api/journal-entries/${manualBody.id}`);
  assert.equal(missing.status, 404);

  const logout = await fetch(`http://localhost:${port}/api/auth/logout`, {
    method: "POST",
    headers: authHeaders
  });
  assert.equal(logout.status, 200);
  const expiredMe = await fetch(`http://localhost:${port}/api/auth/me`, { headers: authHeaders });
  assert.equal(expiredMe.status, 401);

  console.log("Checks serveur OK");
} catch (error) {
  if (output) console.error(output);
  throw error;
} finally {
  server.kill();
  await new Promise((resolve) => server.once("exit", resolve));
  await rm(testDbPath, { force: true });
  await rm(testStoragePath, { recursive: true, force: true });
}

async function waitForServer(targetPort) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    try {
      await fetchJson(`http://localhost:${targetPort}/api/health`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  throw new Error(`Serveur indisponible. Sortie:\n${output}`);
}

async function assertProductionStartupGuard() {
  await assertUnsafeProductionConfig(
    {
      OHADA_DEFAULT_ADMIN_PASSWORD: "admin12345",
      OHADA_EXPOSE_AUTH_TOKENS: "false"
    },
    /OHADA_DEFAULT_ADMIN_PASSWORD/
  );

  await assertUnsafeProductionConfig(
    {
      OHADA_DEFAULT_ADMIN_PASSWORD: "production-password-123",
      OHADA_EXPOSE_AUTH_TOKENS: "true"
    },
    /OHADA_EXPOSE_AUTH_TOKENS/
  );
}

async function assertUnsafeProductionConfig(overrides, expectedError) {
  const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const guardServer = spawn(process.execPath, ["src/server.js"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: "0",
      ...overrides,
      OHADA_DB_PATH: join("data", `guard-db-${suffix}.sqlite`),
      OHADA_STORAGE_DIR: join("data", `guard-storage-${suffix}`)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let guardOutput = "";
  guardServer.stdout.on("data", (chunk) => {
    guardOutput += chunk.toString();
  });
  guardServer.stderr.on("data", (chunk) => {
    guardOutput += chunk.toString();
  });

  const exitCode = await new Promise((resolve) => guardServer.once("exit", resolve));
  assert.notEqual(exitCode, 0);
  assert.match(guardOutput, expectedError);
}

async function assertAuthTokensHiddenByDefault() {
  const targetPort = 3061;
  const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const dbPath = join("data", `token-guard-db-${suffix}.sqlite`);
  const storagePath = join("data", `token-guard-storage-${suffix}`);
  const tokenGuardServer = spawn(process.execPath, ["src/server.js"], {
    env: {
      ...process.env,
      PORT: String(targetPort),
      OHADA_EXPOSE_AUTH_TOKENS: "false",
      OHADA_DB_PATH: dbPath,
      OHADA_STORAGE_DIR: storagePath
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let tokenGuardOutput = "";
  tokenGuardServer.stdout.on("data", (chunk) => {
    tokenGuardOutput += chunk.toString();
  });
  tokenGuardServer.stderr.on("data", (chunk) => {
    tokenGuardOutput += chunk.toString();
  });

  try {
    await waitForServer(targetPort);
    const response = await fetch(`http://localhost:${targetPort}/api/auth/password-reset/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@demo.ohada" })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(Object.hasOwn(body, "reset"), false);
  } catch (error) {
    if (tokenGuardOutput) console.error(tokenGuardOutput);
    throw error;
  } finally {
    tokenGuardServer.kill();
    await new Promise((resolve) => tokenGuardServer.once("exit", resolve));
    await rm(dbPath, { force: true });
    await rm(storagePath, { recursive: true, force: true });
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} sur ${url}`);
  return response.json();
}

async function waitForJob(targetPort, jobId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const jobs = await fetchJson(`http://localhost:${targetPort}/api/jobs`);
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (job && ["done", "failed"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Job ${jobId} non termine`);
}
