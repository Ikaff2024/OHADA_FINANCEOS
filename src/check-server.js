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
    OHADA_DB_PATH: testDbPath,
    OHADA_STORAGE_DIR: testStoragePath
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

  const health = await fetchJson(`http://localhost:${port}/api/health`);
  assert.equal(health.ok, true);

  const anonymousMe = await fetch(`http://localhost:${port}/api/auth/me`);
  assert.equal(anonymousMe.status, 401);

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

  const login = await fetch(`http://localhost:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@demo.ohada", password: "admin12345" })
  });
  assert.equal(login.status, 200);
  const loginBody = await login.json();
  assert.equal(typeof loginBody.token, "string");
  assert.equal(loginBody.user.role, "owner");
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

  const organizations = await fetch(`http://localhost:${port}/api/organizations`, { headers: authHeaders });
  assert.equal(organizations.status, 200);
  assert.equal((await organizations.json()).length >= 1, true);

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
  assert.equal((await createUser.json()).user.role, "accountant");

  const users = await fetch(`http://localhost:${port}/api/users`, { headers: authHeaders });
  assert.equal(users.status, 200);
  assert.equal((await users.json()).some((user) => user.email === "comptable.demo@ohada.local"), true);

  const createJob = await fetch(`http://localhost:${port}/api/jobs`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ type: "bank-import-preview", payload: { source: "check-server" } })
  });
  assert.equal(createJob.status, 201);
  assert.equal((await createJob.json()).job.status, "queued");

  const jobs = await fetch(`http://localhost:${port}/api/jobs`, { headers: authHeaders });
  assert.equal(jobs.status, 200);
  assert.equal((await jobs.json()).some((job) => job.type === "bank-import-preview"), true);

  const createFile = await fetch(`http://localhost:${port}/api/files/text`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ name: "phase2-test.txt", content: "verification phase 2", mimeType: "text/plain" })
  });
  assert.equal(createFile.status, 201);
  assert.equal((await createFile.json()).file.name, "phase2-test.txt");

  const files = await fetch(`http://localhost:${port}/api/files`, { headers: authHeaders });
  assert.equal(files.status, 200);
  assert.equal((await files.json()).some((file) => file.name === "phase2-test.txt"), true);

  const html = await fetch(`http://localhost:${port}/`);
  assert.equal(html.status, 200);
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
  assert.equal(auxiliaries.some((auxiliary) => auxiliary.code === "C-BETA"), true);

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
  assert.equal(duplicatePreviewBody.transactions.every((transaction) => transaction.duplicate), true);

  const batches = await fetchJson(`http://localhost:${port}/api/bank-imports/batches`);
  assert.equal(batches.length, 1);

  const voidBatch = await fetch(`http://localhost:${port}/api/bank-imports/batches/${commitBody.batch.id}/void`, {
    method: "POST"
  });
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

  const locked = await fetch(`http://localhost:${port}/api/accounting-periods/${periods[0].id}/lock`, {
    method: "POST"
  });
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

  const unlocked = await fetch(`http://localhost:${port}/api/accounting-periods/${periods[0].id}/unlock`, {
    method: "POST"
  });
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
  assert.equal(auditAfterPeriod.some((event) => event.action === "period.create"), true);
  assert.equal(auditAfterPeriod.some((event) => event.action === "period.lock"), true);

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

  const supplierLetteringRows = await fetchJson(`http://localhost:${port}/api/lettering?accountCode=4011`);
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
  assert.equal(subscriptions.some((batch) => batch.name === "Loyer test" && batch.entryCount === 3), true);

  const auxiliaryBalance = await fetchJson(`http://localhost:${port}/api/reports/auxiliary-balance`);
  assert.equal(auxiliaryBalance.some((row) => row.code === "C-BETA" && row.debit === 2000 && row.credit === 2000), true);

  const generalLedger = await fetchJson(`http://localhost:${port}/api/reports/general-ledger`);
  assert.equal(generalLedger.some((row) => row.reference === "FAC-002" && row.auxiliaryCode === "C-BETA"), true);
  assert.equal(generalLedger.some((row) => row.reference.startsWith("ABN-") && row.source === "subscription"), true);

  const marchLedger = await fetchJson(`http://localhost:${port}/api/reports/general-ledger?from=2026-03-01&to=2026-03-31`);
  assert.equal(marchLedger.every((row) => row.date >= "2026-03-01" && row.date <= "2026-03-31"), true);
  assert.equal(marchLedger.some((row) => row.reference === "FAC-002"), true);
  assert.equal(marchLedger.some((row) => row.reference.startsWith("ABN-")), false);

  const marchBalance = await fetchJson(`http://localhost:${port}/api/reports/trial-balance?from=2026-03-01&to=2026-03-31`);
  assert.equal(marchBalance.some((row) => row.code === "4111" && row.debit === 2000 && row.credit === 2000), true);

  const lettering = await fetchJson(`http://localhost:${port}/api/lettering?accountCode=4111`);
  assert.equal(lettering.rows.filter((row) => row.reference === "FAC-002" && row.letteringCode).length, 1);
  assert.equal(lettering.rows.filter((row) => row.reference === "REG-002" && row.letteringCode).length, 1);

  const detail = await fetchJson(`http://localhost:${port}/api/journal-entries/${manualBody.id}`);
  assert.equal(detail.description, "Saisie test suppression");
  assert.equal(detail.reference, "MAN-001");

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

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} sur ${url}`);
  return response.json();
}
