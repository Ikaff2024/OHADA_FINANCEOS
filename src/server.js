import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
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
import { accountClasses, accounts } from "./ohadaChart.js";
import {
  addAccountingPeriod,
  addAuxiliaryAccount,
  addBankImportBatch,
  addClassificationCorrections,
  addJournalEntries,
  addJournalEntry,
  addAutomaticLettering,
  addManualLettering,
  addSubscriptionBatch,
  deleteJournalEntry,
  readDb,
  readLetteringState,
  setAccountingPeriodStatus,
  updateCompany,
  voidBankImportBatch
} from "./store.js";
import { buildSubscriptionEntries } from "./subscriptions.js";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(rootDir, "public");
const port = Number(process.env.PORT || 3050);

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

async function handleApi(request, response, url) {
  const db = await readDb();

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, service: "ohada-financeos-mvp" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/company") {
    sendJson(response, 200, db.company);
    return;
  }

  if (request.method === "PUT" && url.pathname === "/api/company") {
    const payload = await readJson(request);
    const result = await updateCompany(payload);
    sendJson(response, result.ok ? 200 : result.status ?? 422, result);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/accounts") {
    sendJson(response, 200, accounts);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/account-classes") {
    sendJson(response, 200, accountClasses);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/auxiliary-accounts") {
    sendJson(response, 200, db.auxiliaryAccounts);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auxiliary-accounts") {
    const payload = await readJson(request);
    const result = await addAuxiliaryAccount(payload);
    sendJson(response, result.ok ? 201 : result.status ?? 422, result);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/accounting-periods") {
    sendJson(response, 200, db.accountingPeriods);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/accounting-periods") {
    const payload = await readJson(request);
    const result = await addAccountingPeriod(payload);
    sendJson(response, result.ok ? 201 : result.status ?? 422, result);
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/accounting-periods/")) {
    const parts = url.pathname.split("/");
    const periodId = decodeURIComponent(parts.at(-2));
    const action = parts.at(-1);
    if (["lock", "unlock"].includes(action)) {
      const result = await setAccountingPeriodStatus(periodId, action === "lock" ? "locked" : "open");
      sendJson(response, result.ok ? 200 : 404, result);
      return;
    }
  }

  if (request.method === "GET" && url.pathname === "/api/journal-entries") {
    sendJson(response, 200, db.journalEntries);
    return;
  }

  if (url.pathname.startsWith("/api/journal-entries/")) {
    const entryId = decodeURIComponent(url.pathname.split("/").at(-1));
    const entry = db.journalEntries.find((candidate) => candidate.id === entryId);

    if (request.method === "GET") {
      sendJson(response, entry ? 200 : 404, entry ?? { error: "Ecriture introuvable." });
      return;
    }

    if (request.method === "DELETE") {
      const result = await deleteJournalEntry(entryId);
      sendJson(response, result.ok ? 200 : result.status ?? 404, result);
      return;
    }
  }

  if (request.method === "GET" && url.pathname === "/api/bank-imports/batches") {
    sendJson(response, 200, db.bankImportBatches);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/subscriptions") {
    sendJson(response, 200, db.subscriptionBatches ?? []);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/subscriptions") {
    const payload = await readJson(request);
    const batchId = crypto.randomUUID();
    const built = buildSubscriptionEntries(payload, batchId);
    if (!built.ok) {
      sendJson(response, 422, { errors: built.errors });
      return;
    }

    const batch = await addSubscriptionBatch({
      id: batchId,
      name: String(payload.name || "").trim(),
      description: String(payload.description || payload.name || "").trim(),
      startDate: payload.startDate,
      endDate: payload.endDate,
      frequency: "monthly",
      entryCount: built.entries.length,
      createdAt: new Date().toISOString()
    }, built.entries);
    sendJson(response, 201, { ok: true, batch, entries: built.entries });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/lettering") {
    sendJson(response, 200, await readLetteringState(url.searchParams.get("accountCode") ?? ""));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/audit-events") {
    sendJson(response, 200, db.auditEvents ?? []);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/lettering/manual") {
    const payload = await readJson(request);
    const result = await addManualLettering(payload);
    sendJson(response, result.ok ? 201 : result.status ?? 422, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/lettering/auto") {
    const payload = await readJson(request);
    const result = await addAutomaticLettering(payload);
    sendJson(response, result.ok ? 201 : result.status ?? 422, result);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/bank-imports/sample") {
    response.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=bank-sample.csv"
    });
    response.end(sampleBankCsv());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/bank-imports/preview") {
    const payload = await readJson(request);
    const preview = previewBankCsv(
      payload.csv,
      db.classificationCorrections,
      journalEntryFingerprints(db.journalEntries)
    );
    sendJson(response, preview.ok ? 200 : 422, preview);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/bank-imports/commit") {
    const payload = await readJson(request);
    const preview = previewBankCsv(
      payload.csv,
      db.classificationCorrections,
      journalEntryFingerprints(db.journalEntries)
    );

    if (!preview.ok) {
      sendJson(response, 422, preview);
      return;
    }

    const editedTransactions = Array.isArray(payload.transactions) ? payload.transactions : preview.transactions;
    const corrections = buildLearningCorrections(preview.transactions, editedTransactions);
    const importableTransactions = editedTransactions.filter((transaction) => !transaction.duplicate);
    const batchId = crypto.randomUUID();
    const normalizedEntries = [];
    for (const draft of transactionsToJournalEntries(importableTransactions)) {
      const validation = validateJournalEntry(draft);
      if (!validation.ok) {
        sendJson(response, 422, { errors: validation.errors, transaction: draft.description });
        return;
      }

      normalizedEntries.push(normalizeJournalEntry({ ...draft, batchId }));
    }
    const imported = await addJournalEntries(normalizedEntries);
    const learned = await addClassificationCorrections(corrections);
    const batch = await addBankImportBatch({
      id: batchId,
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
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/api/bank-imports/batches/") && url.pathname.endsWith("/void")) {
    const batchId = url.pathname.split("/").at(-2);
    const result = await voidBankImportBatch(batchId);
    sendJson(response, result.ok ? 200 : result.status ?? 404, result);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/journal-entries") {
    const payload = await readJson(request);
    const validation = validateJournalEntry(payload);

    if (!validation.ok) {
      sendJson(response, 422, { errors: validation.errors });
      return;
    }

    const entry = normalizeJournalEntry(payload);
    await addJournalEntry(entry);
    sendJson(response, 201, entry);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/trial-balance") {
    sendJson(response, 200, buildTrialBalance(entriesForReportPeriod(db.journalEntries, url)));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/general-ledger") {
    sendJson(response, 200, buildGeneralLedger(entriesForReportPeriod(db.journalEntries, url), db.auxiliaryAccounts));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/auxiliary-balance") {
    sendJson(response, 200, buildAuxiliaryBalance(entriesForReportPeriod(db.journalEntries, url), db.auxiliaryAccounts));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/balance-sheet") {
    sendJson(response, 200, buildBalanceSheet(entriesForReportPeriod(db.journalEntries, url)));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/income-statement") {
    sendJson(response, 200, buildIncomeStatement(entriesForReportPeriod(db.journalEntries, url)));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/reports/closing-controls") {
    sendJson(response, 200, buildClosingControls(entriesForReportPeriod(db.journalEntries, url), db.accountingPeriods));
    return;
  }

  sendJson(response, 404, { error: "Route introuvable." });
}

async function serveStatic(response, pathname) {
  const safePath = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);
  const file = await readFile(filePath);

  response.writeHead(200, { "content-type": contentType(filePath) });
  response.end(file);
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function entriesForReportPeriod(entries, url) {
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  return entries.filter((entry) => {
    const afterStart = !from || entry.date >= from;
    const beforeEnd = !to || entry.date <= to;
    return afterStart && beforeEnd;
  });
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
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
