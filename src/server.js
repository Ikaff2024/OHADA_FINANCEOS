import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import {
  buildAuxiliaryBalance,
  buildBalanceSheet,
  buildClosingControls,
  buildGeneralLedger,
  buildIncomeStatement,
  buildTrialBalance,
  normalizeJournalEntry,
  validateJournalEntry
} from "./accounting.js";
import {
  buildLearningCorrections,
  journalEntryFingerprints,
  previewBankCsv,
  sampleBankCsv,
  transactionsToJournalEntries
} from "./bankImport.js";
import { accountClasses } from "./ohadaChart.js";
import {
  addAccountingPeriod,
  addCustomAccount,
  addOrganization,
  addAuxiliaryAccount,
  addJournal,
  addUser,
  addBankImportBatch,
  addClassificationCorrections,
  addJournalEntries,
  addJournalEntry,
  addAutomaticLettering,
  addManualLettering,
  addSubscriptionBatch,
  acceptInvitation,
  claimNextJob,
  completeJob,
  deleteJournalEntry,
  enqueueJob,
  failJob,
  loginUser,
  logoutUser,
  inviteUser,
  readAuthContext,
  readAccounts,
  readDb,
  readJournals,
  readJobs,
  readLetteringState,
  readOrganizations,
  readStoredFileContent,
  readStoredFiles,
  readUsers,
  requestPasswordReset,
  resetPassword,
  saveTextFile,
  setAccountingPeriodStatus,
  updateJournalEntry,
  updateUser,
  updateCompany,
  voidBankImportBatch
} from "./store.js";
import { config, publicConfig, rootDir } from "./config.js";
import { databaseHealth } from "./databaseHealth.js";
import { buildSubscriptionEntries } from "./subscriptions.js";

const publicDir = join(rootDir, "public");
const port = config.port;
const loginAttempts = new Map();
const securityHeaders = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer"
};

assertSafeStartupConfig();

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    await serveStatic(response, url.pathname);
  } catch (error) {
    console.error(error);
    sendJson(response, error.status ?? 500, { error: error.status ? error.message : "Erreur serveur interne." });
  }
});

server.listen(port, () => {
  console.log(`OHADA FinanceOS MVP disponible sur http://localhost:${port}`);
});

setInterval(() => {
  processNextJob().catch((error) => console.error("Erreur worker jobs", error));
}, config.jobWorkerIntervalMs);

function assertSafeStartupConfig() {
  const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";
  if (!isProduction) return;

  if (config.defaultAdminPassword === "admin12345") {
    throw new Error(
      "Configuration non securisee: OHADA_DEFAULT_ADMIN_PASSWORD doit etre defini avec un mot de passe fort en production."
    );
  }
}

function consumeLoginRateLimit(identifier) {
  const now = Date.now();
  const windowMs = Math.max(1000, Number(config.authRateLimitWindowMs) || 900000);
  const maxAttempts = Math.max(1, Number(config.authRateLimitMaxAttempts) || 10);
  const attempts = (loginAttempts.get(identifier) || []).filter((timestamp) => now - timestamp < windowMs);

  if (attempts.length >= maxAttempts) {
    const retryAfterMs = Math.max(0, windowMs - (now - attempts[0]));
    loginAttempts.set(identifier, attempts);
    return { allowed: false, retryAfterMs };
  }

  attempts.push(now);
  loginAttempts.set(identifier, attempts);
  if (loginAttempts.size > 5000) pruneOldLoginAttempts(now, windowMs);
  return { allowed: true };
}

function clearLoginRateLimit(identifier) {
  loginAttempts.delete(identifier);
}

function pruneOldLoginAttempts(now, windowMs) {
  for (const [identifier, timestamps] of loginAttempts.entries()) {
    const fresh = timestamps.filter((timestamp) => now - timestamp < windowMs);
    if (fresh.length === 0) loginAttempts.delete(identifier);
    else loginAttempts.set(identifier, fresh);
  }
}

function clientIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (forwarded) return forwarded;
  return request.socket?.remoteAddress || "unknown";
}

function applySecurityHeaders(response) {
  for (const [header, value] of Object.entries(securityHeaders)) {
    response.setHeader(header, value);
  }
}

function resolveCorsOrigin(request) {
  const origin = String(request.headers.origin || "").trim();
  if (!origin) return "";
  if (config.corsAllowedOrigins.length === 0) return "";
  if (config.corsAllowedOrigins.includes("*")) return "*";
  return config.corsAllowedOrigins.includes(origin) ? origin : "";
}

function applyCorsHeaders(request, response) {
  const allowedOrigin = resolveCorsOrigin(request);
  if (!allowedOrigin) return false;
  response.setHeader("access-control-allow-origin", allowedOrigin);
  response.setHeader("vary", "Origin");
  response.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type,authorization");
  return true;
}

function loginIdentifier(request, email) {
  return `${clientIp(request)}|${String(email || "").trim().toLowerCase()}`;
}

async function handleAuthApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const payload = await readJson(request);
    const identifier = loginIdentifier(request, payload?.email);
    const rateLimit = consumeLoginRateLimit(identifier);
    if (!rateLimit.allowed) {
      sendJson(response, 429, {
        ok: false,
        error: "Trop de tentatives de connexion. Reessayez plus tard.",
        retryAfterMs: rateLimit.retryAfterMs
      });
      return true;
    }
    const result = await loginUser(payload);
    if (result.ok) clearLoginRateLimit(identifier);
    sendJson(response, result.ok ? 200 : result.status ?? 401, result);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = bearerToken(request);
    sendJson(response, 200, await logoutUser(token));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/invitations/accept") {
    const result = await acceptInvitation(await readJson(request));
    sendJson(response, result.ok ? 200 : result.status ?? 422, result);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/password-reset/request") {
    const result = await requestPasswordReset(await readJson(request));
    sendJson(response, 200, result);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/password-reset/confirm") {
    const result = await resetPassword(await readJson(request));
    sendJson(response, result.ok ? 200 : result.status ?? 422, result);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const auth = await readAuthContext(bearerToken(request));
    sendJson(response, auth ? 200 : 401, auth ?? { error: "Non authentifie." });
    return true;
  }

  return false;
}

async function handleOrganizationUserApi(request, response, url, organizationId) {
  if (request.method === "GET" && url.pathname === "/api/organizations") {
    sendJson(response, 200, await readOrganizations());
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/organizations") {
    const auth = await requireRole(request, response, ["owner", "admin"]);
    if (!auth) return true;
    const result = await addOrganization(await readJson(request));
    sendJson(response, result.ok ? 201 : result.status ?? 422, result);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/users") {
    const auth = await requireRole(request, response, ["owner", "admin"]);
    if (!auth) return true;
    sendJson(response, 200, await readUsers(organizationId));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/users") {
    const auth = await requireRole(request, response, ["owner", "admin"]);
    if (!auth) return true;
    const result = await addUser({ ...(await readJson(request)), organizationId });
    sendJson(response, result.ok ? 201 : result.status ?? 422, result);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/users/invitations") {
    const auth = await requireRole(request, response, ["owner", "admin"]);
    if (!auth) return true;
    const result = await inviteUser({ ...(await readJson(request)), organizationId });
    sendJson(response, result.ok ? 201 : result.status ?? 422, result);
    return true;
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/users/")) {
    const auth = await requireRole(request, response, ["owner", "admin"]);
    if (!auth) return true;
    const userId = decodeURIComponent(url.pathname.split("/").at(-1));
    const result = await updateUser(userId, await readJson(request), auth);
    sendJson(response, result.ok ? 200 : result.status ?? 422, result);
    return true;
  }

  return false;
}

async function handleJobsFilesApi(request, response, url, organizationId) {
  if (request.method === "GET" && url.pathname === "/api/jobs") {
    sendJson(response, 200, await readJobs(organizationId));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/jobs") {
    const auth = await requireRole(request, response, ["owner", "admin", "accountant"]);
    if (!auth) return true;
    const result = await enqueueJob({ ...(await readJson(request)), organizationId });
    sendJson(response, result.ok ? 201 : result.status ?? 422, result);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/reports/export") {
    const auth = await requireRole(request, response, ["owner", "admin", "accountant"]);
    if (!auth) return true;
    const result = await enqueueJob({ type: "financial-statements-export", organizationId, payload: await readJson(request) });
    sendJson(response, result.ok ? 202 : result.status ?? 422, result);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/files") {
    sendJson(response, 200, await readStoredFiles(organizationId));
    return true;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/files/") && url.pathname.endsWith("/content")) {
    const fileId = decodeURIComponent(url.pathname.split("/").at(-2));
    const stored = await readStoredFileContent(fileId, organizationId);
    if (!stored) {
      sendJson(response, 404, { error: "Fichier introuvable." });
      return true;
    }
    response.writeHead(200, {
      "content-type": stored.file.mimeType,
      "content-disposition": `attachment; filename="${stored.file.name.replace(/"/g, "")}"`
    });
    response.end(stored.content);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/files/text") {
    const auth = await requireRole(request, response, ["owner", "admin", "accountant"]);
    if (!auth) return true;
    const result = await saveTextFile({ ...(await readJson(request)), organizationId });
    sendJson(response, result.ok ? 201 : result.status ?? 422, result);
    return true;
  }

  return false;
}

async function handleMasterDataApi(request, response, url, organizationId, db) {
  if (request.method === "GET" && url.pathname === "/api/company") {
    sendJson(response, 200, db.company);
    return true;
  }

  if (request.method === "PUT" && url.pathname === "/api/company") {
    const auth = await requireRole(request, response, ["owner", "admin"]);
    if (!auth) return true;
    const payload = await readJson(request);
    const result = await updateCompany({ ...payload, organizationId });
    sendJson(response, result.ok ? 200 : result.status ?? 422, result);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/accounts") {
    sendJson(response, 200, await readAccounts(organizationId));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/accounts") {
    const auth = await requireRole(request, response, ["owner", "admin", "accountant"]);
    if (!auth) return true;
    const result = await addCustomAccount({ ...(await readJson(request)), organizationId });
    sendJson(response, result.ok ? 201 : result.status ?? 422, result);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/account-classes") {
    sendJson(response, 200, accountClasses);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/journals") {
    sendJson(response, 200, await readJournals(organizationId));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/journals") {
    const auth = await requireRole(request, response, ["owner", "admin", "accountant"]);
    if (!auth) return true;
    const result = await addJournal({ ...(await readJson(request)), organizationId });
    sendJson(response, result.ok ? 201 : result.status ?? 422, result);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/auxiliary-accounts") {
    sendJson(response, 200, db.auxiliaryAccounts);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/auxiliary-accounts") {
    const auth = await requireRole(request, response, ["owner", "admin", "accountant"]);
    if (!auth) return true;
    const payload = await readJson(request);
    const result = await addAuxiliaryAccount({ ...payload, organizationId });
    sendJson(response, result.ok ? 201 : result.status ?? 422, result);
    return true;
  }

  return false;
}

async function handlePeriodsEntriesApi(request, response, url, organizationId, db) {
  if (request.method === "GET" && url.pathname === "/api/accounting-periods") {
    sendJson(response, 200, db.accountingPeriods);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/accounting-periods") {
    const auth = await requireRole(request, response, ["owner", "admin"]);
    if (!auth) return true;
    const payload = await readJson(request);
    const result = await addAccountingPeriod({ ...payload, organizationId });
    sendJson(response, result.ok ? 201 : result.status ?? 422, result);
    return true;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/accounting-periods/")) {
    const parts = url.pathname.split("/");
    const periodId = decodeURIComponent(parts.at(-2));
    const action = parts.at(-1);
    if (["lock", "unlock"].includes(action)) {
      const auth = await requireRole(request, response, ["owner", "admin"]);
      if (!auth) return true;
      const result = await setAccountingPeriodStatus(periodId, action === "lock" ? "locked" : "open", organizationId);
      sendJson(response, result.ok ? 200 : 404, result);
      return true;
    }
  }

  if (request.method === "GET" && url.pathname === "/api/journal-entries") {
    sendJson(response, 200, db.journalEntries);
    return true;
  }

  if (url.pathname.startsWith("/api/journal-entries/")) {
    const entryId = decodeURIComponent(url.pathname.split("/").at(-1));
    const entry = db.journalEntries.find((candidate) => candidate.id === entryId);

    if (request.method === "GET") {
      sendJson(response, entry ? 200 : 404, entry ?? { error: "Ecriture introuvable." });
      return true;
    }

    if (request.method === "PUT") {
      const auth = await requireRole(request, response, ["owner", "admin", "accountant"]);
      if (!auth) return true;
      if (!entry) {
        sendJson(response, 404, { error: "Ecriture introuvable." });
        return true;
      }
      const payload = await readJson(request);
      const validation = validateJournalEntry(payload, db.accounts);
      if (!validation.ok) {
        sendJson(response, 422, { errors: validation.errors });
        return true;
      }
      const result = await updateJournalEntry(entryId, payload);
      sendJson(response, result.ok ? 200 : result.status ?? 422, result);
      return true;
    }

    if (request.method === "DELETE") {
      const auth = await requireRole(request, response, ["owner", "admin", "accountant"]);
      if (!auth) return true;
      if (!entry) {
        sendJson(response, 404, { error: "Ecriture introuvable." });
        return true;
      }
      const result = await deleteJournalEntry(entryId);
      sendJson(response, result.ok ? 200 : result.status ?? 404, result);
      return true;
    }
  }

  if (request.method === "POST" && url.pathname === "/api/journal-entries") {
    const auth = await requireRole(request, response, ["owner", "admin", "accountant"]);
    if (!auth) return true;
    const payload = await readJson(request);
    const validation = validateJournalEntry(payload, db.accounts);

    if (!validation.ok) {
      sendJson(response, 422, { errors: validation.errors });
      return true;
    }

    const entry = normalizeJournalEntry({ ...payload, organizationId });
    await addJournalEntry(entry);
    sendJson(response, 201, entry);
    return true;
  }

  return false;
}

async function handleTreasuryOperationsApi(request, response, url, organizationId, db) {
  if (request.method === "GET" && url.pathname === "/api/bank-imports/batches") {
    sendJson(response, 200, db.bankImportBatches);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/subscriptions") {
    sendJson(response, 200, db.subscriptionBatches ?? []);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/subscriptions") {
    const auth = await requireRole(request, response, ["owner", "admin", "accountant"]);
    if (!auth) return true;
    const payload = await readJson(request);
    const batchId = crypto.randomUUID();
    const built = buildSubscriptionEntries(payload, batchId);
    if (!built.ok) {
      sendJson(response, 422, { errors: built.errors });
      return true;
    }

    const batch = await addSubscriptionBatch({
      id: batchId,
      organizationId,
      name: String(payload.name || "").trim(),
      description: String(payload.description || payload.name || "").trim(),
      startDate: payload.startDate,
      endDate: payload.endDate,
      frequency: "monthly",
      entryCount: built.entries.length,
      createdAt: new Date().toISOString()
    }, built.entries.map((entry) => ({ ...entry, organizationId })));
    sendJson(response, 201, { ok: true, batch, entries: built.entries });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/lettering") {
    sendJson(response, 200, await readLetteringState(url.searchParams.get("accountCode") ?? "", organizationId));
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/audit-events") {
    sendJson(response, 200, db.auditEvents ?? []);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/lettering/manual") {
    const auth = await requireRole(request, response, ["owner", "admin", "accountant"]);
    if (!auth) return true;
    const payload = await readJson(request);
    const result = await addManualLettering({ ...payload, organizationId });
    sendJson(response, result.ok ? 201 : result.status ?? 422, result);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/lettering/auto") {
    const auth = await requireRole(request, response, ["owner", "admin", "accountant"]);
    if (!auth) return true;
    const payload = await readJson(request);
    const result = await addAutomaticLettering({ ...payload, organizationId });
    sendJson(response, result.ok ? 201 : result.status ?? 422, result);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/bank-imports/sample") {
    response.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=bank-sample.csv"
    });
    response.end(sampleBankCsv());
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/bank-imports/preview") {
    const auth = await requireRole(request, response, ["owner", "admin", "accountant"]);
    if (!auth) return true;
    const payload = await readJson(request);
    const preview = previewBankCsv(
      payload.csv,
      db.classificationCorrections,
      journalEntryFingerprints(db.journalEntries)
    );
    sendJson(response, preview.ok ? 200 : 422, preview);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/bank-imports/commit") {
    const auth = await requireRole(request, response, ["owner", "admin", "accountant"]);
    if (!auth) return true;
    const payload = await readJson(request);
    const preview = previewBankCsv(
      payload.csv,
      db.classificationCorrections,
      journalEntryFingerprints(db.journalEntries)
    );

    if (!preview.ok) {
      sendJson(response, 422, preview);
      return true;
    }

    const editedTransactions = Array.isArray(payload.transactions) ? payload.transactions : preview.transactions;
    const corrections = buildLearningCorrections(preview.transactions, editedTransactions);
    const importableTransactions = editedTransactions.filter((transaction) => !transaction.duplicate);
    const batchId = crypto.randomUUID();
    const normalizedEntries = [];
    for (const draft of transactionsToJournalEntries(importableTransactions)) {
      const validation = validateJournalEntry(draft, db.accounts);
      if (!validation.ok) {
        sendJson(response, 422, { errors: validation.errors, transaction: draft.description });
        return true;
      }

      normalizedEntries.push(normalizeJournalEntry({ ...draft, batchId, organizationId }));
    }
    const imported = await addJournalEntries(normalizedEntries);
    const learned = await addClassificationCorrections(corrections.map((correction) => ({ ...correction, organizationId })));
    const batch = await addBankImportBatch({
      id: batchId,
      organizationId,
      createdAt: new Date().toISOString(),
      source: "bank-csv",
      status: "posted",
      transactionCount: editedTransactions.length,
      importedCount: imported.length,
      duplicateCount: editedTransactions.length - importableTransactions.length,
      learnedCount: learned.length,
      entryIds: imported.map((entry) => entry.id)
    });

    sendJson(response, 201, {
      importedCount: imported.length,
      duplicateCount: batch.duplicateCount,
      learnedCount: learned.length,
      batch,
      entries: imported
    });
    return true;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/bank-imports/batches/") && url.pathname.endsWith("/void")) {
    const auth = await requireRole(request, response, ["owner", "admin", "accountant"]);
    if (!auth) return true;
    const batchId = url.pathname.split("/").at(-2);
    const result = await voidBankImportBatch(batchId, organizationId);
    sendJson(response, result.ok ? 200 : result.status ?? 404, result);
    return true;
  }

  return false;
}

async function handleReportsApi(request, response, url, db) {
  if (request.method === "GET" && url.pathname === "/api/reports/trial-balance") {
    sendJson(response, 200, buildTrialBalance(entriesForReportPeriod(db.journalEntries, url), db.accounts));
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/general-ledger") {
    sendJson(response, 200, buildGeneralLedger(entriesForReportPeriod(db.journalEntries, url), db.auxiliaryAccounts, db.accounts));
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/auxiliary-balance") {
    sendJson(response, 200, buildAuxiliaryBalance(entriesForReportPeriod(db.journalEntries, url), db.auxiliaryAccounts));
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/balance-sheet") {
    sendJson(response, 200, buildBalanceSheet(entriesForReportPeriod(db.journalEntries, url), db.accounts));
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/income-statement") {
    sendJson(response, 200, buildIncomeStatement(entriesForReportPeriod(db.journalEntries, url), db.accounts));
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/closing-controls") {
    sendJson(response, 200, buildClosingControls(entriesForReportPeriod(db.journalEntries, url), db.accountingPeriods, db.accounts));
    return true;
  }

  return false;
}

async function handleApi(request, response, url) {
  const hasCors = applyCorsHeaders(request, response);
  if (request.method === "OPTIONS") {
    if (!hasCors) {
      sendJson(response, 403, { error: "Origine non autorisee." });
      return;
    }
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      service: "ohada-financeos-mvp",
      config: publicConfig,
      database: await databaseHealth()
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health/database") {
    const database = await databaseHealth({ checkPostgres: url.searchParams.get("checkPostgres") === "1" });
    sendJson(response, database.sqlite.ok ? 200 : 503, { ok: database.sqlite.ok, database });
    return;
  }

  if (url.pathname.startsWith("/api/auth/")) {
    const handled = await handleAuthApi(request, response, url);
    if (handled) return;
  }

  const authenticated = await requireAuth(request, response);
  if (!authenticated) return;
  const organizationId = authenticated.organization?.id ?? authenticated.user.organizationId;
  const db = await readDb(organizationId);

  if (await handleOrganizationUserApi(request, response, url, organizationId)) return;
  if (await handleJobsFilesApi(request, response, url, organizationId)) return;
  if (await handleMasterDataApi(request, response, url, organizationId, db)) return;
  if (await handlePeriodsEntriesApi(request, response, url, organizationId, db)) return;
  if (await handleTreasuryOperationsApi(request, response, url, organizationId, db)) return;
  if (await handleReportsApi(request, response, url, db)) return;

  sendJson(response, 404, { error: "Route introuvable." });
}

async function serveStatic(response, pathname) {
  const safePath = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);
  const file = await readFile(filePath);

  applySecurityHeaders(response);
  response.writeHead(200, { "content-type": contentType(filePath) });
  response.end(file);
}

function sendJson(response, status, payload) {
  applySecurityHeaders(response);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function entriesForReportPeriod(entries, url) {
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  return filterEntriesByPeriod(entries, from, to);
}

function filterEntriesByPeriod(entries, from = "", to = "") {
  return entries.filter((entry) => {
    const afterStart = !from || entry.date >= from;
    const beforeEnd = !to || entry.date <= to;
    return afterStart && beforeEnd;
  });
}

async function processNextJob() {
  const job = await claimNextJob();
  if (!job) return;

  try {
    if (job.type !== "financial-statements-export") {
      await failJob(job.id, `Type de job non supporte: ${job.type}`);
      return;
    }

    const organizationId = job.organizationId;
    const snapshot = await readDb(organizationId);
    const from = String(job.payload?.from || "");
    const to = String(job.payload?.to || "");
    const entries = filterEntriesByPeriod(snapshot.journalEntries, from, to);
    const generatedAt = new Date().toISOString();
    const exportBody = {
      generatedAt,
      period: { from: from || null, to: to || null },
      company: snapshot.company,
      trialBalance: buildTrialBalance(entries, snapshot.accounts),
      generalLedger: buildGeneralLedger(entries, snapshot.auxiliaryAccounts, snapshot.accounts),
      auxiliaryBalance: buildAuxiliaryBalance(entries, snapshot.auxiliaryAccounts),
      balanceSheet: buildBalanceSheet(entries, snapshot.accounts),
      incomeStatement: buildIncomeStatement(entries, snapshot.accounts),
      closingControls: buildClosingControls(entries, snapshot.accountingPeriods, snapshot.accounts)
    };
    const periodSlug = [from || "debut", to || "fin"].join("_");
    const saved = await saveTextFile({
      organizationId,
      name: `etats-financiers-${periodSlug}.json`,
      content: JSON.stringify(exportBody, null, 2),
      mimeType: "application/json; charset=utf-8"
    });

    if (!saved.ok) {
      await failJob(job.id, saved.error || "Export impossible");
      return;
    }

    await completeJob(job.id, {
      fileId: saved.file.id,
      fileName: saved.file.name,
      path: saved.file.path,
      generatedAt
    });
  } catch (error) {
    await failJob(job.id, error.message);
  }
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function bearerToken(request) {
  const authorization = request.headers.authorization || "";
  const [scheme, token] = authorization.split(/\s+/);
  return scheme?.toLowerCase() === "bearer" ? token ?? "" : "";
}

async function requireAuth(request, response) {
  const auth = await readAuthContext(bearerToken(request));
  if (!auth) {
    sendJson(response, 401, { error: "Authentification requise." });
    return null;
  }
  return auth;
}

async function requireRole(request, response, roles) {
  const auth = await requireAuth(request, response);
  if (!auth) return null;
  if (!roles.includes(auth.user.role)) {
    sendJson(response, 403, { error: "Droits insuffisants." });
    return null;
  }
  return auth;
}

function contentType(filePath) {
  const extension = extname(filePath);
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  }[extension] ?? "application/octet-stream";
}
