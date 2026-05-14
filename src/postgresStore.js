import { buildAccountCatalog, enrichAccount } from "./ohadaChart.js";
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

async function readAllJournals(organizationId = defaultOrganizationId) {
  return (await pg().many(`
    SELECT *
    FROM journals
    WHERE organization_id = ?
    ORDER BY code ASC
  `, [organizationId])).map(mapJournal);
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
