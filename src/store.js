import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { normalizeJournalEntry } from "./accounting.js";
import { accountByCode } from "./ohadaChart.js";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultSqlitePath = join(rootDir, "data", "financeos.sqlite");
const legacyJsonPath = join(rootDir, "data", "db.json");
const dbPath = process.env.OHADA_DB_PATH || defaultSqlitePath;

const seed = {
  company: {
    id: "demo-company",
    name: "Demo PME OHADA",
    country: "CI",
    currency: "XOF",
    fiscalYearStart: "2026-01-01",
    fiscalYearEnd: "2026-12-31"
  },
  auxiliaryAccounts: [
    { code: "C-ALPHA", label: "Client Alpha", accountCode: "4111", createdAt: "2026-05-09T15:14:25.084Z" },
    { code: "F-DEMO", label: "Fournisseur Demo", accountCode: "4011", createdAt: "2026-05-09T15:14:25.084Z" }
  ],
  classificationCorrections: [],
  bankImportBatches: [],
  subscriptionBatches: [],
  letteringGroups: [],
  journalEntries: [
    normalizeJournalEntry({
      id: "entry-001",
      date: "2026-01-05",
      reference: "INIT-2026-001",
      description: "Apport initial en capital",
      source: "seed",
      lines: [
        { accountCode: "5211", label: "Depot bancaire", debit: 5000000, credit: 0 },
        { accountCode: "1013", label: "Capital social", debit: 0, credit: 5000000 }
      ]
    }),
    normalizeJournalEntry({
      id: "entry-002",
      date: "2026-01-12",
      reference: "FAC-2026-001",
      description: "Vente de services client Alpha",
      source: "seed",
      lines: [
        { accountCode: "4111", auxiliaryCode: "C-ALPHA", label: "Facture client Alpha", debit: 1250000, credit: 0 },
        { accountCode: "7061", label: "Services vendus", debit: 0, credit: 1250000 }
      ]
    }),
    normalizeJournalEntry({
      id: "entry-003",
      date: "2026-01-20",
      reference: "BNQ-2026-001",
      description: "Paiement loyer bureau",
      source: "seed",
      lines: [
        { accountCode: "6222", label: "Loyer bureau", debit: 300000, credit: 0 },
        { accountCode: "5211", label: "Paiement banque", debit: 0, credit: 300000 }
      ]
    })
  ]
};

let database;

export async function readDb() {
  const db = await getDatabase();
  return readSnapshot(db);
}

export async function updateCompany(input) {
  const db = await getDatabase();
  const current = readCompany(db);
  const company = {
    ...current,
    name: String(input.name || "").trim(),
    country: String(input.country || "").trim().toUpperCase(),
    currency: String(input.currency || "").trim().toUpperCase(),
    fiscalYearStart: String(input.fiscalYearStart || "").trim(),
    fiscalYearEnd: String(input.fiscalYearEnd || "").trim()
  };

  const errors = validateCompany(company);
  if (errors.length > 0) {
    return { ok: false, status: 422, errors };
  }

  withTransaction(db, () => {
    insertCompany(db, company);
    ensurePeriodForCompany(db, company);
  });

  return { ok: true, company: readCompany(db), accountingPeriods: readPeriods(db) };
}

export async function addJournalEntry(entry) {
  return (await addJournalEntries([entry]))[0];
}

export async function addJournalEntries(entries) {
  if (entries.length === 0) return [];

  const db = await getDatabase();
  const normalizedEntries = entries.map((entry) => normalizeJournalEntry(entry));
  assertEntriesInOpenPeriods(db, normalizedEntries);
  withTransaction(db, () => {
    for (const entry of normalizedEntries) {
      insertEntry(db, entry);
    }
  });
  return normalizedEntries;
}

export async function addAuxiliaryAccount(input) {
  const db = await getDatabase();
  const code = String(input.code || "").trim().toUpperCase();
  const label = String(input.label || "").trim();
  const accountCode = String(input.accountCode || "").trim();

  if (!code || code.length < 2) {
    return { ok: false, status: 422, error: "Le code auxiliaire est obligatoire." };
  }
  if (!label || label.length < 2) {
    return { ok: false, status: 422, error: "Le libelle auxiliaire est obligatoire." };
  }
  if (!accountCode) {
    return { ok: false, status: 422, error: "Le compte collectif est obligatoire." };
  }
  if (!accountByCode.has(accountCode) || accountCode.length !== 4) {
    return { ok: false, status: 422, error: "Le compte collectif doit etre un compte OHADA a 4 chiffres." };
  }

  const auxiliary = {
    code,
    label,
    accountCode,
    createdAt: new Date().toISOString()
  };
  insertAuxiliaryAccount(db, auxiliary);
  return { ok: true, auxiliary };
}

export async function deleteJournalEntry(entryId) {
  const db = await getDatabase();
  const entry = readEntry(db, entryId);
  if (!entry) {
    return { ok: false, error: "Ecriture introuvable." };
  }
  const lockedPeriod = findLockedPeriodForDate(db, entry.date);
  if (lockedPeriod) {
    return { ok: false, status: 423, error: `Periode verrouillee: ${lockedPeriod.name}.` };
  }

  withTransaction(db, () => {
    db.prepare("DELETE FROM journal_lines WHERE entry_id = ?").run(entryId);
    db.prepare("DELETE FROM journal_entries WHERE id = ?").run(entryId);

    if (entry.batchId) {
      const batch = readBatch(db, entry.batchId);
      if (batch) {
        const entryIds = batch.entryIds.filter((id) => id !== entryId);
        db.prepare(`
          UPDATE bank_import_batches
          SET entry_ids_json = ?, imported_count = ?, status = ?, updated_at = ?
          WHERE id = ?
        `).run(
          JSON.stringify(entryIds),
          Math.max(0, batch.importedCount - 1),
          entryIds.length === 0 ? "voided" : "partial",
          new Date().toISOString(),
          batch.id
        );
      }
    }
  });

  return { ok: true, entry };
}

export async function addBankImportBatch(batch) {
  const db = await getDatabase();
  insertBatch(db, batch);
  return batch;
}

export async function addSubscriptionBatch(batch, entries) {
  const db = await getDatabase();
  const normalizedEntries = entries.map((entry) => normalizeJournalEntry(entry));
  assertEntriesInOpenPeriods(db, normalizedEntries);
  withTransaction(db, () => {
    insertSubscriptionBatch(db, {
      ...batch,
      entryIds: normalizedEntries.map((entry) => entry.id)
    });
    for (const entry of normalizedEntries) {
      insertEntry(db, entry);
    }
  });
  return {
    ...batch,
    entryIds: normalizedEntries.map((entry) => entry.id),
    entries: normalizedEntries
  };
}

export async function readLetteringState(accountCode = "") {
  const db = await getDatabase();
  return buildLetteringState(db, accountCode);
}

export async function addManualLettering(input) {
  const db = await getDatabase();
  const selectedRefs = Array.isArray(input.lineRefs)
    ? [...new Set(input.lineRefs.map((ref) => String(ref || "").trim()).filter(Boolean))]
    : [];

  if (selectedRefs.length < 2) {
    return { ok: false, status: 422, error: "Selectionnez au moins deux lignes a lettrer." };
  }

  const rows = readLetteringRows(db);
  const rowsByRef = new Map(rows.map((row) => [row.lineRef, row]));
  const selectedRows = selectedRefs.map((ref) => rowsByRef.get(ref));
  if (selectedRows.some((row) => !row)) {
    return { ok: false, status: 422, error: "Une ligne selectionnee est introuvable." };
  }

  const firstAccountCode = selectedRows[0].accountCode;
  if (selectedRows.some((row) => row.accountCode !== firstAccountCode)) {
    return { ok: false, status: 422, error: "Le lettrage manuel doit porter sur un seul compte." };
  }
  if (selectedRows.some((row) => row.letteringCode)) {
    return { ok: false, status: 422, error: "Une ligne selectionnee est deja lettree." };
  }

  const totals = sumLetteringRows(selectedRows);
  if (totals.debit === 0 && totals.credit === 0) {
    return { ok: false, status: 422, error: "Le lettrage doit contenir un montant." };
  }
  if (totals.debit !== totals.credit) {
    return { ok: false, status: 422, error: "Le debit et le credit selectionnes doivent etre equilibres." };
  }

  const group = createLetteringGroup(db, firstAccountCode, selectedRefs, "manual");
  return { ok: true, group, rows: buildLetteringState(db, firstAccountCode) };
}

export async function addAutomaticLettering(input = {}) {
  const db = await getDatabase();
  const requestedAccountCode = String(input.accountCode || "").trim();
  const rows = readLetteringRows(db)
    .filter((row) => !row.letteringCode)
    .filter((row) => !requestedAccountCode || row.accountCode === requestedAccountCode)
    .filter((row) => row.debit > 0 || row.credit > 0);

  const groups = [];
  withTransaction(db, () => {
    for (const rowsForAccount of groupRowsByAccount(rows).values()) {
      for (const match of matchLetteringPairs(rowsForAccount)) {
        groups.push(createLetteringGroup(db, match[0].accountCode, match.map((row) => row.lineRef), "automatic"));
      }
    }
  });

  return {
    ok: true,
    groups,
    matchedLineCount: groups.reduce((count, group) => count + group.lineRefs.length, 0),
    rows: buildLetteringState(db, requestedAccountCode)
  };
}

export async function voidBankImportBatch(batchId) {
  const db = await getDatabase();
  const batch = readBatch(db, batchId);
  if (!batch) {
    return { ok: false, error: "Lot d'import introuvable." };
  }

  if (batch.status === "voided") {
    return { ok: true, batch, removedCount: 0 };
  }

  const entryIds = new Set(batch.entryIds);
  const entries = [...entryIds].map((entryId) => readEntry(db, entryId)).filter(Boolean);
  const lockedPeriod = entries.map((entry) => findLockedPeriodForDate(db, entry.date)).find(Boolean);
  if (lockedPeriod) {
    return { ok: false, status: 423, error: `Periode verrouillee: ${lockedPeriod.name}.` };
  }

  const before = Number(db.prepare("SELECT COUNT(*) AS count FROM journal_entries").get().count);
  withTransaction(db, () => {
    for (const entryId of entryIds) {
      db.prepare("DELETE FROM journal_lines WHERE entry_id = ?").run(entryId);
      db.prepare("DELETE FROM journal_entries WHERE id = ?").run(entryId);
    }
    db.prepare(`
      UPDATE bank_import_batches
      SET status = 'voided', voided_at = ?, updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), new Date().toISOString(), batchId);
  });
  const after = Number(db.prepare("SELECT COUNT(*) AS count FROM journal_entries").get().count);

  return { ok: true, batch: { ...batch, status: "voided" }, removedCount: before - after };
}

export async function addClassificationCorrections(corrections) {
  if (corrections.length === 0) return [];

  const db = await getDatabase();
  const newCorrections = [];
  withTransaction(db, () => {
    const statement = db.prepare(`
      INSERT OR IGNORE INTO classification_corrections
      (match_text, description, direction, account_code, counterparty_account_code, reason, confidence, learned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const correction of corrections) {
      const result = statement.run(
        correction.matchText,
        correction.description,
        correction.direction,
        correction.accountCode,
        correction.counterpartyAccountCode,
        correction.reason,
        correction.confidence,
        correction.learnedAt
      );
      if (result.changes > 0) newCorrections.push(correction);
    }
  });

  return newCorrections;
}

export async function setAccountingPeriodStatus(periodId, status) {
  const db = await getDatabase();
  if (!["open", "locked"].includes(status)) {
    return { ok: false, error: "Statut de periode invalide." };
  }

  const period = readPeriod(db, periodId);
  if (!period) {
    return { ok: false, error: "Periode introuvable." };
  }

  const timestamp = new Date().toISOString();
  db.prepare(`
    UPDATE accounting_periods
    SET status = ?, locked_at = ?, updated_at = ?
    WHERE id = ?
  `).run(status, status === "locked" ? timestamp : null, timestamp, periodId);

  return { ok: true, period: readPeriod(db, periodId) };
}

async function getDatabase() {
  if (database) return database;

  await mkdir(dirname(dbPath), { recursive: true });
  database = new DatabaseSync(dbPath);
  database.exec("PRAGMA foreign_keys = ON");
  createSchema(database);
  await seedIfEmpty(database);
  ensureCompanyPeriod(database);
  ensureDefaultAuxiliaries(database);
  return database;
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      country TEXT NOT NULL,
      currency TEXT NOT NULL,
      fiscal_year_start TEXT NOT NULL,
      fiscal_year_end TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      reference TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      source TEXT NOT NULL,
      batch_id TEXT,
      bank_fingerprint TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS journal_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      line_index INTEGER NOT NULL,
      account_code TEXT NOT NULL,
      label TEXT NOT NULL,
      auxiliary_code TEXT,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS auxiliary_accounts (
      code TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      account_code TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bank_import_batches (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      transaction_count INTEGER NOT NULL,
      imported_count INTEGER NOT NULL,
      duplicate_count INTEGER NOT NULL,
      learned_count INTEGER NOT NULL,
      entry_ids_json TEXT NOT NULL,
      voided_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS subscription_batches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      frequency TEXT NOT NULL,
      entry_count INTEGER NOT NULL,
      entry_ids_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lettering_groups (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      account_code TEXT NOT NULL,
      line_refs_json TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('manual', 'automatic')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS classification_corrections (
      match_text TEXT NOT NULL,
      description TEXT NOT NULL,
      direction TEXT NOT NULL,
      account_code TEXT NOT NULL,
      counterparty_account_code TEXT NOT NULL,
      reason TEXT NOT NULL,
      confidence REAL NOT NULL,
      learned_at TEXT NOT NULL,
      PRIMARY KEY (direction, match_text, account_code)
    );

    CREATE TABLE IF NOT EXISTS accounting_periods (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open', 'locked')),
      locked_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_journal_entries_created_at ON journal_entries(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_journal_entries_batch_id ON journal_entries(batch_id);
    CREATE INDEX IF NOT EXISTS idx_journal_entries_bank_fingerprint ON journal_entries(bank_fingerprint);
    CREATE INDEX IF NOT EXISTS idx_auxiliary_accounts_account_code ON auxiliary_accounts(account_code);
    CREATE INDEX IF NOT EXISTS idx_accounting_periods_dates ON accounting_periods(start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_subscription_batches_created_at ON subscription_batches(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lettering_groups_account_code ON lettering_groups(account_code);
  `);
  addColumnIfMissing(db, "journal_entries", "reference", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "journal_lines", "auxiliary_code", "TEXT");
  migrateLegacyAccountCodes(db);
  backfillEntryReferences(db);
  db.exec("CREATE INDEX IF NOT EXISTS idx_journal_lines_auxiliary_code ON journal_lines(auxiliary_code)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_journal_entries_reference ON journal_entries(reference)");
}

async function seedIfEmpty(db) {
  const count = Number(db.prepare("SELECT COUNT(*) AS count FROM companies").get().count);
  if (count > 0) return;

  const legacy = await readLegacyJson();
  writeSnapshot(db, legacy ?? seed);
}

async function readLegacyJson() {
  if (process.env.OHADA_DB_PATH || !existsSync(legacyJsonPath)) return null;

  try {
    const legacy = JSON.parse(await readFile(legacyJsonPath, "utf8"));
    legacy.classificationCorrections ??= [];
    legacy.bankImportBatches ??= [];
    legacy.auxiliaryAccounts ??= [];
    legacy.letteringGroups ??= [];
    return legacy;
  } catch {
    return null;
  }
}

function readSnapshot(db) {
  return {
    company: readCompany(db),
    accountingPeriods: readPeriods(db),
    auxiliaryAccounts: readAuxiliaryAccounts(db),
    classificationCorrections: readCorrections(db),
    bankImportBatches: readBatches(db),
    subscriptionBatches: readSubscriptionBatches(db),
    letteringGroups: readLetteringGroups(db),
    journalEntries: readEntries(db)
  };
}

function writeSnapshot(db, snapshot) {
  withTransaction(db, () => {
    insertCompany(db, snapshot.company);
    for (const period of snapshot.accountingPeriods ?? []) insertPeriod(db, period);
    for (const auxiliary of snapshot.auxiliaryAccounts ?? []) insertAuxiliaryAccount(db, auxiliary);
    for (const correction of snapshot.classificationCorrections ?? []) insertCorrection(db, correction);
    for (const batch of snapshot.bankImportBatches ?? []) insertBatch(db, batch);
    for (const batch of snapshot.subscriptionBatches ?? []) insertSubscriptionBatch(db, batch);
    for (const group of snapshot.letteringGroups ?? []) insertLetteringGroup(db, group);
    for (const entry of snapshot.journalEntries ?? []) insertEntry(db, entry);
  });
}

function withTransaction(db, callback) {
  db.exec("BEGIN");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function readCompany(db) {
  const row = db.prepare("SELECT * FROM companies LIMIT 1").get();
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    currency: row.currency,
    fiscalYearStart: row.fiscal_year_start,
    fiscalYearEnd: row.fiscal_year_end
  };
}

function readPeriods(db) {
  return db.prepare(`
    SELECT * FROM accounting_periods
    ORDER BY start_date DESC
  `).all().map(mapPeriod);
}

function readPeriod(db, periodId) {
  const row = db.prepare("SELECT * FROM accounting_periods WHERE id = ?").get(periodId);
  return row ? mapPeriod(row) : null;
}

function ensureCompanyPeriod(db) {
  const company = readCompany(db);
  const count = Number(db.prepare("SELECT COUNT(*) AS count FROM accounting_periods").get().count);
  if (count > 0) return;

  ensurePeriodForCompany(db, company);
}

function ensurePeriodForCompany(db, company) {
  const periodId = `period-${company.fiscalYearStart.slice(0, 4)}`;
  const existing = readPeriod(db, periodId);
  if (existing) {
    db.prepare(`
      UPDATE accounting_periods
      SET name = ?, start_date = ?, end_date = ?, updated_at = ?
      WHERE id = ?
    `).run(
      `Exercice ${company.fiscalYearStart.slice(0, 4)}`,
      company.fiscalYearStart,
      company.fiscalYearEnd,
      new Date().toISOString(),
      periodId
    );
    return;
  }

  insertPeriod(db, {
    id: periodId,
    name: `Exercice ${company.fiscalYearStart.slice(0, 4)}`,
    startDate: company.fiscalYearStart,
    endDate: company.fiscalYearEnd,
    status: "open",
    updatedAt: new Date().toISOString()
  });
}

function validateCompany(company) {
  const errors = [];
  if (company.name.length < 2) errors.push("Le nom de la societe est obligatoire.");
  if (!/^[A-Z]{2,3}$/.test(company.country)) errors.push("Le pays doit etre renseigne avec un code court, ex: CI.");
  if (!/^[A-Z]{3}$/.test(company.currency)) errors.push("La devise doit etre un code a 3 lettres, ex: XOF.");
  if (!isIsoDate(company.fiscalYearStart)) errors.push("La date de debut d'exercice est invalide.");
  if (!isIsoDate(company.fiscalYearEnd)) errors.push("La date de fin d'exercice est invalide.");
  if (isIsoDate(company.fiscalYearStart) && isIsoDate(company.fiscalYearEnd) && company.fiscalYearEnd < company.fiscalYearStart) {
    errors.push("La fin d'exercice doit etre posterieure au debut.");
  }
  return errors;
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function ensureDefaultAuxiliaries(db) {
  const count = Number(db.prepare("SELECT COUNT(*) AS count FROM auxiliary_accounts").get().count);
  if (count > 0) return;

  for (const auxiliary of seed.auxiliaryAccounts) {
    insertAuxiliaryAccount(db, auxiliary);
  }
}

function assertEntriesInOpenPeriods(db, entries) {
  for (const entry of entries) {
    const lockedPeriod = findLockedPeriodForDate(db, entry.date);
    if (lockedPeriod) {
      const error = new Error(`Periode verrouillee: ${lockedPeriod.name}.`);
      error.status = 423;
      throw error;
    }
  }
}

function findLockedPeriodForDate(db, date) {
  return db.prepare(`
    SELECT * FROM accounting_periods
    WHERE status = 'locked' AND ? BETWEEN start_date AND end_date
    LIMIT 1
  `).all(date).map(mapPeriod)[0] ?? null;
}

function readCorrections(db) {
  return db.prepare(`
    SELECT * FROM classification_corrections
    ORDER BY learned_at DESC
  `).all().map((row) => ({
    matchText: row.match_text,
    description: row.description,
    direction: row.direction,
    accountCode: row.account_code,
    counterpartyAccountCode: row.counterparty_account_code,
    reason: row.reason,
    confidence: row.confidence,
    learnedAt: row.learned_at
  }));
}

function readAuxiliaryAccounts(db) {
  return db.prepare(`
    SELECT *
    FROM auxiliary_accounts
    ORDER BY account_code ASC, code ASC
  `).all().map((row) => ({
    code: row.code,
    label: row.label,
    accountCode: row.account_code,
    accountLabel: accountLabel(row.account_code),
    createdAt: row.created_at
  }));
}

function readBatches(db) {
  return db.prepare(`
    SELECT * FROM bank_import_batches
    ORDER BY created_at DESC
  `).all().map(mapBatch);
}

function readBatch(db, batchId) {
  const row = db.prepare("SELECT * FROM bank_import_batches WHERE id = ?").get(batchId);
  return row ? mapBatch(row) : null;
}

function readSubscriptionBatches(db) {
  return db.prepare(`
    SELECT *
    FROM subscription_batches
    ORDER BY created_at DESC
  `).all().map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    frequency: row.frequency,
    entryCount: row.entry_count,
    entryIds: JSON.parse(row.entry_ids_json || "[]"),
    createdAt: row.created_at
  }));
}

function readLetteringGroups(db) {
  return db.prepare(`
    SELECT *
    FROM lettering_groups
    ORDER BY created_at DESC
  `).all().map(mapLetteringGroup);
}

function readLetteringRows(db) {
  const letteringByLineRef = new Map();
  for (const group of readLetteringGroups(db)) {
    for (const ref of group.lineRefs) {
      letteringByLineRef.set(ref, group);
    }
  }

  return db.prepare(`
    SELECT
      journal_lines.*,
      journal_entries.date,
      journal_entries.reference,
      journal_entries.description,
      journal_entries.source,
      journal_entries.created_at,
      auxiliary_accounts.label AS auxiliary_label
    FROM journal_lines
    JOIN journal_entries ON journal_entries.id = journal_lines.entry_id
    LEFT JOIN auxiliary_accounts ON auxiliary_accounts.code = journal_lines.auxiliary_code
    ORDER BY journal_entries.date ASC, journal_entries.reference ASC, journal_lines.line_index ASC
  `).all().map((row) => {
    const lineRef = `${row.entry_id}:${Number(row.line_index) + 1}`;
    const group = letteringByLineRef.get(lineRef);
    return {
      lineRef,
      entryId: row.entry_id,
      lineIndex: Number(row.line_index) + 1,
      date: row.date,
      reference: row.reference || fallbackReference(row),
      source: row.source,
      description: row.description,
      accountCode: row.account_code,
      accountLabel: accountLabel(row.account_code),
      auxiliaryCode: row.auxiliary_code ?? undefined,
      auxiliaryLabel: row.auxiliary_label ?? undefined,
      label: row.label,
      debit: row.debit,
      credit: row.credit,
      letteringCode: group?.code,
      letteringMode: group?.mode,
      letteringCreatedAt: group?.createdAt
    };
  });
}

function buildLetteringState(db, accountCode = "") {
  const requestedAccountCode = String(accountCode || "").trim();
  const rows = readLetteringRows(db).filter((row) => !requestedAccountCode || row.accountCode === requestedAccountCode);
  return {
    rows,
    groups: readLetteringGroups(db).filter((group) => !requestedAccountCode || group.accountCode === requestedAccountCode),
    accountCode: requestedAccountCode || undefined
  };
}

function readEntries(db) {
  return db.prepare(`
    SELECT * FROM journal_entries
    ORDER BY created_at DESC
  `).all().map((row) => readEntryFromRow(db, row));
}

function readEntry(db, entryId) {
  const row = db.prepare("SELECT * FROM journal_entries WHERE id = ?").get(entryId);
  return row ? readEntryFromRow(db, row) : null;
}

function readEntryFromRow(db, row) {
  const lines = db.prepare(`
    SELECT * FROM journal_lines
    WHERE entry_id = ?
    ORDER BY line_index ASC
  `).all(row.id);

  return {
    id: row.id,
    date: row.date,
    reference: row.reference || fallbackReference(row),
    description: row.description,
    source: row.source,
    batchId: row.batch_id ?? undefined,
    bankFingerprint: row.bank_fingerprint ?? undefined,
    createdAt: row.created_at,
    lines: lines.map((line) => ({
      accountCode: line.account_code,
      auxiliaryCode: line.auxiliary_code ?? undefined,
      label: line.label,
      debit: line.debit,
      credit: line.credit
    }))
  };
}

function insertCompany(db, company) {
  db.prepare(`
    INSERT OR REPLACE INTO companies
    (id, name, country, currency, fiscal_year_start, fiscal_year_end)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    company.id,
    company.name,
    company.country,
    company.currency,
    company.fiscalYearStart,
    company.fiscalYearEnd
  );
}

function insertPeriod(db, period) {
  db.prepare(`
    INSERT OR REPLACE INTO accounting_periods
    (id, name, start_date, end_date, status, locked_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    period.id,
    period.name,
    period.startDate,
    period.endDate,
    period.status,
    period.lockedAt ?? null,
    period.updatedAt ?? new Date().toISOString()
  );
}

function insertEntry(db, entry) {
  db.prepare(`
    INSERT OR REPLACE INTO journal_entries
    (id, date, reference, description, source, batch_id, bank_fingerprint, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id,
    entry.date,
    entry.reference ?? fallbackReference(entry),
    entry.description,
    entry.source,
    entry.batchId ?? null,
    entry.bankFingerprint ?? null,
    entry.createdAt
  );

  db.prepare("DELETE FROM journal_lines WHERE entry_id = ?").run(entry.id);
  const statement = db.prepare(`
    INSERT INTO journal_lines
    (entry_id, line_index, account_code, auxiliary_code, label, debit, credit)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  entry.lines.forEach((line, index) => {
    statement.run(entry.id, index, line.accountCode, line.auxiliaryCode ?? null, line.label, line.debit, line.credit);
  });
}

function insertAuxiliaryAccount(db, auxiliary) {
  db.prepare(`
    INSERT OR REPLACE INTO auxiliary_accounts
    (code, label, account_code, created_at)
    VALUES (?, ?, ?, ?)
  `).run(
    auxiliary.code,
    auxiliary.label,
    auxiliary.accountCode,
    auxiliary.createdAt ?? new Date().toISOString()
  );
}

function insertBatch(db, batch) {
  db.prepare(`
    INSERT OR REPLACE INTO bank_import_batches
    (id, created_at, source, status, transaction_count, imported_count, duplicate_count, learned_count, entry_ids_json, voided_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    batch.id,
    batch.createdAt,
    batch.source,
    batch.status,
    batch.transactionCount,
    batch.importedCount,
    batch.duplicateCount,
    batch.learnedCount,
    JSON.stringify(batch.entryIds ?? []),
    batch.voidedAt ?? null,
    batch.updatedAt ?? null
  );
}

function insertSubscriptionBatch(db, batch) {
  db.prepare(`
    INSERT OR REPLACE INTO subscription_batches
    (id, name, description, start_date, end_date, frequency, entry_count, entry_ids_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    batch.id,
    batch.name,
    batch.description,
    batch.startDate,
    batch.endDate,
    batch.frequency ?? "monthly",
    batch.entryCount ?? batch.entryIds?.length ?? 0,
    JSON.stringify(batch.entryIds ?? []),
    batch.createdAt ?? new Date().toISOString()
  );
}

function insertLetteringGroup(db, group) {
  db.prepare(`
    INSERT OR REPLACE INTO lettering_groups
    (id, code, account_code, line_refs_json, mode, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    group.id,
    group.code,
    group.accountCode,
    JSON.stringify(group.lineRefs ?? []),
    group.mode,
    group.createdAt ?? new Date().toISOString()
  );
}

function createLetteringGroup(db, accountCode, lineRefs, mode) {
  const group = {
    id: crypto.randomUUID(),
    code: nextLetteringCode(db),
    accountCode,
    lineRefs,
    mode,
    createdAt: new Date().toISOString()
  };
  insertLetteringGroup(db, group);
  return group;
}

function insertCorrection(db, correction) {
  db.prepare(`
    INSERT OR REPLACE INTO classification_corrections
    (match_text, description, direction, account_code, counterparty_account_code, reason, confidence, learned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    correction.matchText,
    correction.description,
    correction.direction,
    correction.accountCode,
    correction.counterpartyAccountCode,
    correction.reason,
    correction.confidence,
    correction.learnedAt
  );
}

function mapBatch(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    source: row.source,
    status: row.status,
    transactionCount: row.transaction_count,
    importedCount: row.imported_count,
    duplicateCount: row.duplicate_count,
    learnedCount: row.learned_count,
    entryIds: JSON.parse(row.entry_ids_json || "[]"),
    voidedAt: row.voided_at ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}

function mapPeriod(row) {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    lockedAt: row.locked_at ?? undefined,
    updatedAt: row.updated_at
  };
}

function mapLetteringGroup(row) {
  return {
    id: row.id,
    code: row.code,
    accountCode: row.account_code,
    accountLabel: accountLabel(row.account_code),
    lineRefs: JSON.parse(row.line_refs_json || "[]"),
    mode: row.mode,
    createdAt: row.created_at
  };
}

function nextLetteringCode(db) {
  const count = Number(db.prepare("SELECT COUNT(*) AS count FROM lettering_groups").get().count);
  return `LET-${String(count + 1).padStart(4, "0")}`;
}

function sumLetteringRows(rows) {
  return rows.reduce((totals, row) => ({
    debit: roundMoney(totals.debit + Number(row.debit || 0)),
    credit: roundMoney(totals.credit + Number(row.credit || 0))
  }), { debit: 0, credit: 0 });
}

function groupRowsByAccount(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.accountCode)) groups.set(row.accountCode, []);
    groups.get(row.accountCode).push(row);
  }
  return groups;
}

function matchLetteringPairs(rows) {
  const debits = rows.filter((row) => row.debit > 0 && row.credit === 0).sort(compareLetteringRows);
  const creditsByAmount = new Map();
  for (const row of rows.filter((candidate) => candidate.credit > 0 && candidate.debit === 0).sort(compareLetteringRows)) {
    const key = amountKey(row.credit);
    if (!creditsByAmount.has(key)) creditsByAmount.set(key, []);
    creditsByAmount.get(key).push(row);
  }

  const matches = [];
  for (const debitRow of debits) {
    const credits = creditsByAmount.get(amountKey(debitRow.debit)) ?? [];
    const creditRow = credits.shift();
    if (creditRow) matches.push([debitRow, creditRow]);
  }
  return matches;
}

function compareLetteringRows(left, right) {
  return `${left.date}|${left.reference}|${left.lineIndex}`.localeCompare(`${right.date}|${right.reference}|${right.lineIndex}`);
}

function amountKey(amount) {
  return String(roundMoney(Number(amount || 0)));
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function addColumnIfMissing(db, table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function backfillEntryReferences(db) {
  const rows = db.prepare("SELECT id, date, source, reference FROM journal_entries WHERE reference IS NULL OR reference = ''").all();
  const statement = db.prepare("UPDATE journal_entries SET reference = ? WHERE id = ?");
  for (const [index, row] of rows.entries()) {
    statement.run(fallbackReference(row, index + 1), row.id);
  }
}

function migrateLegacyAccountCodes(db) {
  const legacyMap = new Map([
    ["101", "1013"],
    ["401", "4011"],
    ["411", "4111"],
    ["512", "5211"],
    ["601", "6011"],
    ["622", "6222"],
    ["631", "6318"],
    ["661", "6611"],
    ["701", "7011"],
    ["706", "7061"]
  ]);

  for (const [legacyCode, postableCode] of legacyMap) {
    db.prepare("UPDATE journal_lines SET account_code = ? WHERE account_code = ?").run(postableCode, legacyCode);
    db.prepare("UPDATE auxiliary_accounts SET account_code = ? WHERE account_code = ?").run(postableCode, legacyCode);
    db.prepare("UPDATE classification_corrections SET account_code = ? WHERE account_code = ?").run(postableCode, legacyCode);
    db.prepare("UPDATE classification_corrections SET counterparty_account_code = ? WHERE counterparty_account_code = ?").run(postableCode, legacyCode);
  }
}

function fallbackReference(row, offset = 1) {
  const prefix = {
    "bank-csv": "BAN",
    subscription: "ABN",
    seed: "INIT",
    manual: "MAN"
  }[row.source] ?? "ECR";
  const datePart = String(row.date || "0000-00-00").replaceAll("-", "");
  return `${prefix}-${datePart}-${String(offset).padStart(3, "0")}`;
}

function accountLabel(accountCode) {
  return accountByCode.get(accountCode)?.label ?? "";
}
