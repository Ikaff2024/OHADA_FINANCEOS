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
  validateJournalEntry,
  buildAgedBalance
} from "./accounting.js";
import {
  buildSyscohadaBalanceSheet,
  buildSyscohadaIncomeStatement,
  buildVatDeclaration
} from "./syscohadaReports.js";
import {
  buildLearningCorrections,
  journalEntryFingerprints,
  previewBankCsv,
  sampleBankCsv,
  transactionsToJournalEntries
} from "./bankImport.js";
import { accountClasses } from "./ohadaChart.js";
import { askAssistant } from "./ai.js";
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
  requeueJob,
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
import { randomUUID } from "node:crypto";
import { config, publicConfig, rootDir } from "./config.js";
import { databaseHealth } from "./databaseHealth.js";
import { buildSubscriptionEntries } from "./subscriptions.js";
import { logger } from "./logger.js";
import { recordRequest, renderMetrics } from "./metrics.js";

const publicDir = join(rootDir, "public");
const port = config.port;
const loginAttempts = new Map();
const jobAttempts = new Map();
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'"
].join("; ");
const securityHeaders = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "content-security-policy": contentSecurityPolicy,
  "cross-origin-opener-policy": "same-origin",
  "x-permitted-cross-domain-policies": "none"
};

assertSafeStartupConfig();

const server = createServer(async (request, response) => {
  const startedAt = process.hrtime.bigint();
  const requestId = resolveRequestId(request);
  request.log = logger.child({ requestId });
  response.setHeader("x-request-id", requestId);

  response.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    recordRequest(request.method, response.statusCode, durationMs);
    const level = response.statusCode >= 500 ? "error" : "info";
    request.log[level]("request", {
      method: request.method,
      path: safePathForLog(request.url),
      status: response.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      ip: clientIp(request)
    });
  });

  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    await serveStatic(response, url.pathname);
  } catch (error) {
    const status = error.status ?? 500;
    if (status >= 500) {
      request.log.error("unhandled_request_error", { message: error.message, stack: error.stack });
    }
    if (!response.headersSent) {
      sendJson(response, status, {
        error: error.status ? error.message : "Erreur serveur interne."
      });
    }
  }
});

server.requestTimeout = config.requestTimeoutMs;
server.headersTimeout = Math.max(5000, config.requestTimeoutMs + 5000);

server.listen(port, () => {
  logger.info("server_started", { port, runtimeDatabase: config.runtimeDatabase });
});

const jobWorker = setInterval(() => {
  processNextJob().catch((error) =>
    logger.error("job_worker_error", { message: error.message, stack: error.stack })
  );
}, config.jobWorkerIntervalMs);

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => shutdown(signal));
}

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("server_shutdown", { signal });
  clearInterval(jobWorker);
  server.close(() => process.exit(0));
  setTimeout(() => {
    server.closeAllConnections?.();
    process.exit(1);
  }, 10000).unref();
}

function assertSafeStartupConfig() {
  const isProduction = String(process.env.NODE_ENV || "").toLowerCase() === "production";
  if (!isProduction) return;

  if (
    ["admin12345", "change-me-before-production"].includes(config.defaultAdminPassword) ||
    config.defaultAdminPassword.length < 12
  ) {
    throw new Error(
      "Configuration non securisee: OHADA_DEFAULT_ADMIN_PASSWORD doit etre defini avec un mot de passe fort en production."
    );
  }

  if (config.exposeAuthTokens) {
    throw new Error(
      "Configuration non securisee: OHADA_EXPOSE_AUTH_TOKENS doit rester desactive en production."
    );
  }
}

function consumeLoginRateLimit(identifier) {
  const now = Date.now();
  const windowMs = Math.max(1000, Number(config.authRateLimitWindowMs) || 900000);
  const maxAttempts = Math.max(1, Number(config.authRateLimitMaxAttempts) || 10);
  const attempts = (loginAttempts.get(identifier) || []).filter(
    (timestamp) => now - timestamp < windowMs
  );

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
  const forwarded = String(request.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  if (forwarded) return forwarded;
  return request.socket?.remoteAddress || "unknown";
}

function resolveRequestId(request) {
  const incoming = String(request.headers["x-request-id"] || "").trim();
  if (incoming && incoming.length <= 200) return incoming;
  return randomUUID();
}

function safePathForLog(rawUrl) {
  try {
    return new URL(rawUrl, "http://localhost").pathname;
  } catch {
    return "/";
  }
}

function applySecurityHeaders(response) {
  for (const [header, value] of Object.entries(securityHeaders)) {
    response.setHeader(header, value);
  }
  if (config.enableHsts) {
    response.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
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
  response.setHeader(
    "access-control-allow-headers",
    "content-type,authorization,x-organization-id"
  );
  return true;
}

function loginIdentifier(request, email) {
  return `${clientIp(request)}|${String(email || "")
    .trim()
    .toLowerCase()}`;
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
    sendJson(response, result.ok ? 200 : (result.status ?? 401), result);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = bearerToken(request);
    sendJson(response, 200, await logoutUser(token));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/invitations/accept") {
    const result = await acceptInvitation(await readJson(request));
    sendJson(response, result.ok ? 200 : (result.status ?? 422), result);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/password-reset/request") {
    const result = await requestPasswordReset(await readJson(request));
    sendJson(response, 200, result);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/password-reset/confirm") {
    const result = await resetPassword(await readJson(request));
    sendJson(response, result.ok ? 200 : (result.status ?? 422), result);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const activeOrganizationId = request.headers["x-organization-id"] || null;
    const auth = await readAuthContext(bearerToken(request), activeOrganizationId);
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
    sendJson(response, result.ok ? 201 : (result.status ?? 422), result);
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
    sendJson(response, result.ok ? 201 : (result.status ?? 422), result);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/users/invitations") {
    const auth = await requireRole(request, response, ["owner", "admin"]);
    if (!auth) return true;
    const result = await inviteUser({ ...(await readJson(request)), organizationId });
    sendJson(response, result.ok ? 201 : (result.status ?? 422), result);
    return true;
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/users/")) {
    const auth = await requireRole(request, response, ["owner", "admin"]);
    if (!auth) return true;
    const userId = decodeURIComponent(url.pathname.split("/").at(-1));
    const result = await updateUser(userId, await readJson(request), auth);
    sendJson(response, result.ok ? 200 : (result.status ?? 422), result);
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
    sendJson(response, result.ok ? 201 : (result.status ?? 422), result);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/reports/export") {
    const auth = await requireRole(request, response, ["owner", "admin", "accountant"]);
    if (!auth) return true;
    const result = await enqueueJob({
      type: "financial-statements-export",
      organizationId,
      payload: await readJson(request)
    });
    sendJson(response, result.ok ? 202 : (result.status ?? 422), result);
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/files") {
    sendJson(response, 200, await readStoredFiles(organizationId));
    return true;
  }

  if (
    request.method === "GET" &&
    url.pathname.startsWith("/api/files/") &&
    url.pathname.endsWith("/content")
  ) {
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
    sendJson(response, result.ok ? 201 : (result.status ?? 422), result);
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
    sendJson(response, result.ok ? 200 : (result.status ?? 422), result);
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
    sendJson(response, result.ok ? 201 : (result.status ?? 422), result);
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
    sendJson(response, result.ok ? 201 : (result.status ?? 422), result);
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
    sendJson(response, result.ok ? 201 : (result.status ?? 422), result);
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
    sendJson(response, result.ok ? 201 : (result.status ?? 422), result);
    return true;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/accounting-periods/")) {
    const parts = url.pathname.split("/");
    const periodId = decodeURIComponent(parts.at(-2));
    const action = parts.at(-1);
    if (["lock", "unlock"].includes(action)) {
      const auth = await requireRole(request, response, ["owner", "admin"]);
      if (!auth) return true;
      const result = await setAccountingPeriodStatus(
        periodId,
        action === "lock" ? "locked" : "open",
        organizationId
      );
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
      sendJson(response, result.ok ? 200 : (result.status ?? 422), result);
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
      sendJson(response, result.ok ? 200 : (result.status ?? 404), result);
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

    const batch = await addSubscriptionBatch(
      {
        id: batchId,
        organizationId,
        name: String(payload.name || "").trim(),
        description: String(payload.description || payload.name || "").trim(),
        startDate: payload.startDate,
        endDate: payload.endDate,
        frequency: "monthly",
        entryCount: built.entries.length,
        createdAt: new Date().toISOString()
      },
      built.entries.map((entry) => ({ ...entry, organizationId }))
    );
    sendJson(response, 201, { ok: true, batch, entries: built.entries });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/lettering") {
    sendJson(
      response,
      200,
      await readLetteringState(url.searchParams.get("accountCode") ?? "", organizationId)
    );
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
    sendJson(response, result.ok ? 201 : (result.status ?? 422), result);
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/lettering/auto") {
    const auth = await requireRole(request, response, ["owner", "admin", "accountant"]);
    if (!auth) return true;
    const payload = await readJson(request);
    const result = await addAutomaticLettering({ ...payload, organizationId });
    sendJson(response, result.ok ? 201 : (result.status ?? 422), result);
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

    const editedTransactions = Array.isArray(payload.transactions)
      ? payload.transactions
      : preview.transactions;
    const corrections = buildLearningCorrections(preview.transactions, editedTransactions);
    const importableTransactions = editedTransactions.filter(
      (transaction) => !transaction.duplicate
    );
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
    const learned = await addClassificationCorrections(
      corrections.map((correction) => ({ ...correction, organizationId }))
    );
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

  if (
    request.method === "POST" &&
    url.pathname.startsWith("/api/bank-imports/batches/") &&
    url.pathname.endsWith("/void")
  ) {
    const auth = await requireRole(request, response, ["owner", "admin", "accountant"]);
    if (!auth) return true;
    const batchId = url.pathname.split("/").at(-2);
    const result = await voidBankImportBatch(batchId, organizationId);
    sendJson(response, result.ok ? 200 : (result.status ?? 404), result);
    return true;
  }

  return false;
}

async function handleReportsApi(request, response, url, db) {
  if (request.method === "GET" && url.pathname === "/api/reports/trial-balance") {
    sendJson(
      response,
      200,
      buildTrialBalance(entriesForReportPeriod(db.journalEntries, url), db.accounts)
    );
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/general-ledger") {
    sendJson(
      response,
      200,
      buildGeneralLedger(
        entriesForReportPeriod(db.journalEntries, url),
        db.auxiliaryAccounts,
        db.accounts
      )
    );
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/auxiliary-balance") {
    sendJson(
      response,
      200,
      buildAuxiliaryBalance(entriesForReportPeriod(db.journalEntries, url), db.auxiliaryAccounts)
    );
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/balance-sheet") {
    const entries = entriesForReportPeriod(db.journalEntries, url);
    const syscohada = buildSyscohadaBalanceSheet(entries, db.accounts);
    sendJson(response, 200, {
      ...buildBalanceSheet(entries, db.accounts),
      ...syscohada,
      syscohada
    });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/income-statement") {
    sendJson(
      response,
      200,
      buildSyscohadaIncomeStatement(entriesForReportPeriod(db.journalEntries, url), db.accounts)
    );
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/vat-declaration") {
    sendJson(
      response,
      200,
      buildVatDeclaration(entriesForReportPeriod(db.journalEntries, url), db.accounts)
    );
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/closing-controls") {
    sendJson(
      response,
      200,
      buildClosingControls(
        entriesForReportPeriod(db.journalEntries, url),
        db.accountingPeriods,
        db.accounts
      )
    );
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/aged-balance/clients") {
    const asOfDate = url.searchParams.get("to") || "";
    sendJson(
      response,
      200,
      buildAgedBalance(
        entriesForReportPeriod(db.journalEntries, url),
        db.auxiliaryAccounts,
        asOfDate,
        "41",
        "AR"
      )
    );
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/aged-balance/suppliers") {
    const asOfDate = url.searchParams.get("to") || "";
    sendJson(
      response,
      200,
      buildAgedBalance(
        entriesForReportPeriod(db.journalEntries, url),
        db.auxiliaryAccounts,
        asOfDate,
        "40",
        "AP"
      )
    );
    return true;
  }

  return false;
}
async function handleChatApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/chat") {
    try {
      const payload = await readJson(request);
      const answer = await askAssistant(payload.message, payload.history || []);
      sendJson(response, 200, { answer });
    } catch (e) {
      const status = e.status ?? 500;
      request.log.error("chat_api_error", { message: e.message, status });
      sendJson(response, status, {
        error: e.status ? e.message : "Erreur lors de la generation de la reponse."
      });
    }
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
    const database = await databaseHealth();
    sendJson(response, database.ok ? 200 : 503, {
      ok: database.ok,
      service: "ohada-financeos-mvp",
      config: publicConfig,
      database
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health/database") {
    const database = await databaseHealth({
      checkPostgres: url.searchParams.get("checkPostgres") === "1"
    });
    sendJson(response, database.ok ? 200 : 503, { ok: database.ok, database });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/metrics") {
    if (config.metricsToken && bearerToken(request) !== config.metricsToken) {
      sendJson(response, 401, { error: "Authentification requise." });
      return;
    }
    applySecurityHeaders(response);
    response.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
    response.end(renderMetrics());
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
  if (await handleChatApi(request, response, url)) return;

  sendJson(response, 404, { error: "Route introuvable." });
}

async function serveStatic(response, pathname) {
  const safePath = normalize(pathname === "/" ? "/index.html" : pathname).replace(
    /^(\.\.[/\\])+/,
    ""
  );
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
      jobAttempts.delete(job.id);
      await failJob(job.id, saved.error || "Export impossible");
      return;
    }

    jobAttempts.delete(job.id);
    await completeJob(job.id, {
      fileId: saved.file.id,
      fileName: saved.file.name,
      path: saved.file.path,
      generatedAt
    });
  } catch (error) {
    await handleJobFailure(job, error);
  }
}

async function handleJobFailure(job, error) {
  const attempts = (jobAttempts.get(job.id) || 0) + 1;
  if (attempts < config.maxJobAttempts) {
    jobAttempts.set(job.id, attempts);
    logger.warn("job_retry", {
      jobId: job.id,
      type: job.type,
      attempt: attempts,
      maxAttempts: config.maxJobAttempts,
      message: error.message
    });
    await requeueJob(job.id, `Tentative ${attempts} echouee: ${error.message}`);
    return;
  }

  jobAttempts.delete(job.id);
  logger.error("job_failed", {
    jobId: job.id,
    type: job.type,
    attempts,
    message: error.message
  });
  await failJob(job.id, error.message);
}

async function readJson(request) {
  const limit = config.maxRequestBodyBytes;
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("Charge utile trop volumineuse.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function bearerToken(request) {
  const authorization = request.headers.authorization || "";
  const [scheme, token] = authorization.split(/\s+/);
  return scheme?.toLowerCase() === "bearer" ? (token ?? "") : "";
}

async function requireAuth(request, response) {
  const activeOrganizationId = request.headers["x-organization-id"] || null;
  const auth = await readAuthContext(bearerToken(request), activeOrganizationId);
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
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8"
    }[extension] ?? "application/octet-stream"
  );
}
