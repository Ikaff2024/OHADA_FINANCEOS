import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeJournalEntry } from "./accounting.js";
import { accountByCode, buildAccountCatalog, enrichAccount } from "./ohadaChart.js";
import { config, rootDir } from "./config.js";
import * as postgresStore from "./postgresStore.js";
import { createSessionToken, hashPassword, hashToken, publicUser, verifyPassword } from "./security.js";
import { sendInvitationEmail, sendPasswordResetEmail } from "./mailer.js";

const legacyJsonPath = join(rootDir, "data", "db.json");
const storageDir = config.storageDir;
const dbPath = config.sqlitePath;
const defaultOrganizationId = "demo-company";

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
  customAccounts: [],
  journals: [
    { code: "OD", label: "Operations diverses", type: "misc", status: "active", createdAt: "2026-05-09T15:14:25.084Z" },
    { code: "BQ", label: "Banque", type: "bank", status: "active", createdAt: "2026-05-09T15:14:25.084Z" },
    { code: "VT", label: "Ventes", type: "sales", status: "active", createdAt: "2026-05-09T15:14:25.084Z" },
    { code: "AC", label: "Achats", type: "purchase", status: "active", createdAt: "2026-05-09T15:14:25.084Z" }
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

function usePostgresRuntime() {
  return config.runtimeDatabase === "postgres";
}

export async function readDb(organizationId = defaultOrganizationId) {
  if (usePostgresRuntime()) return postgresStore.readDb(organizationId);
  const db = await getDatabase();
  return readSnapshot(db, organizationId);
}

export async function loginUser(input) {
  if (usePostgresRuntime()) return postgresStore.loginUser(input, config.sessionTtlHours);
  const db = await getDatabase();
  const email = normalizeEmail(input.email);
  const password = String(input.password || "");
  const user = readUserByEmail(db, email);

  if (!user || user.status !== "active" || !verifyPassword(password, user.passwordHash)) {
    return { ok: false, status: 401, error: "Identifiants invalides." };
  }

  const token = createSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * config.sessionTtlHours).toISOString();
  db.prepare(`
    INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(hashToken(token), user.id, now.toISOString(), expiresAt);

  const auth = await readAuthContext(token);
  
  return {
    ok: true,
    token,
    user: auth.user,
    organization: auth.organization,
    availableOrganizations: auth.availableOrganizations,
    expiresAt
  };
}

export async function logoutUser(token) {
  if (usePostgresRuntime()) return postgresStore.logoutUser(token);
  const db = await getDatabase();
  db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(hashToken(token));
  return { ok: true };
}

export async function readAuthContext(token, activeOrganizationId = null) {
  if (usePostgresRuntime()) return postgresStore.readAuthContext(token, activeOrganizationId);
  if (!token) return null;
  const db = await getDatabase();
  const row = db.prepare(`
    SELECT users.*
    FROM auth_sessions
    JOIN users ON users.id = auth_sessions.user_id
    WHERE auth_sessions.token_hash = ? AND auth_sessions.expires_at > ?
    LIMIT 1
  `).get(hashToken(token), new Date().toISOString());
  if (!row) return null;

  const baseUser = mapUser(row);
  const organizations = db.prepare(`
    SELECT o.*, ou.role
    FROM organizations o
    JOIN organization_users ou ON o.id = ou.organization_id
    WHERE ou.user_id = ?
  `).all(baseUser.id);

  if (organizations.length === 0) return null;

  const orgIdToUse = activeOrganizationId && organizations.find(o => o.id === activeOrganizationId) ? activeOrganizationId : organizations[0].id;
  const organizationContext = organizations.find(o => o.id === orgIdToUse);

  const user = { ...baseUser, organizationId: organizationContext.id, role: organizationContext.role };

  return {
    user: publicUser(user),
    organization: readOrganization(db, user.organizationId),
    availableOrganizations: organizations.map(o => ({ id: o.id, name: o.name, role: o.role }))
  };
}

export async function readOrganizations() {
  if (usePostgresRuntime()) return postgresStore.readOrganizations();
  const db = await getDatabase();
  return readAllOrganizations(db);
}

export async function addOrganization(input) {
  if (usePostgresRuntime()) return postgresStore.addOrganization(input);
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = organizationIdFromName(input.name);
  const organization = {
    id,
    name: String(input.name || "").trim(),
    country: String(input.country || "").trim().toUpperCase(),
    currency: String(input.currency || "").trim().toUpperCase(),
    createdAt: now
  };
  const company = {
    id,
    organizationId: id,
    name: organization.name,
    country: organization.country,
    currency: organization.currency,
    fiscalYearStart: String(input.fiscalYearStart || "").trim(),
    fiscalYearEnd: String(input.fiscalYearEnd || "").trim()
  };
  const owner = {
    id: crypto.randomUUID(),
    organizationId: id,
    email: normalizeEmail(input.ownerEmail),
    name: String(input.ownerName || "").trim(),
    role: "owner",
    passwordHash: hashPassword(input.ownerPassword || ""),
    status: "active",
    createdAt: now
  };

  const errors = [
    ...validateOrganization(organization),
    ...validateCompany(company),
    ...validateUser(owner, input.ownerPassword)
  ];
  if (readOrganization(db, id)) errors.push("Une organisation avec ce nom existe deja.");
  if (readUserByEmail(db, owner.email)) errors.push("Cet email utilisateur existe deja.");
  if (errors.length > 0) return { ok: false, status: 422, errors };

  const period = {
    id: periodIdForCompany(company),
    organizationId: id,
    name: `Exercice ${company.fiscalYearStart.slice(0, 4)}`,
    startDate: company.fiscalYearStart,
    endDate: company.fiscalYearEnd,
    status: "open",
    updatedAt: now
  };

  withTransaction(db, () => {
    insertOrganization(db, organization);
    insertCompany(db, company);
    insertPeriod(db, period);
    for (const journal of seed.journals) insertJournal(db, { ...journal, organizationId: id });
    insertUser(db, owner);
    insertAuditEvent(db, {
      organizationId: id,
      action: "organization.create",
      entityType: "organization",
      entityId: id,
      summary: `Organisation creee: ${organization.name}`,
      details: { organization, company, ownerEmail: owner.email }
    });
  });

  return {
    ok: true,
    organization,
    company,
    owner: publicUser(owner)
  };
}

export async function readUsers(organizationId = defaultOrganizationId) {
  if (usePostgresRuntime()) return postgresStore.readUsers(organizationId);
  const db = await getDatabase();
  return readAllUsers(db, organizationId).map(publicUser);
}

export async function addUser(input) {
  if (usePostgresRuntime()) return postgresStore.addUser(input);
  const db = await getDatabase();
  const organizationId = String(input.organizationId || seed.company.id).trim();
  const organization = readOrganization(db, organizationId);
  if (!organization) return { ok: false, status: 422, error: "Organisation introuvable." };

  const user = {
    id: crypto.randomUUID(),
    email: normalizeEmail(input.email),
    name: String(input.name || "").trim(),
    role: ["owner", "admin", "accountant", "viewer"].includes(input.role) ? input.role : "viewer",
    organizationId,
    passwordHash: hashPassword(input.password || ""),
    status: "active",
    createdAt: new Date().toISOString()
  };

  const existingUser = readUserByEmail(db, user.email);
  if (existingUser) {
    const existingRole = db.prepare("SELECT role FROM organization_users WHERE user_id = ? AND organization_id = ?").get(existingUser.id, organizationId);
    if (existingRole) return { ok: false, status: 409, error: "Cet utilisateur est deja dans l'organisation." };
    user.id = existingUser.id;
    user.passwordHash = existingUser.passwordHash;
    user.status = existingUser.status;
    user.createdAt = existingUser.createdAt;
  }

  const errors = validateUser(user, input.password);
  if (!existingUser && errors.length > 0) return { ok: false, status: 422, errors };

  try {
    insertUser(db, user);
  } catch (error) {
    console.error(error);
    return { ok: false, status: 500, error: "Erreur interne lors de l'ajout." };
  }

  return { ok: true, user: publicUser(user) };
}

export async function inviteUser(input) {
  if (usePostgresRuntime()) return postgresStore.inviteUser(input);
  const db = await getDatabase();
  const organizationId = String(input.organizationId || seed.company.id).trim();
  const organization = readOrganization(db, organizationId);
  if (!organization) return { ok: false, status: 422, error: "Organisation introuvable." };

  const user = {
    id: crypto.randomUUID(),
    email: normalizeEmail(input.email),
    name: String(input.name || "").trim(),
    role: ["owner", "admin", "accountant", "viewer"].includes(input.role) ? input.role : "viewer",
    organizationId,
    passwordHash: hashPassword(crypto.randomUUID()),
    status: "disabled",
    createdAt: new Date().toISOString()
  };
  const errors = validateUserIdentity(user);
  if (errors.length > 0) return { ok: false, status: 422, errors };

  const existingUser = readUserByEmail(db, user.email);
  if (existingUser) {
    const existingRole = db.prepare("SELECT role FROM organization_users WHERE user_id = ? AND organization_id = ?").get(existingUser.id, organizationId);
    if (existingRole) return { ok: false, status: 409, error: "Cet utilisateur est deja dans l'organisation." };
    user.id = existingUser.id;
    user.passwordHash = existingUser.passwordHash;
    user.status = existingUser.status;
    user.createdAt = existingUser.createdAt;
  }

  let invitation;
  withTransaction(db, () => {
    insertUser(db, user);
    invitation = createAuthToken(db, user, "invitation", 7 * 24);
    insertAuditEvent(db, {
      organizationId,
      action: "user.invite",
      entityType: "user",
      entityId: user.id,
      summary: `Invitation utilisateur: ${user.email}`,
      details: { user: publicUser(user), expiresAt: invitation.expiresAt }
    });
  });

  // Envoi de l'email asynchrone (ne bloque pas la reponse)
  sendInvitationEmail(user, invitation.token).catch(console.error);

  return {
    ok: true,
    user: publicUser(user),
    ...(config.exposeAuthTokens ? { invitation } : {})
  };
}

export async function acceptInvitation(input) {
  if (usePostgresRuntime()) return postgresStore.acceptInvitation(input);
  const db = await getDatabase();
  const token = readValidAuthToken(db, input.token, "invitation");
  if (!token) return { ok: false, status: 422, error: "Invitation invalide ou expiree." };
  const user = readUserInOrganization(db, token.userId, token.organizationId);
  if (!user) return { ok: false, status: 404, error: "Utilisateur introuvable." };
  const errors = validatePassword(input.password);
  if (errors.length > 0) return { ok: false, status: 422, errors };

  withTransaction(db, () => {
    db.prepare("UPDATE users SET password_hash = ?, status = 'active' WHERE id = ?").run(hashPassword(input.password), user.id);
    consumeAuthToken(db, token.id);
    insertAuditEvent(db, {
      organizationId: user.organizationId,
      action: "user.accept_invitation",
      entityType: "user",
      entityId: user.id,
      summary: `Invitation acceptee: ${user.email}`,
      details: { userId: user.id }
    });
  });

  return { ok: true, user: publicUser(readUserById(db, user.id)) };
}

export async function requestPasswordReset(input) {
  if (usePostgresRuntime()) return postgresStore.requestPasswordReset(input);
  const db = await getDatabase();
  const user = readUserDefaultOrganization(db, normalizeEmail(input.email));
  if (!user || user.status !== "active") {
    return { ok: true, message: "Si le compte existe, un lien de reinitialisation est prepare." };
  }

  const reset = createAuthToken(db, user, "password_reset", 2);
  insertAuditEvent(db, {
    organizationId: user.organizationId,
    action: "user.password_reset_request",
    entityType: "user",
    entityId: user.id,
    summary: `Reinitialisation demandee: ${user.email}`,
    details: { expiresAt: reset.expiresAt }
  });
  sendPasswordResetEmail(user, reset.token).catch(console.error);

  return {
    ok: true,
    message: "Si le compte existe, un lien de reinitialisation a ete envoye.",
    ...(config.exposeAuthTokens ? { reset } : {})
  };
}

export async function resetPassword(input) {
  if (usePostgresRuntime()) return postgresStore.resetPassword(input);
  const db = await getDatabase();
  const token = readValidAuthToken(db, input.token, "password_reset");
  if (!token) return { ok: false, status: 422, error: "Lien de reinitialisation invalide ou expire." };
  const user = readUserInOrganization(db, token.userId, token.organizationId);
  if (!user) return { ok: false, status: 404, error: "Utilisateur introuvable." };
  const errors = validatePassword(input.password);
  if (errors.length > 0) return { ok: false, status: 422, errors };

  withTransaction(db, () => {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(input.password), user.id);
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(user.id);
    consumeAuthToken(db, token.id);
    insertAuditEvent(db, {
      organizationId: user.organizationId,
      action: "user.password_reset",
      entityType: "user",
      entityId: user.id,
      summary: `Mot de passe reinitialise: ${user.email}`,
      details: { userId: user.id }
    });
  });

  return { ok: true };
}

export async function updateUser(userId, input, actor) {
  if (usePostgresRuntime()) return postgresStore.updateUser(userId, input, actor);
  const db = await getDatabase();
  const organizationId = actor?.organization?.id ?? actor?.user?.organizationId ?? defaultOrganizationId;
  const current = readUserInOrganization(db, userId, organizationId);
  if (!current) return { ok: false, status: 404, error: "Utilisateur introuvable." };

  const next = {
    ...current,
    name: String(input.name ?? current.name).trim(),
    role: ["owner", "admin", "accountant", "viewer"].includes(input.role) ? input.role : current.role,
    status: ["active", "disabled"].includes(input.status) ? input.status : current.status
  };

  if (current.id === actor?.user?.id && next.status !== "active") {
    return { ok: false, status: 422, error: "Vous ne pouvez pas desactiver votre propre compte." };
  }

  if (current.role === "owner" && next.role !== "owner" && readOwnerCount(db, organizationId) <= 1) {
    return { ok: false, status: 422, error: "Une organisation doit conserver au moins un proprietaire." };
  }

  if (current.role === "owner" && next.status !== "active" && readOwnerCount(db, organizationId) <= 1) {
    return { ok: false, status: 422, error: "Une organisation doit conserver au moins un proprietaire actif." };
  }

  if (next.name.length < 2) return { ok: false, status: 422, error: "Le nom utilisateur est obligatoire." };

  withTransaction(db, () => {
    db.prepare(`
      UPDATE users
      SET name = ?, status = ?
      WHERE id = ?
    `).run(next.name, next.status, current.id);

    db.prepare(`
      UPDATE organization_users
      SET role = ?
      WHERE user_id = ? AND organization_id = ?
    `).run(next.role, current.id, organizationId);
  });

  return { ok: true, user: publicUser(readUserInOrganization(db, current.id, organizationId)) };
}

export async function enqueueJob(input) {
  if (usePostgresRuntime()) return postgresStore.enqueueJob(input);
  const db = await getDatabase();
  const job = {
    id: crypto.randomUUID(),
    organizationId: input.organizationId ?? defaultOrganizationId,
    type: String(input.type || "").trim(),
    status: "queued",
    payload: input.payload ?? {},
    result: null,
    error: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!job.type) return { ok: false, status: 422, error: "Le type de job est obligatoire." };
  insertJob(db, job);
  return { ok: true, job };
}

export async function readJobs(organizationId = defaultOrganizationId) {
  if (usePostgresRuntime()) return postgresStore.readJobs(organizationId);
  const db = await getDatabase();
  return db.prepare(`
    SELECT *
    FROM jobs
    WHERE organization_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(organizationId).map(mapJob);
}

export async function claimNextJob() {
  if (usePostgresRuntime()) return postgresStore.claimNextJob();
  const db = await getDatabase();
  const row = db.prepare(`
    SELECT *
    FROM jobs
    WHERE status = 'queued'
    ORDER BY created_at ASC
    LIMIT 1
  `).get();
  if (!row) return null;

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE jobs
    SET status = 'running', updated_at = ?, started_at = ?
    WHERE id = ? AND status = 'queued'
  `).run(now, now, row.id);

  const claimed = db.prepare("SELECT * FROM jobs WHERE id = ?").get(row.id);
  return claimed ? mapJob(claimed) : null;
}

export async function completeJob(jobId, result) {
  if (usePostgresRuntime()) return postgresStore.completeJob(jobId, result);
  const db = await getDatabase();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE jobs
    SET status = 'done', result_json = ?, error = NULL, updated_at = ?, finished_at = ?
    WHERE id = ?
  `).run(JSON.stringify(result ?? {}), now, now, jobId);
  return { ok: true };
}

export async function failJob(jobId, error) {
  if (usePostgresRuntime()) return postgresStore.failJob(jobId, error);
  const db = await getDatabase();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE jobs
    SET status = 'failed', error = ?, updated_at = ?, finished_at = ?
    WHERE id = ?
  `).run(String(error || "Erreur job"), now, now, jobId);
  return { ok: true };
}

export async function saveTextFile(input) {
  if (usePostgresRuntime()) return postgresStore.saveTextFile(input);
  const db = await getDatabase();
  const name = String(input.name || "").trim();
  const content = String(input.content ?? "");
  const mimeType = String(input.mimeType || "text/plain").trim();
  if (!name) return { ok: false, status: 422, error: "Le nom du fichier est obligatoire." };

  await mkdir(storageDir, { recursive: true });
  const id = crypto.randomUUID();
  const safeName = name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const absolutePath = join(storageDir, `${id}-${safeName}`);
  const relativePath = relative(rootDir, absolutePath);
  await writeFile(absolutePath, content, "utf8");
  const fileStats = await stat(absolutePath);
  const file = {
    id,
    organizationId: input.organizationId ?? defaultOrganizationId,
    name,
    path: relativePath,
    mimeType,
    size: fileStats.size,
    createdAt: new Date().toISOString()
  };
  insertStoredFile(db, file);
  return { ok: true, file };
}

export async function readStoredFileContent(fileId, organizationId = defaultOrganizationId) {
  if (usePostgresRuntime()) return postgresStore.readStoredFileContent(fileId, organizationId);
  const db = await getDatabase();
  const row = db.prepare("SELECT * FROM stored_files WHERE id = ? AND organization_id = ?").get(fileId, organizationId);
  if (!row) return null;
  const file = mapStoredFile(row);
  return {
    file,
    content: await readFile(join(rootDir, file.path))
  };
}

export async function readStoredFiles(organizationId = defaultOrganizationId) {
  if (usePostgresRuntime()) return postgresStore.readStoredFiles(organizationId);
  const db = await getDatabase();
  return db.prepare(`
    SELECT *
    FROM stored_files
    WHERE organization_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(organizationId).map(mapStoredFile);
}

export async function readAccounts(organizationId = defaultOrganizationId) {
  if (usePostgresRuntime()) return postgresStore.readAccounts(organizationId);
  const db = await getDatabase();
  return accountCatalog(db, organizationId);
}

export async function addCustomAccount(input) {
  if (usePostgresRuntime()) return postgresStore.addCustomAccount(input);
  const db = await getDatabase();
  const organizationId = input.organizationId ?? defaultOrganizationId;
  const account = enrichAccount({
    code: String(input.code || "").trim(),
    label: String(input.label || "").trim(),
    type: String(input.type || "").trim(),
    source: "custom"
  });
  const errors = validateCustomAccount(db, account, organizationId);
  if (errors.length > 0) return { ok: false, status: 422, errors };

  withTransaction(db, () => {
    insertCustomAccount(db, { ...account, organizationId, createdAt: new Date().toISOString() });
    insertAuditEvent(db, {
      organizationId,
      action: "account.create",
      entityType: "account",
      entityId: account.code,
      summary: `Compte cree: ${account.code} - ${account.label}`,
      details: account
    });
  });

  return { ok: true, account: accountCatalog(db, organizationId).find((candidate) => candidate.code === account.code) };
}

export async function readJournals(organizationId = defaultOrganizationId) {
  if (usePostgresRuntime()) return postgresStore.readJournals(organizationId);
  const db = await getDatabase();
  return readAllJournals(db, organizationId);
}

export async function addJournal(input) {
  if (usePostgresRuntime()) return postgresStore.addJournal(input);
  const db = await getDatabase();
  const organizationId = input.organizationId ?? defaultOrganizationId;
  const journal = {
    code: String(input.code || "").trim().toUpperCase(),
    organizationId,
    label: String(input.label || "").trim(),
    type: normalizeJournalType(input.type),
    status: "active",
    createdAt: new Date().toISOString()
  };
  const errors = validateJournal(db, journal);
  if (errors.length > 0) return { ok: false, status: 422, errors };

  withTransaction(db, () => {
    insertJournal(db, journal);
    insertAuditEvent(db, {
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
  if (usePostgresRuntime()) return postgresStore.updateCompany(input);
  const db = await getDatabase();
  const organizationId = input.organizationId ?? defaultOrganizationId;
  const current = readCompany(db, organizationId);
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
    insertAuditEvent(db, {
      organizationId,
      action: "company.update",
      entityType: "company",
      entityId: company.id,
      summary: `Parametres entreprise mis a jour: ${company.name}`,
      details: company
    });
  });

  return { ok: true, company: readCompany(db, organizationId), accountingPeriods: readPeriods(db, organizationId) };
}

export async function addJournalEntry(entry) {
  if (usePostgresRuntime()) return postgresStore.addJournalEntry(entry);
  return (await addJournalEntries([entry]))[0];
}

export async function updateJournalEntry(entryId, input) {
  if (usePostgresRuntime()) return postgresStore.updateJournalEntry(entryId, input);
  const db = await getDatabase();
  const current = readEntry(db, entryId);
  if (!current) return { ok: false, status: 404, error: "Ecriture introuvable." };

  const organizationId = current.organizationId ?? defaultOrganizationId;
  const lockedCurrentPeriod = findLockedPeriodForDate(db, current.date, organizationId);
  if (lockedCurrentPeriod) {
    return { ok: false, status: 423, error: `Periode verrouillee: ${lockedCurrentPeriod.name}.` };
  }

  const updated = normalizeJournalEntry({
    ...current,
    ...input,
    id: current.id,
    organizationId,
    batchId: current.batchId,
    bankFingerprint: current.bankFingerprint,
    createdAt: current.createdAt
  });
  ensureKnownJournal(db, updated.source, organizationId);
  assertEntriesInOpenPeriods(db, [updated]);

  withTransaction(db, () => {
    insertEntry(db, updated);
    insertAuditEvent(db, {
      organizationId,
      action: "journal.update",
      entityType: "journal_entry",
      entityId: entryId,
      summary: `Ecriture modifiee: ${updated.reference} - ${updated.description}`,
      details: { before: current, after: updated }
    });
  });

  return { ok: true, entry: updated };
}

export async function addJournalEntries(entries) {
  if (usePostgresRuntime()) return postgresStore.addJournalEntries(entries);
  if (entries.length === 0) return [];

  const db = await getDatabase();
  const normalizedEntries = entries.map((entry) => normalizeJournalEntry(entry));
  const organizationId = normalizedEntries[0]?.organizationId ?? defaultOrganizationId;
  for (const entry of normalizedEntries) {
    ensureKnownJournal(db, entry.source, organizationId);
  }
  assertEntriesInOpenPeriods(db, normalizedEntries);
  withTransaction(db, () => {
    for (const entry of normalizedEntries) {
      insertEntry(db, entry);
    }
    insertAuditEvent(db, {
      organizationId,
      action: normalizedEntries.length === 1 ? "journal.create" : "journal.bulk_create",
      entityType: "journal_entry",
      entityId: normalizedEntries.length === 1 ? normalizedEntries[0].id : "batch",
      summary: `${normalizedEntries.length} ecriture(s) ajoutee(s)`,
      details: { entryIds: normalizedEntries.map((entry) => entry.id) }
    });
  });
  return normalizedEntries;
}

export async function addAuxiliaryAccount(input) {
  if (usePostgresRuntime()) return postgresStore.addAuxiliaryAccount(input);
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
  if (!accountCatalog(db, input.organizationId ?? defaultOrganizationId).some((account) => account.code === accountCode && account.isPostable)) {
    return { ok: false, status: 422, error: "Le compte collectif doit etre un compte OHADA a 4 chiffres." };
  }

  const auxiliary = {
    code,
    organizationId: input.organizationId ?? defaultOrganizationId,
    label,
    accountCode,
    createdAt: new Date().toISOString()
  };
  withTransaction(db, () => {
    insertAuxiliaryAccount(db, auxiliary);
    insertAuditEvent(db, {
      organizationId: auxiliary.organizationId,
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
  if (usePostgresRuntime()) return postgresStore.addAccountingPeriod(input);
  const db = await getDatabase();
  const organizationId = input.organizationId ?? defaultOrganizationId;
  const period = { ...buildAccountingPeriod(db, input), organizationId };
  const errors = validatePeriod(db, period);
  if (errors.length > 0) {
    return { ok: false, status: 422, errors };
  }

  withTransaction(db, () => {
    insertPeriod(db, period);
    insertAuditEvent(db, {
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

export async function deleteJournalEntry(entryId) {
  if (usePostgresRuntime()) return postgresStore.deleteJournalEntry(entryId);
  const db = await getDatabase();
  const entry = readEntry(db, entryId);
  if (!entry) {
    return { ok: false, error: "Ecriture introuvable." };
  }
  const lockedPeriod = findLockedPeriodForDate(db, entry.date, entry.organizationId);
  if (lockedPeriod) {
    return { ok: false, status: 423, error: `Periode verrouillee: ${lockedPeriod.name}.` };
  }

  withTransaction(db, () => {
    db.prepare("DELETE FROM journal_lines WHERE entry_id = ?").run(entryId);
    db.prepare("DELETE FROM journal_entries WHERE id = ?").run(entryId);
    insertAuditEvent(db, {
      organizationId: entry.organizationId,
      action: "journal.delete",
      entityType: "journal_entry",
      entityId: entryId,
      summary: `Ecriture supprimee: ${entry.reference} - ${entry.description}`,
      details: { entry }
    });

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
  if (usePostgresRuntime()) return postgresStore.addBankImportBatch(batch);
  const db = await getDatabase();
  withTransaction(db, () => {
    insertBatch(db, batch);
    insertAuditEvent(db, {
      organizationId: batch.organizationId,
      action: "bank_import.commit",
      entityType: "bank_import_batch",
      entityId: batch.id,
      summary: `Import bancaire valide: ${batch.importedCount} ecriture(s)`,
      details: batch
    });
  });
  return batch;
}

export async function addSubscriptionBatch(batch, entries) {
  if (usePostgresRuntime()) return postgresStore.addSubscriptionBatch(batch, entries);
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
    insertAuditEvent(db, {
      organizationId: batch.organizationId,
      action: "subscription.generate",
      entityType: "subscription_batch",
      entityId: batch.id,
      summary: `Abonnement genere: ${batch.name} (${normalizedEntries.length} ecriture(s))`,
      details: { batch, entryIds: normalizedEntries.map((entry) => entry.id) }
    });
  });
  return {
    ...batch,
    entryIds: normalizedEntries.map((entry) => entry.id),
    entries: normalizedEntries
  };
}

export async function readLetteringState(accountCode = "", organizationId = defaultOrganizationId) {
  if (usePostgresRuntime()) return postgresStore.readLetteringState(accountCode, organizationId);
  const db = await getDatabase();
  return buildLetteringState(db, accountCode, organizationId);
}

export async function addManualLettering(input) {
  if (usePostgresRuntime()) return postgresStore.addManualLettering(input);
  const db = await getDatabase();
  const organizationId = input.organizationId ?? defaultOrganizationId;
  const selectedRefs = Array.isArray(input.lineRefs)
    ? [...new Set(input.lineRefs.map((ref) => String(ref || "").trim()).filter(Boolean))]
    : [];

  if (selectedRefs.length < 2) {
    return { ok: false, status: 422, error: "Selectionnez au moins deux lignes a lettrer." };
  }

  const rows = readLetteringRows(db, organizationId);
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

  let group;
  withTransaction(db, () => {
    group = createLetteringGroup(db, firstAccountCode, selectedRefs, "manual", organizationId);
    insertAuditEvent(db, {
      organizationId,
      action: "lettering.manual",
      entityType: "lettering_group",
      entityId: group.id,
      summary: `Lettrage manuel ${group.code} sur ${firstAccountCode}`,
      details: group
    });
  });
  return { ok: true, group, rows: buildLetteringState(db, firstAccountCode, organizationId) };
}

export async function addAutomaticLettering(input = {}) {
  if (usePostgresRuntime()) return postgresStore.addAutomaticLettering(input);
  const db = await getDatabase();
  const organizationId = input.organizationId ?? defaultOrganizationId;
  const requestedAccountCode = String(input.accountCode || "").trim();
  const rows = readLetteringRows(db, organizationId)
    .filter((row) => !row.letteringCode)
    .filter((row) => !requestedAccountCode || row.accountCode === requestedAccountCode)
    .filter((row) => row.debit > 0 || row.credit > 0);

  const groups = [];
  withTransaction(db, () => {
    for (const rowsForAccount of groupRowsByAccount(rows).values()) {
      for (const match of matchLetteringPairs(rowsForAccount)) {
        groups.push(createLetteringGroup(db, match[0].accountCode, match.map((row) => row.lineRef), "automatic", organizationId));
      }
    }
    if (groups.length > 0) {
      insertAuditEvent(db, {
        organizationId,
        action: "lettering.auto",
        entityType: "lettering_group",
        entityId: "automatic",
        summary: `Lettrage automatique: ${groups.length} groupe(s)`,
        details: { groups }
      });
    }
  });

  return {
    ok: true,
    groups,
    matchedLineCount: groups.reduce((count, group) => count + group.lineRefs.length, 0),
    rows: buildLetteringState(db, requestedAccountCode, organizationId)
  };
}

export async function voidBankImportBatch(batchId, organizationId = defaultOrganizationId) {
  if (usePostgresRuntime()) return postgresStore.voidBankImportBatch(batchId, organizationId);
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
  const lockedPeriod = entries.map((entry) => findLockedPeriodForDate(db, entry.date, organizationId)).find(Boolean);
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
      WHERE id = ? AND organization_id = ?
    `).run(new Date().toISOString(), new Date().toISOString(), batchId, organizationId);
    insertAuditEvent(db, {
      organizationId,
      action: "bank_import.void",
      entityType: "bank_import_batch",
      entityId: batchId,
      summary: `Lot bancaire annule: ${batch.importedCount} ecriture(s) visee(s)`,
      details: batch
    });
  });
  const after = Number(db.prepare("SELECT COUNT(*) AS count FROM journal_entries").get().count);

  return { ok: true, batch: { ...batch, status: "voided" }, removedCount: before - after };
}

export async function addClassificationCorrections(corrections) {
  if (usePostgresRuntime()) return postgresStore.addClassificationCorrections(corrections);
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

export async function setAccountingPeriodStatus(periodId, status, organizationId = defaultOrganizationId) {
  if (usePostgresRuntime()) return postgresStore.setAccountingPeriodStatus(periodId, status, organizationId);
  const db = await getDatabase();
  if (!["open", "locked"].includes(status)) {
    return { ok: false, error: "Statut de periode invalide." };
  }

  const period = readPeriod(db, periodId, organizationId);
  if (!period) {
    return { ok: false, error: "Periode introuvable." };
  }

  const timestamp = new Date().toISOString();
  withTransaction(db, () => {
    db.prepare(`
      UPDATE accounting_periods
      SET status = ?, locked_at = ?, updated_at = ?
      WHERE id = ? AND organization_id = ?
    `).run(status, status === "locked" ? timestamp : null, timestamp, periodId, organizationId);
    insertAuditEvent(db, {
      organizationId,
      action: status === "locked" ? "period.lock" : "period.unlock",
      entityType: "accounting_period",
      entityId: periodId,
      summary: `${status === "locked" ? "Exercice verrouille" : "Exercice rouvert"}: ${period.name}`,
      details: { before: period, after: readPeriod(db, periodId, organizationId) }
    });
  });

  return { ok: true, period: readPeriod(db, periodId, organizationId) };
}

async function getDatabase() {
  if (usePostgresRuntime()) {
    const error = new Error("Cette operation n'est pas encore branchee sur le runtime PostgreSQL.");
    error.status = 501;
    throw error;
  }

  if (database) return database;

  await mkdir(dirname(dbPath), { recursive: true });
  database = new DatabaseSync(dbPath);
  database.exec("PRAGMA foreign_keys = ON");
  createSchema(database);
  migrateOrganizationUsers(database);
  await seedIfEmpty(database);
  ensureDefaultOrganizationAndUser(database);
  ensureCompanyPeriod(database);
  ensureDefaultAuxiliaries(database);
  ensureDefaultJournals(database);
  return database;
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      name TEXT NOT NULL,
      country TEXT NOT NULL,
      currency TEXT NOT NULL,
      fiscal_year_start TEXT NOT NULL,
      fiscal_year_end TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      country TEXT NOT NULL,
      currency TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS organization_users (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'accountant', 'viewer')),
      PRIMARY KEY (user_id, organization_id)
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id),
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('invitation', 'password_reset')),
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
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
      organization_id TEXT,
      label TEXT NOT NULL,
      account_code TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS custom_accounts (
      code TEXT NOT NULL,
      organization_id TEXT,
      label TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (organization_id, code)
    );

    CREATE TABLE IF NOT EXISTS journals (
      code TEXT NOT NULL,
      organization_id TEXT,
      label TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      PRIMARY KEY (organization_id, code)
    );

    CREATE TABLE IF NOT EXISTS bank_import_batches (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
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
      organization_id TEXT,
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
      organization_id TEXT,
      code TEXT NOT NULL UNIQUE,
      account_code TEXT NOT NULL,
      line_refs_json TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('manual', 'automatic')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS classification_corrections (
      organization_id TEXT,
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
      organization_id TEXT,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open', 'locked')),
      locked_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      details_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'done', 'failed')),
      payload_json TEXT NOT NULL,
      result_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS stored_files (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_organization_users_user_id ON organization_users(user_id);
    CREATE INDEX IF NOT EXISTS idx_organization_users_organization_id ON organization_users(organization_id);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_id ON auth_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_token_hash ON auth_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_journal_entries_created_at ON journal_entries(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_journal_entries_batch_id ON journal_entries(batch_id);
    CREATE INDEX IF NOT EXISTS idx_journal_entries_bank_fingerprint ON journal_entries(bank_fingerprint);
    CREATE INDEX IF NOT EXISTS idx_auxiliary_accounts_account_code ON auxiliary_accounts(account_code);
    CREATE INDEX IF NOT EXISTS idx_accounting_periods_dates ON accounting_periods(start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_subscription_batches_created_at ON subscription_batches(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lettering_groups_account_code ON lettering_groups(account_code);
    CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_stored_files_created_at ON stored_files(created_at DESC);
  `);
  addColumnIfMissing(db, "journal_entries", "reference", "TEXT NOT NULL DEFAULT ''");
  addOrganizationColumnIfMissing(db, "companies");
  addOrganizationColumnIfMissing(db, "journal_entries");
  addOrganizationColumnIfMissing(db, "auxiliary_accounts");
  addOrganizationColumnIfMissing(db, "custom_accounts");
  addOrganizationColumnIfMissing(db, "journals");
  addOrganizationColumnIfMissing(db, "bank_import_batches");
  addOrganizationColumnIfMissing(db, "subscription_batches");
  addOrganizationColumnIfMissing(db, "lettering_groups");
  addOrganizationColumnIfMissing(db, "classification_corrections");
  addOrganizationColumnIfMissing(db, "accounting_periods");
  addOrganizationColumnIfMissing(db, "audit_events");
  addOrganizationColumnIfMissing(db, "jobs");
  addOrganizationColumnIfMissing(db, "stored_files");
  addColumnIfMissing(db, "journal_lines", "auxiliary_code", "TEXT");
  migrateLegacyAccountCodes(db);
  backfillEntryReferences(db);
  db.exec("CREATE INDEX IF NOT EXISTS idx_journal_lines_auxiliary_code ON journal_lines(auxiliary_code)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_journal_entries_reference ON journal_entries(reference)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_journal_entries_organization_id ON journal_entries(organization_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_auxiliary_accounts_organization_id ON auxiliary_accounts(organization_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_custom_accounts_organization_id ON custom_accounts(organization_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_journals_organization_id ON journals(organization_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_jobs_organization_id ON jobs(organization_id)");
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
    legacy.customAccounts ??= [];
    legacy.journals ??= [];
    legacy.letteringGroups ??= [];
    return legacy;
  } catch {
    return null;
  }
}

function readSnapshot(db, organizationId = defaultOrganizationId) {
  return {
    company: readCompany(db, organizationId),
    organizations: readAllOrganizations(db),
    users: readAllUsers(db, organizationId).map(publicUser),
    jobs: db.prepare("SELECT * FROM jobs WHERE organization_id = ? ORDER BY created_at DESC LIMIT 100").all(organizationId).map(mapJob),
    storedFiles: db.prepare("SELECT * FROM stored_files WHERE organization_id = ? ORDER BY created_at DESC LIMIT 100").all(organizationId).map(mapStoredFile),
    accountingPeriods: readPeriods(db, organizationId),
    accounts: accountCatalog(db, organizationId),
    auxiliaryAccounts: readAuxiliaryAccounts(db, organizationId),
    customAccounts: readCustomAccounts(db, organizationId),
    journals: readAllJournals(db, organizationId),
    classificationCorrections: readCorrections(db, organizationId),
    bankImportBatches: readBatches(db, organizationId),
    subscriptionBatches: readSubscriptionBatches(db, organizationId),
    letteringGroups: readLetteringGroups(db, organizationId),
    auditEvents: readAuditEvents(db, organizationId),
    journalEntries: readEntries(db, organizationId)
  };
}

function writeSnapshot(db, snapshot) {
  withTransaction(db, () => {
    insertCompany(db, snapshot.company);
    for (const period of snapshot.accountingPeriods ?? []) insertPeriod(db, period);
    for (const auxiliary of snapshot.auxiliaryAccounts ?? []) insertAuxiliaryAccount(db, auxiliary);
    for (const account of snapshot.customAccounts ?? []) insertCustomAccount(db, account);
    for (const journal of snapshot.journals ?? seed.journals) insertJournal(db, journal);
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

function readCompany(db, organizationId = defaultOrganizationId) {
  const row = db.prepare("SELECT * FROM companies WHERE organization_id = ? LIMIT 1").get(organizationId)
    ?? db.prepare("SELECT * FROM companies LIMIT 1").get();
  return {
    id: row.id,
    organizationId: row.organization_id ?? row.id,
    name: row.name,
    country: row.country,
    currency: row.currency,
    fiscalYearStart: row.fiscal_year_start,
    fiscalYearEnd: row.fiscal_year_end
  };
}

function migrateOrganizationUsers(db) {
  try {
    const columns = db.prepare("PRAGMA table_info(users)").all();
    const hasOrgId = columns.some(c => c.name === 'organization_id');
    const hasRole = columns.some(c => c.name === 'role');
    
    if (hasOrgId && hasRole) {
      db.prepare(`
        INSERT OR IGNORE INTO organization_users (user_id, organization_id, role)
        SELECT id, organization_id, role FROM users WHERE organization_id IS NOT NULL AND role IS NOT NULL
      `).run();
    }
  } catch (error) {
    console.error("Migration error:", error);
  }
}

function ensureDefaultOrganizationAndUser(db) {
  const company = readCompany(db);
  const organizationCount = Number(db.prepare("SELECT COUNT(*) AS count FROM organizations").get().count);
  if (organizationCount === 0) {
    insertOrganization(db, {
      id: company.id,
      name: company.name,
      country: company.country,
      currency: company.currency,
      createdAt: new Date().toISOString()
    });
  }

  const userCount = Number(db.prepare("SELECT COUNT(*) AS count FROM users").get().count);
  if (userCount === 0) {
    insertUser(db, {
      id: crypto.randomUUID(),
      organizationId: company.id,
      email: config.defaultAdminEmail,
      name: "Administrateur Demo",
      passwordHash: hashPassword(config.defaultAdminPassword),
      role: "owner",
      status: "active",
      createdAt: new Date().toISOString()
    });
  }
}

function readAllOrganizations(db) {
  return db.prepare(`
    SELECT *
    FROM organizations
    ORDER BY created_at ASC
  `).all().map(mapOrganization);
}

function readOrganization(db, organizationId) {
  const row = db.prepare("SELECT * FROM organizations WHERE id = ?").get(organizationId);
  return row ? mapOrganization(row) : null;
}

function readAllUsers(db, organizationId = null) {
  if (organizationId) {
    return db.prepare(`
      SELECT u.*, ou.organization_id, ou.role
      FROM users u
      JOIN organization_users ou ON u.id = ou.user_id
      WHERE ou.organization_id = ?
      ORDER BY u.created_at ASC
    `).all(organizationId).map(mapUser);
  }
  return db.prepare(`
    SELECT u.*
    FROM users u
    ORDER BY u.created_at ASC
  `).all().map(mapUser);
}

function readUserByEmail(db, email) {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  return row ? mapUser(row) : null;
}

function readUserById(db, userId) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  return row ? mapUser(row) : null;
}

function readUserInOrganization(db, userId, organizationId) {
  const row = db.prepare(`
    SELECT u.*, ou.organization_id, ou.role
    FROM users u
    JOIN organization_users ou ON u.id = ou.user_id
    WHERE u.id = ? AND ou.organization_id = ?
    LIMIT 1
  `).get(userId, organizationId);
  return row ? mapUser(row) : null;
}

function readUserDefaultOrganization(db, email) {
  const row = db.prepare(`
    SELECT u.*, ou.organization_id, ou.role
    FROM users u
    JOIN organization_users ou ON u.id = ou.user_id
    WHERE u.email = ?
    ORDER BY u.created_at ASC
    LIMIT 1
  `).get(email);
  return row ? mapUser(row) : null;
}

function readOwnerCount(db, organizationId) {
  return Number(db.prepare(`
    SELECT COUNT(*) AS count
    FROM users u
    JOIN organization_users ou ON u.id = ou.user_id
    WHERE ou.organization_id = ? AND ou.role = 'owner' AND u.status = 'active'
  `).get(organizationId).count);
}

function createAuthToken(db, user, type, ttlHours) {
  const token = createSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString();
  const record = {
    id: crypto.randomUUID(),
    organizationId: user.organizationId,
    userId: user.id,
    type,
    token,
    tokenHash: hashToken(token),
    createdAt: now.toISOString(),
    expiresAt
  };
  db.prepare(`
    INSERT INTO auth_tokens
    (id, organization_id, user_id, type, token_hash, created_at, expires_at, used_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(record.id, record.organizationId, record.userId, record.type, record.tokenHash, record.createdAt, record.expiresAt);
  return {
    token,
    expiresAt,
    url: `/?${type === "invitation" ? "invite" : "reset"}=${encodeURIComponent(token)}`
  };
}

function readValidAuthToken(db, token, type) {
  const row = db.prepare(`
    SELECT *
    FROM auth_tokens
    WHERE token_hash = ? AND type = ? AND used_at IS NULL AND expires_at > ?
    LIMIT 1
  `).get(hashToken(token), type, new Date().toISOString());
  return row ? mapAuthToken(row) : null;
}

function consumeAuthToken(db, tokenId) {
  db.prepare("UPDATE auth_tokens SET used_at = ? WHERE id = ?").run(new Date().toISOString(), tokenId);
}

function readPeriods(db, organizationId = defaultOrganizationId) {
  return db.prepare(`
    SELECT * FROM accounting_periods
    WHERE organization_id = ?
    ORDER BY start_date DESC
  `).all(organizationId).map(mapPeriod);
}

function readPeriod(db, periodId, organizationId = defaultOrganizationId) {
  const row = db.prepare("SELECT * FROM accounting_periods WHERE id = ? AND organization_id = ?").get(periodId, organizationId);
  return row ? mapPeriod(row) : null;
}

function ensureCompanyPeriod(db) {
  const company = readCompany(db);
  const count = Number(db.prepare("SELECT COUNT(*) AS count FROM accounting_periods").get().count);
  if (count > 0) return;

  ensurePeriodForCompany(db, company);
}

function ensurePeriodForCompany(db, company) {
  const periodId = periodIdForCompany(company);
  const organizationId = company.organizationId ?? company.id ?? defaultOrganizationId;
  const existing = readPeriod(db, periodId, organizationId);
  if (existing) {
    db.prepare(`
      UPDATE accounting_periods
      SET name = ?, start_date = ?, end_date = ?, updated_at = ?
      WHERE id = ? AND organization_id = ?
    `).run(
      `Exercice ${company.fiscalYearStart.slice(0, 4)}`,
      company.fiscalYearStart,
      company.fiscalYearEnd,
      new Date().toISOString(),
      periodId,
      organizationId
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

function buildAccountingPeriod(db, input) {
  const organizationId = input.organizationId ?? defaultOrganizationId;
  const latest = db.prepare(`
    SELECT *
    FROM accounting_periods
    WHERE organization_id = ?
    ORDER BY end_date DESC
    LIMIT 1
  `).get(organizationId);
  const nextRange = latest ? nextPeriodRange(mapPeriod(latest)) : nextPeriodRange(readCompany(db, organizationId));
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

function validatePeriod(db, period) {
  const errors = [];
  if (!period.name || period.name.length < 3) errors.push("Le nom de l'exercice est obligatoire.");
  if (!isIsoDate(period.startDate)) errors.push("La date de debut d'exercice est invalide.");
  if (!isIsoDate(period.endDate)) errors.push("La date de fin d'exercice est invalide.");
  if (isIsoDate(period.startDate) && isIsoDate(period.endDate) && period.endDate < period.startDate) {
    errors.push("La fin d'exercice doit etre posterieure au debut.");
  }

  const sameId = readPeriod(db, period.id, period.organizationId);
  if (sameId) errors.push("Un exercice avec cet identifiant existe deja.");

  if (errors.length === 0) {
    const overlap = db.prepare(`
      SELECT *
      FROM accounting_periods
      WHERE organization_id = ? AND NOT (end_date < ? OR start_date > ?)
      LIMIT 1
    `).get(period.organizationId ?? defaultOrganizationId, period.startDate, period.endDate);
    if (overlap) errors.push(`La periode chevauche ${overlap.name}.`);
  }

  return errors;
}

function validateUser(user, password) {
  return [...validateUserIdentity(user), ...validatePassword(password)];
}

function validateUserIdentity(user) {
  const errors = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) errors.push("Email invalide.");
  if (user.name.length < 2) errors.push("Le nom utilisateur est obligatoire.");
  return errors;
}

function validatePassword(password) {
  const errors = [];
  if (String(password || "").length < 8) errors.push("Le mot de passe doit contenir au moins 8 caracteres.");
  return errors;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function validateOrganization(organization) {
  const errors = [];
  if (organization.name.length < 2) errors.push("Le nom de l'organisation est obligatoire.");
  if (!/^[A-Z]{2,3}$/.test(organization.country)) errors.push("Le pays de l'organisation doit etre renseigne avec un code court, ex: CI.");
  if (!/^[A-Z]{3}$/.test(organization.currency)) errors.push("La devise de l'organisation doit etre un code a 3 lettres, ex: XOF.");
  return errors;
}

function organizationIdFromName(name) {
  const base = String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || `org-${crypto.randomUUID().slice(0, 8)}`;
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

function ensureDefaultAuxiliaries(db) {
  const count = Number(db.prepare("SELECT COUNT(*) AS count FROM auxiliary_accounts").get().count);
  if (count > 0) return;

  for (const auxiliary of seed.auxiliaryAccounts) {
    insertAuxiliaryAccount(db, auxiliary);
  }
}

function ensureDefaultJournals(db) {
  const organizations = readAllOrganizations(db);
  for (const organization of organizations) {
    const count = Number(db.prepare("SELECT COUNT(*) AS count FROM journals WHERE organization_id = ?").get(organization.id).count);
    if (count > 0) continue;
    for (const journal of seed.journals) {
      insertJournal(db, { ...journal, organizationId: organization.id });
    }
  }
}

function validateCustomAccount(db, account, organizationId) {
  const errors = [];
  if (!/^\d{4}$/.test(account.code)) errors.push("Le compte doit contenir exactement 4 chiffres.");
  if (account.label.length < 2) errors.push("Le libelle du compte est obligatoire.");
  if (!["asset", "liability", "equity", "expense", "revenue"].includes(account.type)) {
    errors.push("Le type du compte est invalide.");
  }
  if (accountByCode.has(account.code)) errors.push("Ce compte existe deja dans le plan SYSCOHADA.");
  if (readCustomAccount(db, account.code, organizationId)) errors.push("Ce compte existe deja dans ce dossier.");
  return errors;
}

function validateJournal(db, journal) {
  const errors = [];
  if (!/^[A-Z0-9]{2,8}$/.test(journal.code)) errors.push("Le code journal doit contenir 2 a 8 caracteres alphanumeriques.");
  if (journal.label.length < 2) errors.push("Le libelle du journal est obligatoire.");
  if (!["misc", "bank", "cash", "sales", "purchase", "payroll", "closing"].includes(journal.type)) {
    errors.push("Le type du journal est invalide.");
  }
  if (readJournal(db, journal.code, journal.organizationId)) errors.push("Ce journal existe deja dans ce dossier.");
  return errors;
}

function normalizeJournalType(type) {
  return ["misc", "bank", "cash", "sales", "purchase", "payroll", "closing"].includes(type) ? type : "misc";
}

function ensureKnownJournal(db, code, organizationId) {
  const journalCode = String(code || "manual").trim();
  if (["manual", "seed", "subscription", "bank-csv"].includes(journalCode)) return;
  if (!readJournal(db, journalCode, organizationId)) {
    const error = new Error(`Journal inconnu: ${journalCode}.`);
    error.status = 422;
    throw error;
  }
}

function assertEntriesInOpenPeriods(db, entries) {
  for (const entry of entries) {
    const lockedPeriod = findLockedPeriodForDate(db, entry.date, entry.organizationId);
    if (lockedPeriod) {
      const error = new Error(`Periode verrouillee: ${lockedPeriod.name}.`);
      error.status = 423;
      throw error;
    }
  }
}

function findLockedPeriodForDate(db, date, organizationId = defaultOrganizationId) {
  return db.prepare(`
    SELECT * FROM accounting_periods
    WHERE organization_id = ? AND status = 'locked' AND ? BETWEEN start_date AND end_date
    LIMIT 1
  `).all(organizationId ?? defaultOrganizationId, date).map(mapPeriod)[0] ?? null;
}

function readCorrections(db, organizationId = defaultOrganizationId) {
  return db.prepare(`
    SELECT * FROM classification_corrections
    WHERE organization_id = ?
    ORDER BY learned_at DESC
  `).all(organizationId).map((row) => ({
    organizationId: row.organization_id ?? defaultOrganizationId,
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

function readAuxiliaryAccounts(db, organizationId = defaultOrganizationId) {
  const accountsByCode = new Map(accountCatalog(db, organizationId).map((account) => [account.code, account]));
  return db.prepare(`
    SELECT *
    FROM auxiliary_accounts
    WHERE organization_id = ?
    ORDER BY account_code ASC, code ASC
  `).all(organizationId).map((row) => ({
    code: row.code,
    organizationId: row.organization_id ?? defaultOrganizationId,
    label: row.label,
    accountCode: row.account_code,
    accountLabel: accountsByCode.get(row.account_code)?.label ?? accountLabel(row.account_code),
    createdAt: row.created_at
  }));
}

function accountCatalog(db, organizationId = defaultOrganizationId) {
  return buildAccountCatalog(readCustomAccounts(db, organizationId));
}

function readCustomAccounts(db, organizationId = defaultOrganizationId) {
  return db.prepare(`
    SELECT *
    FROM custom_accounts
    WHERE organization_id = ?
    ORDER BY code ASC
  `).all(organizationId).map(mapCustomAccount);
}

function readCustomAccount(db, code, organizationId = defaultOrganizationId) {
  const row = db.prepare("SELECT * FROM custom_accounts WHERE code = ? AND organization_id = ?").get(code, organizationId);
  return row ? mapCustomAccount(row) : null;
}

function readAllJournals(db, organizationId = defaultOrganizationId) {
  return db.prepare(`
    SELECT *
    FROM journals
    WHERE organization_id = ?
    ORDER BY code ASC
  `).all(organizationId).map(mapJournal);
}

function readJournal(db, code, organizationId = defaultOrganizationId) {
  const row = db.prepare("SELECT * FROM journals WHERE code = ? AND organization_id = ?").get(code, organizationId);
  return row ? mapJournal(row) : null;
}

function readBatches(db, organizationId = defaultOrganizationId) {
  return db.prepare(`
    SELECT * FROM bank_import_batches
    WHERE organization_id = ?
    ORDER BY created_at DESC
  `).all(organizationId).map(mapBatch);
}

function readBatch(db, batchId) {
  const row = db.prepare("SELECT * FROM bank_import_batches WHERE id = ?").get(batchId);
  return row ? mapBatch(row) : null;
}

function readSubscriptionBatches(db, organizationId = defaultOrganizationId) {
  return db.prepare(`
    SELECT *
    FROM subscription_batches
    WHERE organization_id = ?
    ORDER BY created_at DESC
  `).all(organizationId).map((row) => ({
    id: row.id,
    organizationId: row.organization_id ?? defaultOrganizationId,
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

function readLetteringGroups(db, organizationId = defaultOrganizationId) {
  return db.prepare(`
    SELECT *
    FROM lettering_groups
    WHERE organization_id = ?
    ORDER BY created_at DESC
  `).all(organizationId).map(mapLetteringGroup);
}

function readAuditEvents(db, organizationId = defaultOrganizationId) {
  return db.prepare(`
    SELECT *
    FROM audit_events
    WHERE organization_id = ?
    ORDER BY created_at DESC
    LIMIT 250
  `).all(organizationId).map((row) => ({
    id: row.id,
    actor: row.actor,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    summary: row.summary,
    details: JSON.parse(row.details_json || "{}"),
    createdAt: row.created_at
  }));
}

function readLetteringRows(db, organizationId = defaultOrganizationId) {
  const letteringByLineRef = new Map();
  for (const group of readLetteringGroups(db, organizationId)) {
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
    WHERE journal_entries.organization_id = ?
    ORDER BY journal_entries.date ASC, journal_entries.reference ASC, journal_lines.line_index ASC
  `).all(organizationId).map((row) => {
    const lineRef = `${row.entry_id}:${Number(row.line_index) + 1}`;
    const group = letteringByLineRef.get(lineRef);
    return {
      lineRef,
      entryId: row.entry_id,
      organizationId: row.organization_id ?? defaultOrganizationId,
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

function buildLetteringState(db, accountCode = "", organizationId = defaultOrganizationId) {
  const requestedAccountCode = String(accountCode || "").trim();
  const rows = readLetteringRows(db, organizationId).filter((row) => !requestedAccountCode || row.accountCode === requestedAccountCode);
  return {
    rows,
    groups: readLetteringGroups(db, organizationId).filter((group) => !requestedAccountCode || group.accountCode === requestedAccountCode),
    accountCode: requestedAccountCode || undefined
  };
}

function readEntries(db, organizationId = defaultOrganizationId) {
  return db.prepare(`
    SELECT * FROM journal_entries
    WHERE organization_id = ?
    ORDER BY created_at DESC
  `).all(organizationId).map((row) => readEntryFromRow(db, row));
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
    organizationId: row.organization_id ?? defaultOrganizationId,
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
    (id, organization_id, name, country, currency, fiscal_year_start, fiscal_year_end)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    company.id,
    company.organizationId ?? company.id ?? defaultOrganizationId,
    company.name,
    company.country,
    company.currency,
    company.fiscalYearStart,
    company.fiscalYearEnd
  );
}

function insertOrganization(db, organization) {
  db.prepare(`
    INSERT OR REPLACE INTO organizations
    (id, name, country, currency, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    organization.id,
    organization.name,
    organization.country,
    organization.currency,
    organization.createdAt ?? new Date().toISOString()
  );
}

function insertUser(db, user) {
  db.prepare(`
    INSERT INTO users
    (id, email, name, password_hash, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO NOTHING
  `).run(
    user.id,
    user.email,
    user.name,
    user.passwordHash,
    user.status,
    user.createdAt ?? new Date().toISOString()
  );

  if (user.organizationId && user.role) {
    db.prepare(`
      INSERT INTO organization_users (user_id, organization_id, role)
      VALUES ((SELECT id FROM users WHERE email = ?), ?, ?)
      ON CONFLICT(user_id, organization_id) DO UPDATE SET role = excluded.role
    `).run(user.email, user.organizationId, user.role);
  }
}

function insertPeriod(db, period) {
  db.prepare(`
    INSERT OR REPLACE INTO accounting_periods
    (id, organization_id, name, start_date, end_date, status, locked_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    period.id,
    period.organizationId ?? defaultOrganizationId,
    period.name,
    period.startDate,
    period.endDate,
    period.status,
    period.lockedAt ?? null,
    period.updatedAt ?? new Date().toISOString()
  );
}

function insertJob(db, job) {
  db.prepare(`
    INSERT INTO jobs
    (id, organization_id, type, status, payload_json, result_json, error, created_at, updated_at, started_at, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    job.id,
    job.organizationId ?? defaultOrganizationId,
    job.type,
    job.status,
    JSON.stringify(job.payload ?? {}),
    job.result ? JSON.stringify(job.result) : null,
    job.error ?? null,
    job.createdAt,
    job.updatedAt,
    job.startedAt ?? null,
    job.finishedAt ?? null
  );
}

function insertStoredFile(db, file) {
  db.prepare(`
    INSERT INTO stored_files
    (id, organization_id, name, path, mime_type, size, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(file.id, file.organizationId ?? defaultOrganizationId, file.name, file.path, file.mimeType, file.size, file.createdAt);
}

function insertEntry(db, entry) {
  db.prepare(`
    INSERT OR REPLACE INTO journal_entries
    (id, organization_id, date, reference, description, source, batch_id, bank_fingerprint, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id,
    entry.organizationId ?? defaultOrganizationId,
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
    (code, organization_id, label, account_code, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    auxiliary.code,
    auxiliary.organizationId ?? defaultOrganizationId,
    auxiliary.label,
    auxiliary.accountCode,
    auxiliary.createdAt ?? new Date().toISOString()
  );
}

function insertCustomAccount(db, account) {
  db.prepare(`
    INSERT OR REPLACE INTO custom_accounts
    (code, organization_id, label, type, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    account.code,
    account.organizationId ?? defaultOrganizationId,
    account.label,
    account.type,
    account.createdAt ?? new Date().toISOString()
  );
}

function insertJournal(db, journal) {
  db.prepare(`
    INSERT OR REPLACE INTO journals
    (code, organization_id, label, type, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    journal.code,
    journal.organizationId ?? defaultOrganizationId,
    journal.label,
    journal.type,
    journal.status ?? "active",
    journal.createdAt ?? new Date().toISOString()
  );
}

function insertBatch(db, batch) {
  db.prepare(`
    INSERT OR REPLACE INTO bank_import_batches
    (id, organization_id, created_at, source, status, transaction_count, imported_count, duplicate_count, learned_count, entry_ids_json, voided_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    batch.id,
    batch.organizationId ?? defaultOrganizationId,
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
    (id, organization_id, name, description, start_date, end_date, frequency, entry_count, entry_ids_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    batch.id,
    batch.organizationId ?? defaultOrganizationId,
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
    (id, organization_id, code, account_code, line_refs_json, mode, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    group.id,
    group.organizationId ?? defaultOrganizationId,
    group.code,
    group.accountCode,
    JSON.stringify(group.lineRefs ?? []),
    group.mode,
    group.createdAt ?? new Date().toISOString()
  );
}

function insertAuditEvent(db, event) {
  db.prepare(`
    INSERT INTO audit_events
    (id, organization_id, actor, action, entity_type, entity_id, summary, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id ?? crypto.randomUUID(),
    event.organizationId ?? defaultOrganizationId,
    event.actor ?? "system",
    event.action,
    event.entityType,
    event.entityId,
    event.summary,
    JSON.stringify(event.details ?? {}),
    event.createdAt ?? new Date().toISOString()
  );
}

function createLetteringGroup(db, accountCode, lineRefs, mode, organizationId = defaultOrganizationId) {
  const group = {
    id: crypto.randomUUID(),
    organizationId,
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
    (organization_id, match_text, description, direction, account_code, counterparty_account_code, reason, confidence, learned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    correction.organizationId ?? defaultOrganizationId,
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
    organizationId: row.organization_id ?? defaultOrganizationId,
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

function mapOrganization(row) {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    currency: row.currency,
    createdAt: row.created_at
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
    createdAt: row.created_at
  };
}

function mapAuthToken(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    type: row.type,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at ?? undefined
  };
}

function mapJob(row) {
  return {
    id: row.id,
    organizationId: row.organization_id ?? defaultOrganizationId,
    type: row.type,
    status: row.status,
    payload: JSON.parse(row.payload_json || "{}"),
    result: row.result_json ? JSON.parse(row.result_json) : null,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined
  };
}

function mapStoredFile(row) {
  return {
    id: row.id,
    organizationId: row.organization_id ?? defaultOrganizationId,
    name: row.name,
    path: row.path,
    mimeType: row.mime_type,
    size: row.size,
    createdAt: row.created_at
  };
}

function mapCustomAccount(row) {
  return enrichAccount({
    code: row.code,
    organizationId: row.organization_id ?? defaultOrganizationId,
    label: row.label,
    type: row.type,
    source: "custom",
    createdAt: row.created_at
  });
}

function mapJournal(row) {
  return {
    code: row.code,
    organizationId: row.organization_id ?? defaultOrganizationId,
    label: row.label,
    type: row.type,
    status: row.status,
    createdAt: row.created_at
  };
}

function mapPeriod(row) {
  return {
    id: row.id,
    organizationId: row.organization_id ?? defaultOrganizationId,
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
    organizationId: row.organization_id ?? defaultOrganizationId,
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

function addOrganizationColumnIfMissing(db, table) {
  addColumnIfMissing(db, table, "organization_id", `TEXT NOT NULL DEFAULT '${defaultOrganizationId}'`);
  db.prepare(`UPDATE ${table} SET organization_id = ? WHERE organization_id IS NULL OR organization_id = ''`).run(defaultOrganizationId);
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
