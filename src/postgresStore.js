import { accountByCode, buildAccountCatalog, enrichAccount } from "./ohadaChart.js";
import { createPostgresRuntime } from "./postgresRuntime.js";
import { createSessionToken, hashToken, publicUser, verifyPassword } from "./security.js";

const defaultOrganizationId = "demo-company";
let runtime;

function pg() {
  runtime ??= createPostgresRuntime();
  return runtime;
}

export async function readDb(organizationId = defaultOrganizationId) {
  return readSnapshot(organizationId);
}

export async function loginUser(input, sessionTtlHours) {
  const email = normalizeEmail(input.email);
  const password = String(input.password || "");
  const user = await readUserByEmail(email);

  if (!user || user.status !== "active" || !verifyPassword(password, user.passwordHash)) {
    return { ok: false, status: 401, error: "Identifiants invalides." };
  }

  const token = createSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * sessionTtlHours).toISOString();
  await pg().run(`
    INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `, [hashToken(token), user.id, now.toISOString(), expiresAt]);

  return {
    ok: true,
    token,
    user: publicUser(user),
    organization: await readOrganization(user.organizationId),
    expiresAt
  };
}

export async function logoutUser(token) {
  await pg().run("DELETE FROM auth_sessions WHERE token_hash = ?", [hashToken(token)]);
  return { ok: true };
}

export async function readAuthContext(token) {
  if (!token) return null;
  const row = await pg().one(`
    SELECT users.*
    FROM auth_sessions
    JOIN users ON users.id = auth_sessions.user_id
    WHERE auth_sessions.token_hash = ? AND auth_sessions.expires_at > ?
    LIMIT 1
  `, [hashToken(token), new Date().toISOString()]);
  if (!row) return null;

  const user = mapUser(row);
  return {
    user: publicUser(user),
    organization: await readOrganization(user.organizationId)
  };
}

export async function readOrganizations() {
  return readAllOrganizations();
}

export async function readUsers(organizationId = defaultOrganizationId) {
  return (await readAllUsers(organizationId)).map(publicUser);
}

export async function readAccounts(organizationId = defaultOrganizationId) {
  return accountCatalog(organizationId);
}

export async function readJournals(organizationId = defaultOrganizationId) {
  return readAllJournals(organizationId);
}

export async function addCustomAccount(input) {
  const organizationId = input.organizationId ?? defaultOrganizationId;
  const account = enrichAccount({
    code: String(input.code || "").trim(),
    label: String(input.label || "").trim(),
    type: String(input.type || "").trim(),
    source: "custom"
  });
  const errors = await validateCustomAccount(account, organizationId);
  if (errors.length > 0) return { ok: false, status: 422, errors };

  await pg().transaction(async (tx) => {
    await insertCustomAccount(tx, { ...account, organizationId, createdAt: new Date().toISOString() });
    await insertAuditEvent(tx, {
      organizationId,
      action: "account.create",
      entityType: "account",
      entityId: account.code,
      summary: `Compte cree: ${account.code} - ${account.label}`,
      details: account
    });
  });

  return { ok: true, account: (await accountCatalog(organizationId)).find((candidate) => candidate.code === account.code) };
}

export async function addJournal(input) {
  const organizationId = input.organizationId ?? defaultOrganizationId;
  const journal = {
    code: String(input.code || "").trim().toUpperCase(),
    organizationId,
    label: String(input.label || "").trim(),
    type: normalizeJournalType(input.type),
    status: "active",
    createdAt: new Date().toISOString()
  };
  const errors = await validateJournal(journal);
  if (errors.length > 0) return { ok: false, status: 422, errors };

  await pg().transaction(async (tx) => {
    await insertJournal(tx, journal);
    await insertAuditEvent(tx, {
      organizationId,
      action: "journal.create_ref",
      entityType: "journal",
      entityId: journal.code,
      summary: `Journal cree: ${journal.code} - ${journal.label}`,
      details: journal
    });
  });

  return { ok: true, journal };
}

export async function updateCompany(input) {
  const organizationId = input.organizationId ?? defaultOrganizationId;
  const current = await readCompany(organizationId);
  if (!current) return { ok: false, status: 404, error: "Societe introuvable." };

  const company = {
    ...current,
    name: String(input.name || "").trim(),
    country: String(input.country || "").trim().toUpperCase(),
    currency: String(input.currency || "").trim().toUpperCase(),
    fiscalYearStart: String(input.fiscalYearStart || "").trim(),
    fiscalYearEnd: String(input.fiscalYearEnd || "").trim()
  };
  const errors = validateCompany(company);
  if (errors.length > 0) return { ok: false, status: 422, errors };

  await pg().transaction(async (tx) => {
    await insertCompany(tx, company);
    await ensurePeriodForCompany(tx, company);
    await insertAuditEvent(tx, {
      organizationId,
      action: "company.update",
      entityType: "company",
      entityId: company.id,
      summary: `Parametres entreprise mis a jour: ${company.name}`,
      details: company
    });
  });

  return { ok: true, company: await readCompany(organizationId), accountingPeriods: await readPeriods(organizationId) };
}

export async function addAuxiliaryAccount(input) {
  const code = String(input.code || "").trim().toUpperCase();
  const label = String(input.label || "").trim();
  const accountCode = String(input.accountCode || "").trim();
  const organizationId = input.organizationId ?? defaultOrganizationId;

  if (!code || code.length < 2) return { ok: false, status: 422, error: "Le code auxiliaire est obligatoire." };
  if (!label || label.length < 2) return { ok: false, status: 422, error: "Le libelle auxiliaire est obligatoire." };
  if (!accountCode) return { ok: false, status: 422, error: "Le compte collectif est obligatoire." };
  if (!(await accountCatalog(organizationId)).some((account) => account.code === accountCode && account.isPostable)) {
    return { ok: false, status: 422, error: "Le compte collectif doit etre un compte OHADA a 4 chiffres." };
  }

  const auxiliary = { code, organizationId, label, accountCode, createdAt: new Date().toISOString() };
  await pg().transaction(async (tx) => {
    await insertAuxiliaryAccount(tx, auxiliary);
    await insertAuditEvent(tx, {
      organizationId,
      action: "auxiliary.create",
      entityType: "auxiliary_account",
      entityId: auxiliary.code,
      summary: `Auxiliaire cree: ${auxiliary.code} - ${auxiliary.label}`,
      details: auxiliary
    });
  });
  return { ok: true, auxiliary };
}

export async function addAccountingPeriod(input = {}) {
  const organizationId = input.organizationId ?? defaultOrganizationId;
  const period = { ...(await buildAccountingPeriod(input)), organizationId };
  const errors = await validatePeriod(period);
  if (errors.length > 0) return { ok: false, status: 422, errors };

  await pg().transaction(async (tx) => {
    await insertPeriod(tx, period);
    await insertAuditEvent(tx, {
      organizationId,
      action: "period.create",
      entityType: "accounting_period",
      entityId: period.id,
      summary: `Exercice cree: ${period.name}`,
      details: period
    });
  });
  return { ok: true, period };
}

export async function setAccountingPeriodStatus(periodId, status, organizationId = defaultOrganizationId) {
  const period = await readPeriod(periodId, organizationId);
  if (!period) return { ok: false, error: "Exercice introuvable." };

  const timestamp = new Date().toISOString();
  await pg().transaction(async (tx) => {
    await tx.run(`
      UPDATE accounting_periods
      SET status = ?, locked_at = ?, updated_at = ?
      WHERE id = ? AND organization_id = ?
    `, [status, status === "locked" ? timestamp : null, timestamp, periodId, organizationId]);
    await insertAuditEvent(tx, {
      organizationId,
      action: status === "locked" ? "period.lock" : "period.unlock",
      entityType: "accounting_period",
      entityId: periodId,
      summary: `${status === "locked" ? "Exercice verrouille" : "Exercice rouvert"}: ${period.name}`,
      details: { before: period, after: await readPeriodWithRuntime(tx, periodId, organizationId) }
    });
  });

  return { ok: true, period: await readPeriod(periodId, organizationId) };
}

async function readSnapshot(organizationId = defaultOrganizationId) {
  const [
    company,
    organizations,
    users,
    jobs,
    storedFiles,
    accountingPeriods,
    accounts,
    auxiliaryAccounts,
    customAccounts,
    journals,
    classificationCorrections,
    bankImportBatches,
    subscriptionBatches,
    letteringGroups,
    auditEvents,
    journalEntries
  ] = await Promise.all([
    readCompany(organizationId),
    readAllOrganizations(),
    readAllUsers(organizationId).then((rows) => rows.map(publicUser)),
    readJobs(organizationId),
    readStoredFiles(organizationId),
    readPeriods(organizationId),
    accountCatalog(organizationId),
    readAuxiliaryAccounts(organizationId),
    readCustomAccounts(organizationId),
    readAllJournals(organizationId),
    readCorrections(organizationId),
    readBatches(organizationId),
    readSubscriptionBatches(organizationId),
    readLetteringGroups(organizationId),
    readAuditEvents(organizationId),
    readEntries(organizationId)
  ]);

  return {
    company,
    organizations,
    users,
    jobs,
    storedFiles,
    accountingPeriods,
    accounts,
    auxiliaryAccounts,
    customAccounts,
    journals,
    classificationCorrections,
    bankImportBatches,
    subscriptionBatches,
    letteringGroups,
    auditEvents,
    journalEntries
  };
}

async function readCompany(organizationId = defaultOrganizationId) {
  const row = await pg().one("SELECT * FROM companies WHERE organization_id = ? LIMIT 1", [organizationId])
    ?? await pg().one("SELECT * FROM companies LIMIT 1");
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id ?? row.id,
    name: row.name,
    country: row.country,
    currency: row.currency,
    fiscalYearStart: dateOnly(row.fiscal_year_start),
    fiscalYearEnd: dateOnly(row.fiscal_year_end)
  };
}

async function readPeriod(periodId, organizationId = defaultOrganizationId) {
  return readPeriodWithRuntime(pg(), periodId, organizationId);
}

async function readPeriodWithRuntime(database, periodId, organizationId = defaultOrganizationId) {
  const row = await database.one("SELECT * FROM accounting_periods WHERE id = ? AND organization_id = ?", [periodId, organizationId]);
  return row ? mapPeriod(row) : null;
}

async function readAllOrganizations() {
  return (await pg().many(`
    SELECT *
    FROM organizations
    ORDER BY created_at ASC
  `)).map(mapOrganization);
}

async function readOrganization(organizationId) {
  const row = await pg().one("SELECT * FROM organizations WHERE id = ?", [organizationId]);
  return row ? mapOrganization(row) : null;
}

async function readAllUsers(organizationId = null) {
  if (organizationId) {
    return (await pg().many(`
      SELECT *
      FROM users
      WHERE organization_id = ?
      ORDER BY created_at ASC
    `, [organizationId])).map(mapUser);
  }
  return (await pg().many(`
    SELECT *
    FROM users
    ORDER BY created_at ASC
  `)).map(mapUser);
}

async function readUserByEmail(email) {
  const row = await pg().one("SELECT * FROM users WHERE email = ?", [email]);
  return row ? mapUser(row) : null;
}

export async function readJobs(organizationId = defaultOrganizationId) {
  return (await pg().many(`
    SELECT *
    FROM jobs
    WHERE organization_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `, [organizationId])).map(mapJob);
}

export async function readStoredFiles(organizationId = defaultOrganizationId) {
  return (await pg().many(`
    SELECT *
    FROM stored_files
    WHERE organization_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `, [organizationId])).map(mapStoredFile);
}

async function readPeriods(organizationId = defaultOrganizationId) {
  return (await pg().many(`
    SELECT *
    FROM accounting_periods
    WHERE organization_id = ?
    ORDER BY start_date ASC
  `, [organizationId])).map(mapPeriod);
}

async function accountCatalog(organizationId = defaultOrganizationId) {
  return buildAccountCatalog(await readCustomAccounts(organizationId));
}

async function readCustomAccounts(organizationId = defaultOrganizationId) {
  return (await pg().many(`
    SELECT *
    FROM custom_accounts
    WHERE organization_id = ?
    ORDER BY code ASC
  `, [organizationId])).map(mapCustomAccount);
}

async function readCustomAccount(code, organizationId = defaultOrganizationId) {
  const row = await pg().one("SELECT * FROM custom_accounts WHERE code = ? AND organization_id = ?", [code, organizationId]);
  return row ? mapCustomAccount(row) : null;
}

async function readAllJournals(organizationId = defaultOrganizationId) {
  return (await pg().many(`
    SELECT *
    FROM journals
    WHERE organization_id = ?
    ORDER BY code ASC
  `, [organizationId])).map(mapJournal);
}

async function readJournal(code, organizationId = defaultOrganizationId) {
  const row = await pg().one("SELECT * FROM journals WHERE code = ? AND organization_id = ?", [code, organizationId]);
  return row ? mapJournal(row) : null;
}

async function readAuxiliaryAccounts(organizationId = defaultOrganizationId) {
  const accountsByCode = new Map((await accountCatalog(organizationId)).map((account) => [account.code, account]));
  return (await pg().many(`
    SELECT *
    FROM auxiliary_accounts
    WHERE organization_id = ?
    ORDER BY account_code ASC, code ASC
  `, [organizationId])).map((row) => ({
    code: row.code,
    organizationId: row.organization_id ?? defaultOrganizationId,
    label: row.label,
    accountCode: row.account_code,
    accountLabel: accountsByCode.get(row.account_code)?.label ?? accountLabel(row.account_code),
    createdAt: isoDateTime(row.created_at)
  }));
}

async function readCorrections(organizationId = defaultOrganizationId) {
  return (await pg().many(`
    SELECT *
    FROM classification_corrections
    WHERE organization_id = ?
    ORDER BY learned_at DESC
  `, [organizationId])).map((row) => ({
    organizationId: row.organization_id ?? defaultOrganizationId,
    matchText: row.match_text,
    description: row.description,
    direction: row.direction,
    accountCode: row.account_code,
    counterpartyAccountCode: row.counterparty_account_code,
    reason: row.reason,
    confidence: Number(row.confidence),
    learnedAt: isoDateTime(row.learned_at)
  }));
}

async function readBatches(organizationId = defaultOrganizationId) {
  return (await pg().many(`
    SELECT *
    FROM bank_import_batches
    WHERE organization_id = ?
    ORDER BY created_at DESC
  `, [organizationId])).map(mapBatch);
}

async function readSubscriptionBatches(organizationId = defaultOrganizationId) {
  return (await pg().many(`
    SELECT *
    FROM subscription_batches
    WHERE organization_id = ?
    ORDER BY created_at DESC
  `, [organizationId])).map((row) => ({
    id: row.id,
    organizationId: row.organization_id ?? defaultOrganizationId,
    name: row.name,
    description: row.description,
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    frequency: row.frequency,
    entryCount: Number(row.entry_count),
    entryIds: parseJson(row.entry_ids_json, []),
    createdAt: isoDateTime(row.created_at)
  }));
}

async function readLetteringGroups(organizationId = defaultOrganizationId) {
  return (await pg().many(`
    SELECT *
    FROM lettering_groups
    WHERE organization_id = ?
    ORDER BY created_at DESC
  `, [organizationId])).map(mapLetteringGroup);
}

async function readAuditEvents(organizationId = defaultOrganizationId) {
  return (await pg().many(`
    SELECT *
    FROM audit_events
    WHERE organization_id = ?
    ORDER BY created_at DESC
    LIMIT 250
  `, [organizationId])).map((row) => ({
    id: row.id,
    actor: row.actor,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    details: parseJson(row.details_json, {}),
    createdAt: isoDateTime(row.created_at)
  }));
}

async function readEntries(organizationId = defaultOrganizationId) {
  const rows = await pg().many(`
    SELECT *
    FROM journal_entries
    WHERE organization_id = ?
    ORDER BY created_at DESC
  `, [organizationId]);
  const entries = [];
  for (const row of rows) entries.push(await readEntryFromRow(row));
  return entries;
}

async function readEntryFromRow(row) {
  const lines = await pg().many(`
    SELECT *
    FROM journal_lines
    WHERE entry_id = ?
    ORDER BY line_index ASC
  `, [row.id]);

  return {
    id: row.id,
    organizationId: row.organization_id ?? defaultOrganizationId,
    date: dateOnly(row.date),
    reference: row.reference || fallbackReference(row),
    description: row.description,
    source: row.source,
    batchId: row.batch_id ?? undefined,
    bankFingerprint: row.bank_fingerprint ?? undefined,
    createdAt: isoDateTime(row.created_at),
    lines: lines.map((line) => ({
      accountCode: line.account_code,
      auxiliaryCode: line.auxiliary_code ?? undefined,
      label: line.label,
      debit: Number(line.debit),
      credit: Number(line.credit)
    }))
  };
}

function mapBatch(row) {
  return {
    id: row.id,
    organizationId: row.organization_id ?? defaultOrganizationId,
    createdAt: isoDateTime(row.created_at),
    source: row.source,
    status: row.status,
    transactionCount: Number(row.transaction_count),
    importedCount: Number(row.imported_count),
    duplicateCount: Number(row.duplicate_count),
    learnedCount: Number(row.learned_count),
    entryIds: parseJson(row.entry_ids_json, []),
    voidedAt: row.voided_at ? isoDateTime(row.voided_at) : undefined,
    updatedAt: row.updated_at ? isoDateTime(row.updated_at) : undefined
  };
}

function mapOrganization(row) {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    currency: row.currency,
    createdAt: isoDateTime(row.created_at)
  };
}

function mapUser(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    role: row.role,
    status: row.status,
    createdAt: isoDateTime(row.created_at)
  };
}

function mapJob(row) {
  return {
    id: row.id,
    organizationId: row.organization_id ?? defaultOrganizationId,
    type: row.type,
    status: row.status,
    payload: parseJson(row.payload_json, {}),
    result: row.result_json ? parseJson(row.result_json, null) : null,
    error: row.error ?? undefined,
    createdAt: isoDateTime(row.created_at),
    updatedAt: isoDateTime(row.updated_at),
    startedAt: row.started_at ? isoDateTime(row.started_at) : undefined,
    finishedAt: row.finished_at ? isoDateTime(row.finished_at) : undefined
  };
}

function mapStoredFile(row) {
  return {
    id: row.id,
    organizationId: row.organization_id ?? defaultOrganizationId,
    name: row.name,
    path: row.path,
    mimeType: row.mime_type,
    size: Number(row.size),
    createdAt: isoDateTime(row.created_at)
  };
}

function mapCustomAccount(row) {
  return enrichAccount({
    code: row.code,
    organizationId: row.organization_id ?? defaultOrganizationId,
    label: row.label,
    type: row.type,
    source: "custom",
    createdAt: isoDateTime(row.created_at)
  });
}

function mapJournal(row) {
  return {
    code: row.code,
    organizationId: row.organization_id ?? defaultOrganizationId,
    label: row.label,
    type: row.type,
    status: row.status,
    createdAt: isoDateTime(row.created_at)
  };
}

function mapPeriod(row) {
  return {
    id: row.id,
    organizationId: row.organization_id ?? defaultOrganizationId,
    name: row.name,
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    status: row.status,
    lockedAt: row.locked_at ? isoDateTime(row.locked_at) : undefined,
    updatedAt: isoDateTime(row.updated_at)
  };
}

function mapLetteringGroup(row) {
  return {
    id: row.id,
    organizationId: row.organization_id ?? defaultOrganizationId,
    code: row.code,
    accountCode: row.account_code,
    accountLabel: accountLabel(row.account_code),
    lineRefs: parseJson(row.line_refs_json, []),
    mode: row.mode,
    createdAt: isoDateTime(row.created_at)
  };
}

async function insertCompany(database, company) {
  await database.run(`
    INSERT INTO companies
    (id, organization_id, name, country, currency, fiscal_year_start, fiscal_year_end)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      name = EXCLUDED.name,
      country = EXCLUDED.country,
      currency = EXCLUDED.currency,
      fiscal_year_start = EXCLUDED.fiscal_year_start,
      fiscal_year_end = EXCLUDED.fiscal_year_end
  `, [
    company.id,
    company.organizationId ?? company.id ?? defaultOrganizationId,
    company.name,
    company.country,
    company.currency,
    company.fiscalYearStart,
    company.fiscalYearEnd
  ]);
}

async function insertPeriod(database, period) {
  await database.run(`
    INSERT INTO accounting_periods
    (id, organization_id, name, start_date, end_date, status, locked_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      name = EXCLUDED.name,
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      status = EXCLUDED.status,
      locked_at = EXCLUDED.locked_at,
      updated_at = EXCLUDED.updated_at
  `, [
    period.id,
    period.organizationId ?? defaultOrganizationId,
    period.name,
    period.startDate,
    period.endDate,
    period.status,
    period.lockedAt ?? null,
    period.updatedAt ?? new Date().toISOString()
  ]);
}

async function insertAuxiliaryAccount(database, auxiliary) {
  await database.run(`
    INSERT INTO auxiliary_accounts
    (code, organization_id, label, account_code, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (code) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      label = EXCLUDED.label,
      account_code = EXCLUDED.account_code,
      created_at = EXCLUDED.created_at
  `, [
    auxiliary.code,
    auxiliary.organizationId ?? defaultOrganizationId,
    auxiliary.label,
    auxiliary.accountCode,
    auxiliary.createdAt ?? new Date().toISOString()
  ]);
}

async function insertCustomAccount(database, account) {
  await database.run(`
    INSERT INTO custom_accounts
    (code, organization_id, label, type, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (organization_id, code) DO UPDATE SET
      label = EXCLUDED.label,
      type = EXCLUDED.type,
      created_at = EXCLUDED.created_at
  `, [
    account.code,
    account.organizationId ?? defaultOrganizationId,
    account.label,
    account.type,
    account.createdAt ?? new Date().toISOString()
  ]);
}

async function insertJournal(database, journal) {
  await database.run(`
    INSERT INTO journals
    (code, organization_id, label, type, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (organization_id, code) DO UPDATE SET
      label = EXCLUDED.label,
      type = EXCLUDED.type,
      status = EXCLUDED.status,
      created_at = EXCLUDED.created_at
  `, [
    journal.code,
    journal.organizationId ?? defaultOrganizationId,
    journal.label,
    journal.type,
    journal.status ?? "active",
    journal.createdAt ?? new Date().toISOString()
  ]);
}

async function insertAuditEvent(database, event) {
  await database.run(`
    INSERT INTO audit_events
    (id, organization_id, actor, action, entity_type, entity_id, summary, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    event.id ?? crypto.randomUUID(),
    event.organizationId ?? defaultOrganizationId,
    event.actor ?? "system",
    event.action,
    event.entityType,
    event.entityId,
    event.summary,
    JSON.stringify(event.details ?? {}),
    event.createdAt ?? new Date().toISOString()
  ]);
}

async function ensurePeriodForCompany(database, company) {
  const periodId = periodIdForCompany(company);
  const organizationId = company.organizationId ?? company.id ?? defaultOrganizationId;
  const existing = await readPeriodWithRuntime(database, periodId, organizationId);
  const period = {
    id: periodId,
    organizationId,
    name: `Exercice ${company.fiscalYearStart.slice(0, 4)}`,
    startDate: company.fiscalYearStart,
    endDate: company.fiscalYearEnd,
    status: existing?.status ?? "open",
    lockedAt: existing?.lockedAt,
    updatedAt: new Date().toISOString()
  };
  await insertPeriod(database, period);
}

async function buildAccountingPeriod(input) {
  const organizationId = input.organizationId ?? defaultOrganizationId;
  const latest = await pg().one(`
    SELECT *
    FROM accounting_periods
    WHERE organization_id = ?
    ORDER BY end_date DESC
    LIMIT 1
  `, [organizationId]);
  const nextRange = latest ? nextPeriodRange(mapPeriod(latest)) : nextPeriodRange(await readCompany(organizationId));
  const startDate = String(input.startDate || nextRange.startDate).trim();
  const endDate = String(input.endDate || nextRange.endDate).trim();
  const year = startDate.slice(0, 4);

  return {
    id: String(input.id || periodIdForCompany({ organizationId, fiscalYearStart: startDate })).trim(),
    name: String(input.name || `Exercice ${year}`).trim(),
    startDate,
    endDate,
    status: "open",
    updatedAt: new Date().toISOString()
  };
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

async function validatePeriod(period) {
  const errors = [];
  if (!period.name || period.name.length < 3) errors.push("Le nom de l'exercice est obligatoire.");
  if (!isIsoDate(period.startDate)) errors.push("La date de debut d'exercice est invalide.");
  if (!isIsoDate(period.endDate)) errors.push("La date de fin d'exercice est invalide.");
  if (isIsoDate(period.startDate) && isIsoDate(period.endDate) && period.endDate < period.startDate) {
    errors.push("La fin d'exercice doit etre posterieure au debut.");
  }

  if (await readPeriod(period.id, period.organizationId)) errors.push("Un exercice avec cet identifiant existe deja.");

  if (errors.length === 0) {
    const overlap = await pg().one(`
      SELECT *
      FROM accounting_periods
      WHERE organization_id = ? AND NOT (end_date < ? OR start_date > ?)
      LIMIT 1
    `, [period.organizationId ?? defaultOrganizationId, period.startDate, period.endDate]);
    if (overlap) errors.push(`La periode chevauche ${overlap.name}.`);
  }

  return errors;
}

async function validateCustomAccount(account, organizationId) {
  const errors = [];
  if (!/^\d{4}$/.test(account.code)) errors.push("Le compte doit contenir exactement 4 chiffres.");
  if (account.label.length < 2) errors.push("Le libelle du compte est obligatoire.");
  if (!["asset", "liability", "equity", "expense", "revenue"].includes(account.type)) errors.push("Le type du compte est invalide.");
  if (accountByCode.has(account.code)) errors.push("Ce compte existe deja dans le plan SYSCOHADA.");
  if (await readCustomAccount(account.code, organizationId)) errors.push("Ce compte existe deja dans ce dossier.");
  return errors;
}

async function validateJournal(journal) {
  const errors = [];
  if (!/^[A-Z0-9]{2,8}$/.test(journal.code)) errors.push("Le code journal doit contenir 2 a 8 caracteres alphanumeriques.");
  if (journal.label.length < 2) errors.push("Le libelle du journal est obligatoire.");
  if (!["misc", "bank", "cash", "sales", "purchase", "payroll", "closing"].includes(journal.type)) errors.push("Le type du journal est invalide.");
  if (await readJournal(journal.code, journal.organizationId)) errors.push("Ce journal existe deja dans ce dossier.");
  return errors;
}

function normalizeJournalType(type) {
  return ["misc", "bank", "cash", "sales", "purchase", "payroll", "closing"].includes(type) ? type : "misc";
}

function periodIdForCompany(company) {
  const year = company.fiscalYearStart.slice(0, 4);
  return company.organizationId === defaultOrganizationId ? `period-${year}` : `period-${company.organizationId}-${year}`;
}

function nextPeriodRange(period) {
  const start = addDays(period.endDate ?? period.fiscalYearEnd, 1);
  const end = addDays(addYears(start, 1), -1);
  return { startDate: start, endDate: end };
}

function addYears(date, years) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCFullYear(value.getUTCFullYear() + years);
  return value.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

function isoDateTime(value) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || "").slice(0, 10);
}

function accountLabel(code) {
  return buildAccountCatalog().find((account) => account.code === code)?.label ?? code;
}

function fallbackReference(row) {
  return [
    dateOnly(row.date).replaceAll("-", ""),
    row.source || "OD",
    String(row.id || "").slice(0, 8)
  ].filter(Boolean).join("-");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}
