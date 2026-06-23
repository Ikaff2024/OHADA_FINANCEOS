import { accountByCode, buildAccountCatalog, enrichAccount } from "./ohadaChart.js";
import { normalizeJournalEntry } from "./accounting.js";
import { createPostgresRuntime } from "./postgresRuntime.js";
import {
  createSessionToken,
  hashPassword,
  hashToken,
  publicUser,
  verifyPassword
} from "./security.js";
import { sendInvitationEmail, sendPasswordResetEmail } from "./mailer.js";
import { config } from "./config.js";

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
  await pg().run(
    `
    INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `,
    [hashToken(token), user.id, now.toISOString(), expiresAt]
  );

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
  await pg().run("DELETE FROM auth_sessions WHERE token_hash = ?", [hashToken(token)]);
  return { ok: true };
}

export async function readAuthContext(token, activeOrganizationId = null) {
  if (!token) return null;
  const row = await pg().one(
    `
    SELECT users.*
    FROM auth_sessions
    JOIN users ON users.id = auth_sessions.user_id
    WHERE auth_sessions.token_hash = ? AND auth_sessions.expires_at > ?
    LIMIT 1
  `,
    [hashToken(token), new Date().toISOString()]
  );
  if (!row) return null;

  const baseUser = mapUser(row);
  const organizations = await readUserOrganizations(baseUser.id);
  if (organizations.length === 0) return null;

  const requested = activeOrganizationId
    ? organizations.find((organization) => organization.id === activeOrganizationId)
    : null;
  const organizationContext = requested ?? organizations[0];
  const user = {
    ...baseUser,
    organizationId: organizationContext.id,
    role: organizationContext.role
  };

  return {
    user: publicUser(user),
    organization: await readOrganization(user.organizationId),
    availableOrganizations: organizations.map((organization) => ({
      id: organization.id,
      name: organization.name,
      role: organization.role
    }))
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
    await insertCustomAccount(tx, {
      ...account,
      organizationId,
      createdAt: new Date().toISOString()
    });
    await insertAuditEvent(tx, {
      organizationId,
      action: "account.create",
      entityType: "account",
      entityId: account.code,
      summary: `Compte cree: ${account.code} - ${account.label}`,
      details: account
    });
  });

  return {
    ok: true,
    account: (await accountCatalog(organizationId)).find(
      (candidate) => candidate.code === account.code
    )
  };
}

export async function addJournal(input) {
  const organizationId = input.organizationId ?? defaultOrganizationId;
  const journal = {
    code: String(input.code || "")
      .trim()
      .toUpperCase(),
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
    country: String(input.country || "")
      .trim()
      .toUpperCase(),
    currency: String(input.currency || "")
      .trim()
      .toUpperCase(),
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

  return {
    ok: true,
    company: await readCompany(organizationId),
    accountingPeriods: await readPeriods(organizationId)
  };
}

export async function addAuxiliaryAccount(input) {
  const code = String(input.code || "")
    .trim()
    .toUpperCase();
  const label = String(input.label || "").trim();
  const accountCode = String(input.accountCode || "").trim();
  const organizationId = input.organizationId ?? defaultOrganizationId;

  if (!code || code.length < 2)
    return { ok: false, status: 422, error: "Le code auxiliaire est obligatoire." };
  if (!label || label.length < 2)
    return { ok: false, status: 422, error: "Le libelle auxiliaire est obligatoire." };
  if (!accountCode)
    return { ok: false, status: 422, error: "Le compte collectif est obligatoire." };
  if (
    !(await accountCatalog(organizationId)).some(
      (account) => account.code === accountCode && account.isPostable
    )
  ) {
    return {
      ok: false,
      status: 422,
      error: "Le compte collectif doit etre un compte OHADA a 4 chiffres."
    };
  }

  const auxiliary = {
    code,
    organizationId,
    label,
    accountCode,
    createdAt: new Date().toISOString()
  };
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

export async function setAccountingPeriodStatus(
  periodId,
  status,
  organizationId = defaultOrganizationId
) {
  const period = await readPeriod(periodId, organizationId);
  if (!period) return { ok: false, error: "Exercice introuvable." };

  const timestamp = new Date().toISOString();
  await pg().transaction(async (tx) => {
    await tx.run(
      `
      UPDATE accounting_periods
      SET status = ?, locked_at = ?, updated_at = ?
      WHERE id = ? AND organization_id = ?
    `,
      [status, status === "locked" ? timestamp : null, timestamp, periodId, organizationId]
    );
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

export async function addJournalEntry(entry) {
  return (await addJournalEntries([entry]))[0];
}

export async function addJournalEntries(entries) {
  if (entries.length === 0) return [];

  const normalizedEntries = entries.map((entry) => normalizeJournalEntry(entry));
  const organizationId = normalizedEntries[0]?.organizationId ?? defaultOrganizationId;
  for (const entry of normalizedEntries) {
    await ensureKnownJournal(entry.source, organizationId);
  }
  await assertEntriesInOpenPeriods(normalizedEntries);

  await pg().transaction(async (tx) => {
    for (const entry of normalizedEntries) {
      await insertEntry(tx, entry);
    }
    await insertAuditEvent(tx, {
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

export async function updateJournalEntry(entryId, input) {
  const current = await readEntry(entryId);
  if (!current) return { ok: false, status: 404, error: "Ecriture introuvable." };

  const organizationId = current.organizationId ?? defaultOrganizationId;
  const lockedCurrentPeriod = await findLockedPeriodForDate(current.date, organizationId);
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
  await ensureKnownJournal(updated.source, organizationId);
  await assertEntriesInOpenPeriods([updated]);

  await pg().transaction(async (tx) => {
    await insertEntry(tx, updated);
    await insertAuditEvent(tx, {
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

export async function deleteJournalEntry(entryId) {
  const entry = await readEntry(entryId);
  if (!entry) return { ok: false, error: "Ecriture introuvable." };

  const lockedPeriod = await findLockedPeriodForDate(entry.date, entry.organizationId);
  if (lockedPeriod) {
    return { ok: false, status: 423, error: `Periode verrouillee: ${lockedPeriod.name}.` };
  }

  await pg().transaction(async (tx) => {
    await tx.run("DELETE FROM journal_lines WHERE entry_id = ?", [entryId]);
    await tx.run("DELETE FROM journal_entries WHERE id = ?", [entryId]);
    await insertAuditEvent(tx, {
      organizationId: entry.organizationId,
      action: "journal.delete",
      entityType: "journal_entry",
      entityId: entryId,
      summary: `Ecriture supprimee: ${entry.reference} - ${entry.description}`,
      details: { entry }
    });

    if (entry.batchId) {
      const batch = await readBatchWithRuntime(tx, entry.batchId);
      if (batch) {
        const entryIds = batch.entryIds.filter((id) => id !== entryId);
        await tx.run(
          `
          UPDATE bank_import_batches
          SET entry_ids_json = ?, imported_count = ?, status = ?, updated_at = ?
          WHERE id = ?
        `,
          [
            JSON.stringify(entryIds),
            Math.max(0, batch.importedCount - 1),
            entryIds.length === 0 ? "voided" : "partial",
            new Date().toISOString(),
            batch.id
          ]
        );
      }
    }
  });

  return { ok: true, entry };
}

export async function addBankImportBatch(batch) {
  await pg().transaction(async (tx) => {
    await insertBatch(tx, batch);
    await insertAuditEvent(tx, {
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

export async function voidBankImportBatch(batchId, organizationId = defaultOrganizationId) {
  const batch = await readBatchWithRuntime(pg(), batchId);
  if (!batch) return { ok: false, error: "Lot d'import introuvable." };
  if (batch.status === "voided") return { ok: true, batch, removedCount: 0 };

  const entryIds = new Set(batch.entryIds);
  const entries = [];
  for (const entryId of entryIds) {
    const entry = await readEntry(entryId);
    if (entry) entries.push(entry);
  }

  for (const entry of entries) {
    const lockedPeriod = await findLockedPeriodForDate(entry.date, organizationId);
    if (lockedPeriod) {
      return { ok: false, status: 423, error: `Periode verrouillee: ${lockedPeriod.name}.` };
    }
  }

  const before = Number(
    (await pg().one("SELECT COUNT(*)::int AS count FROM journal_entries"))?.count ?? 0
  );
  await pg().transaction(async (tx) => {
    for (const entryId of entryIds) {
      await tx.run("DELETE FROM journal_lines WHERE entry_id = ?", [entryId]);
      await tx.run("DELETE FROM journal_entries WHERE id = ?", [entryId]);
    }
    await tx.run(
      `
      UPDATE bank_import_batches
      SET status = 'voided', voided_at = ?, updated_at = ?
      WHERE id = ? AND organization_id = ?
    `,
      [new Date().toISOString(), new Date().toISOString(), batchId, organizationId]
    );
    await insertAuditEvent(tx, {
      organizationId,
      action: "bank_import.void",
      entityType: "bank_import_batch",
      entityId: batchId,
      summary: `Lot bancaire annule: ${batch.importedCount} ecriture(s) visee(s)`,
      details: batch
    });
  });
  const after = Number(
    (await pg().one("SELECT COUNT(*)::int AS count FROM journal_entries"))?.count ?? 0
  );

  return { ok: true, batch: { ...batch, status: "voided" }, removedCount: before - after };
}

export async function addClassificationCorrections(corrections) {
  if (corrections.length === 0) return [];

  const newCorrections = [];
  await pg().transaction(async (tx) => {
    for (const correction of corrections) {
      const row = await tx.one(
        `
        INSERT INTO classification_corrections
        (organization_id, match_text, description, direction, account_code, counterparty_account_code, reason, confidence, learned_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (organization_id, direction, match_text, account_code) DO NOTHING
        RETURNING *
      `,
        [
          correction.organizationId ?? defaultOrganizationId,
          correction.matchText,
          correction.description,
          correction.direction,
          correction.accountCode,
          correction.counterpartyAccountCode,
          correction.reason,
          correction.confidence,
          correction.learnedAt
        ]
      );
      if (row) {
        newCorrections.push({
          organizationId: row.organization_id ?? defaultOrganizationId,
          matchText: row.match_text,
          description: row.description,
          direction: row.direction,
          accountCode: row.account_code,
          counterpartyAccountCode: row.counterparty_account_code,
          reason: row.reason,
          confidence: Number(row.confidence),
          learnedAt: isoDateTime(row.learned_at)
        });
      }
    }
  });

  return newCorrections;
}

export async function addSubscriptionBatch(batch, entries) {
  const normalizedEntries = entries.map((entry) => normalizeJournalEntry(entry));
  await assertEntriesInOpenPeriods(normalizedEntries);

  await pg().transaction(async (tx) => {
    await insertSubscriptionBatch(tx, {
      ...batch,
      entryIds: normalizedEntries.map((entry) => entry.id)
    });
    for (const entry of normalizedEntries) {
      await insertEntry(tx, entry);
    }
    await insertAuditEvent(tx, {
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

export async function addOrganization(input) {
  const now = new Date().toISOString();
  const id = organizationIdFromName(input.name);
  const organization = {
    id,
    name: String(input.name || "").trim(),
    country: String(input.country || "")
      .trim()
      .toUpperCase(),
    currency: String(input.currency || "")
      .trim()
      .toUpperCase(),
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
  if (await readOrganization(id)) errors.push("Une organisation avec ce nom existe deja.");
  if (await readUserByEmail(owner.email)) errors.push("Cet email utilisateur existe deja.");
  if (errors.length > 0) return { ok: false, status: 422, errors };

  const period = {
    id: periodIdForCompany(company),
    organizationId: id,
    name: "Exercice " + company.fiscalYearStart.slice(0, 4),
    startDate: company.fiscalYearStart,
    endDate: company.fiscalYearEnd,
    status: "open",
    updatedAt: now
  };

  await pg().transaction(async (tx) => {
    await tx.run(
      "INSERT INTO organizations (id, name, country, currency, created_at) VALUES (?, ?, ?, ?, ?)",
      [
        organization.id,
        organization.name,
        organization.country,
        organization.currency,
        organization.createdAt
      ]
    );

    await insertCompany(tx, company);
    await insertPeriod(tx, period);

    const defaultJournals = [
      { code: "OD", label: "Operations diverses", type: "misc", status: "active", createdAt: now },
      { code: "BQ", label: "Banque", type: "bank", status: "active", createdAt: now },
      { code: "VT", label: "Ventes", type: "sales", status: "active", createdAt: now },
      { code: "AC", label: "Achats", type: "purchase", status: "active", createdAt: now }
    ];
    for (const journal of defaultJournals) {
      await insertJournal(tx, { ...journal, organizationId: id });
    }

    await insertUser(tx, owner);

    await insertAuditEvent(tx, {
      organizationId: id,
      action: "organization.create",
      entityType: "organization",
      entityId: id,
      summary: "Organisation creee: " + organization.name,
      details: { organization, company, ownerEmail: owner.email }
    });
  });

  return { ok: true, organization, company, owner: publicUser(owner) };
}

export async function addUser(input) {
  const organizationId = String(input.organizationId || "demo-company").trim();
  const organization = await readOrganization(organizationId);
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

  const errors = validateUser(user, input.password);
  const existingUser = await readUserByEmail(user.email);
  if (existingUser) {
    const existingRole = await readUserInOrganization(existingUser.id, organizationId);
    if (existingRole)
      return { ok: false, status: 409, error: "Cet utilisateur est deja dans l'organisation." };
    user.id = existingUser.id;
    user.passwordHash = existingUser.passwordHash;
    user.status = existingUser.status;
    user.createdAt = existingUser.createdAt;
  }
  if (!existingUser && errors.length > 0) return { ok: false, status: 422, errors };

  await pg().transaction(async (tx) => {
    await insertUser(tx, user);
  });
  return { ok: true, user: publicUser(user) };
}

export async function inviteUser(input) {
  const organizationId = String(input.organizationId || "demo-company").trim();
  const organization = await readOrganization(organizationId);
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
  const existingUser = await readUserByEmail(user.email);
  if (existingUser) {
    const existingRole = await readUserInOrganization(existingUser.id, organizationId);
    if (existingRole)
      return { ok: false, status: 409, error: "Cet utilisateur est deja dans l'organisation." };
    user.id = existingUser.id;
    user.passwordHash = existingUser.passwordHash;
    user.status = existingUser.status;
    user.createdAt = existingUser.createdAt;
  }

  let invitation;
  await pg().transaction(async (tx) => {
    await insertUser(tx, user);
    invitation = await createAuthToken(tx, user, "invitation", 7 * 24);
    await insertAuditEvent(tx, {
      organizationId,
      action: "user.invite",
      entityType: "user",
      entityId: user.id,
      summary: "Invitation utilisateur: " + user.email,
      details: { user: publicUser(user), expiresAt: invitation.expiresAt }
    });
  });

  sendInvitationEmail(user, invitation.token).catch(console.error);

  return {
    ok: true,
    user: publicUser(user),
    ...(config.exposeAuthTokens ? { invitation } : {})
  };
}

export async function acceptInvitation(input) {
  const token = await readValidAuthToken(input.token, "invitation");
  if (!token) return { ok: false, status: 422, error: "Invitation invalide ou expiree." };
  const user = await readUserInOrganization(token.userId, token.organizationId);
  if (!user) return { ok: false, status: 404, error: "Utilisateur introuvable." };
  const errors = validatePassword(input.password);
  if (errors.length > 0) return { ok: false, status: 422, errors };

  await pg().transaction(async (tx) => {
    await tx.run("UPDATE users SET password_hash = ?, status = 'active' WHERE id = ?", [
      hashPassword(input.password),
      user.id
    ]);
    await consumeAuthToken(tx, token.id);
    await insertAuditEvent(tx, {
      organizationId: user.organizationId,
      action: "user.accept_invitation",
      entityType: "user",
      entityId: user.id,
      summary: "Invitation acceptee: " + user.email,
      details: { userId: user.id }
    });
  });

  return {
    ok: true,
    user: publicUser(await readUserInOrganization(user.id, token.organizationId))
  };
}

export async function requestPasswordReset(input) {
  const user = await readUserByEmail(normalizeEmail(input.email));
  if (!user || user.status !== "active") {
    return { ok: true, message: "Si le compte existe, un lien de reinitialisation est prepare." };
  }

  let reset;
  await pg().transaction(async (tx) => {
    reset = await createAuthToken(tx, user, "password_reset", 2);
    await insertAuditEvent(tx, {
      organizationId: user.organizationId,
      action: "user.password_reset_request",
      entityType: "user",
      entityId: user.id,
      summary: "Reinitialisation demandee: " + user.email,
      details: { expiresAt: reset.expiresAt }
    });
  });

  sendPasswordResetEmail(user, reset.token).catch(console.error);

  return {
    ok: true,
    message: "Si le compte existe, un lien de reinitialisation a ete envoye.",
    ...(config.exposeAuthTokens ? { reset } : {})
  };
}

export async function resetPassword(input) {
  const token = await readValidAuthToken(input.token, "password_reset");
  if (!token)
    return { ok: false, status: 422, error: "Lien de reinitialisation invalide ou expire." };
  const user = await readUserInOrganization(token.userId, token.organizationId);
  if (!user) return { ok: false, status: 404, error: "Utilisateur introuvable." };
  const errors = validatePassword(input.password);
  if (errors.length > 0) return { ok: false, status: 422, errors };

  await pg().transaction(async (tx) => {
    await tx.run("UPDATE users SET password_hash = ? WHERE id = ?", [
      hashPassword(input.password),
      user.id
    ]);
    await tx.run("DELETE FROM auth_sessions WHERE user_id = ?", [user.id]);
    await consumeAuthToken(tx, token.id);
    await insertAuditEvent(tx, {
      organizationId: user.organizationId,
      action: "user.password_reset",
      entityType: "user",
      entityId: user.id,
      summary: "Mot de passe reinitialise: " + user.email,
      details: { userId: user.id }
    });
  });

  return { ok: true };
}

export async function updateUser(userId, input, actor) {
  const organizationId =
    actor?.organization?.id ?? actor?.user?.organizationId ?? defaultOrganizationId;
  const current = await readUserInOrganization(userId, organizationId);
  if (!current) return { ok: false, status: 404, error: "Utilisateur introuvable." };

  const next = {
    ...current,
    name: String(input.name ?? current.name).trim(),
    role: ["owner", "admin", "accountant", "viewer"].includes(input.role)
      ? input.role
      : current.role,
    status: ["active", "disabled"].includes(input.status) ? input.status : current.status
  };

  if (current.id === actor?.user?.id && next.status !== "active") {
    return { ok: false, status: 422, error: "Vous ne pouvez pas desactiver votre propre compte." };
  }

  const ownerCount = await readOwnerCount(organizationId);
  if (current.role === "owner" && next.role !== "owner" && ownerCount <= 1) {
    return {
      ok: false,
      status: 422,
      error: "Une organisation doit conserver au moins un proprietaire."
    };
  }

  if (current.role === "owner" && next.status !== "active" && ownerCount <= 1) {
    return {
      ok: false,
      status: 422,
      error: "Une organisation doit conserver au moins un proprietaire actif."
    };
  }

  if (next.name.length < 2)
    return { ok: false, status: 422, error: "Le nom utilisateur est obligatoire." };

  await pg().transaction(async (tx) => {
    await tx.run("UPDATE users SET name = ?, status = ? WHERE id = ?", [
      next.name,
      next.status,
      current.id
    ]);
    await tx.run(
      "UPDATE organization_users SET role = ? WHERE user_id = ? AND organization_id = ?",
      [next.role, current.id, organizationId]
    );
  });

  return { ok: true, user: publicUser(await readUserInOrganization(current.id, organizationId)) };
}

export async function enqueueJob(input) {
  const job = {
    id: crypto.randomUUID(),
    organizationId: input.organizationId ?? defaultOrganizationId,
    type: String(input.type || "").trim(),
    status: "queued",
    payload: input.payload ?? {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!job.type) return { ok: false, status: 422, error: "Le type de job est obligatoire." };

  await pg().run(
    "INSERT INTO jobs (id, organization_id, type, status, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      job.id,
      job.organizationId,
      job.type,
      job.status,
      JSON.stringify(job.payload),
      job.createdAt,
      job.updatedAt
    ]
  );

  return { ok: true, job };
}

export async function claimNextJob() {
  const jobRow = await pg().one(
    "UPDATE jobs SET status = 'running', started_at = ?, updated_at = ? WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *",
    [new Date().toISOString(), new Date().toISOString()]
  );

  return jobRow ? mapJob(jobRow) : null;
}

export async function completeJob(jobId, result) {
  const now = new Date().toISOString();
  await pg().run(
    "UPDATE jobs SET status = 'done', result_json = ?, error = NULL, finished_at = ?, updated_at = ? WHERE id = ?",
    [JSON.stringify(result ?? {}), now, now, jobId]
  );
  return { ok: true };
}

export async function failJob(jobId, error) {
  const now = new Date().toISOString();
  await pg().run(
    "UPDATE jobs SET status = 'failed', error = ?, finished_at = ?, updated_at = ? WHERE id = ?",
    [String(error || "Erreur job"), now, now, jobId]
  );
  return { ok: true };
}

export async function saveTextFile(input) {
  const { join, relative } = await import("node:path");
  const { mkdir, stat, writeFile } = await import("node:fs/promises");
  const { rootDir } = await import("./config.js");

  const name = String(input.name || "").trim();
  const content = String(input.content ?? "");
  const mimeType = String(input.mimeType || "text/plain").trim();
  if (!name) return { ok: false, status: 422, error: "Le nom du fichier est obligatoire." };

  const id = crypto.randomUUID();
  const safeName = name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const fullPath = join(config.storageDir, `${id}-${safeName}`);
  await mkdir(config.storageDir, { recursive: true });
  await writeFile(fullPath, content, "utf8");
  const fileStats = await stat(fullPath);

  const file = {
    id,
    organizationId: input.organizationId ?? defaultOrganizationId,
    name,
    path: relative(rootDir, fullPath),
    mimeType,
    size: fileStats.size,
    createdAt: new Date().toISOString()
  };

  await pg().run(
    "INSERT INTO stored_files (id, organization_id, name, path, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [file.id, file.organizationId, file.name, file.path, file.mimeType, file.size, file.createdAt]
  );

  return { ok: true, file };
}

export async function readStoredFileContent(fileId, organizationId = defaultOrganizationId) {
  const { join } = await import("node:path");
  const { readFile } = await import("node:fs/promises");
  const { rootDir } = await import("./config.js");

  const row = await pg().one("SELECT * FROM stored_files WHERE id = ? AND organization_id = ?", [
    fileId,
    organizationId
  ]);
  if (!row) return null;
  const file = mapStoredFile(row);
  return {
    file,
    content: await readFile(join(rootDir, file.path))
  };
}

export async function readLetteringState(accountCode = "", organizationId = defaultOrganizationId) {
  return buildLetteringState(accountCode, organizationId);
}

export async function addManualLettering(input) {
  const organizationId = input.organizationId ?? defaultOrganizationId;
  const selectedRefs = Array.isArray(input.lineRefs)
    ? [...new Set(input.lineRefs.map((ref) => String(ref || "").trim()).filter(Boolean))]
    : [];

  if (selectedRefs.length < 2) {
    return { ok: false, status: 422, error: "Selectionnez au moins deux lignes a lettrer." };
  }

  const rows = await readLetteringRows(organizationId);
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
    return {
      ok: false,
      status: 422,
      error: "Le debit et le credit selectionnes doivent etre equilibres."
    };
  }

  let group;
  await pg().transaction(async (tx) => {
    group = await createLetteringGroup(
      tx,
      firstAccountCode,
      selectedRefs,
      "manual",
      organizationId
    );
    await insertAuditEvent(tx, {
      organizationId,
      action: "lettering.manual",
      entityType: "lettering_group",
      entityId: group.id,
      summary: "Lettrage manuel " + group.code + " sur " + firstAccountCode,
      details: group
    });
  });
  return { ok: true, group, rows: await buildLetteringState(firstAccountCode, organizationId) };
}

export async function addAutomaticLettering(input = {}) {
  const organizationId = input.organizationId ?? defaultOrganizationId;
  const requestedAccountCode = String(input.accountCode || "").trim();
  const rows = (await readLetteringRows(organizationId))
    .filter((row) => !row.letteringCode)
    .filter((row) => !requestedAccountCode || row.accountCode === requestedAccountCode)
    .filter((row) => row.debit > 0 || row.credit > 0);

  const groups = [];
  await pg().transaction(async (tx) => {
    for (const rowsForAccount of groupRowsByAccount(rows).values()) {
      for (const match of matchLetteringPairs(rowsForAccount)) {
        groups.push(
          await createLetteringGroup(
            tx,
            match[0].accountCode,
            match.map((row) => row.lineRef),
            "automatic",
            organizationId
          )
        );
      }
    }
    if (groups.length > 0) {
      await insertAuditEvent(tx, {
        organizationId,
        action: "lettering.auto",
        entityType: "lettering_group",
        entityId: "automatic",
        summary: "Lettrage automatique: " + groups.length + " groupe(s)",
        details: { groups }
      });
    }
  });

  return {
    ok: true,
    groups,
    matchedLineCount: groups.reduce((count, group) => count + group.lineRefs.length, 0),
    rows: await buildLetteringState(requestedAccountCode, organizationId)
  };
}

async function readUserById(id) {
  const row = await pg().one("SELECT * FROM users WHERE id = ?", [id]);
  return row ? mapUser(row) : null;
}

async function readUserInOrganization(userId, organizationId) {
  const row = await pg().one(
    `
    SELECT u.*, ou.organization_id, ou.role
    FROM users u
    JOIN organization_users ou ON u.id = ou.user_id
    WHERE u.id = ? AND ou.organization_id = ?
    LIMIT 1
  `,
    [userId, organizationId]
  );
  return row ? mapUser(row) : null;
}

async function readUserOrganizations(userId) {
  return pg().many(
    `
    SELECT o.*, ou.role
    FROM organizations o
    JOIN organization_users ou ON o.id = ou.organization_id
    WHERE ou.user_id = ?
    ORDER BY o.created_at ASC
  `,
    [userId]
  );
}

async function readOwnerCount(organizationId) {
  const row = await pg().one(
    `
    SELECT COUNT(*)::int AS count
    FROM users u
    JOIN organization_users ou ON u.id = ou.user_id
    WHERE ou.organization_id = ? AND ou.role = 'owner' AND u.status = 'active'
  `,
    [organizationId]
  );
  return Number(row?.count || 0);
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
  return base || "org-" + crypto.randomUUID().slice(0, 8);
}

function validateOrganization(organization) {
  const errors = [];
  if (organization.name.length < 2) errors.push("Le nom de l'organisation est obligatoire.");
  if (!/^[A-Z]{2,3}$/.test(organization.country))
    errors.push("Le pays de l'organisation doit etre renseigne avec un code court, ex: CI.");
  if (!/^[A-Z]{3}$/.test(organization.currency))
    errors.push("La devise de l'organisation doit etre un code a 3 lettres, ex: XOF.");
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
  if (String(password || "").length < 8)
    errors.push("Le mot de passe doit contenir au moins 8 caracteres.");
  return errors;
}

async function createAuthToken(tx, user, type, hours) {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + hours * 3600000).toISOString();
  await tx.run(
    "INSERT INTO auth_tokens (id, organization_id, user_id, type, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      crypto.randomUUID(),
      user.organizationId,
      user.id,
      type,
      hashToken(token),
      now.toISOString(),
      expiresAt
    ]
  );
  return {
    expiresAt,
    url: "/?" + (type === "invitation" ? "invite" : "reset") + "=" + encodeURIComponent(token),
    token
  };
}

async function insertUser(database, user) {
  await database.run(
    `
    INSERT INTO users
    (id, email, name, password_hash, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (email) DO NOTHING
  `,
    [
      user.id,
      user.email,
      user.name,
      user.passwordHash,
      user.status,
      user.createdAt ?? new Date().toISOString()
    ]
  );

  if (user.organizationId && user.role) {
    await database.run(
      `
      INSERT INTO organization_users (user_id, organization_id, role)
      VALUES ((SELECT id FROM users WHERE email = ?), ?, ?)
      ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role
    `,
      [user.email, user.organizationId, user.role]
    );
  }
}

async function readValidAuthToken(token, type) {
  const row = await pg().one(
    "SELECT * FROM auth_tokens WHERE token_hash = ? AND type = ? AND used_at IS NULL AND expires_at > ? LIMIT 1",
    [hashToken(token), type, new Date().toISOString()]
  );
  return row ? { id: row.id, organizationId: row.organization_id, userId: row.user_id } : null;
}

async function consumeAuthToken(tx, tokenId) {
  await tx.run("UPDATE auth_tokens SET used_at = ? WHERE id = ?", [
    new Date().toISOString(),
    tokenId
  ]);
}

async function readLetteringRows(organizationId = defaultOrganizationId) {
  const groups = await readLetteringGroups(organizationId);
  const letteringByLineRef = new Map();
  for (const group of groups) {
    for (const ref of group.lineRefs) {
      letteringByLineRef.set(ref, group);
    }
  }

  const rows = await pg().many(
    `
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
  `,
    [organizationId]
  );

  return rows.map((row) => {
    const lineRef = row.entry_id + ":" + (Number(row.line_index) + 1);
    const group = letteringByLineRef.get(lineRef);
    return {
      lineRef,
      entryId: row.entry_id,
      organizationId: row.organization_id ?? defaultOrganizationId,
      lineIndex: Number(row.line_index) + 1,
      date: dateOnly(row.date),
      reference: row.reference || fallbackReference(row),
      source: row.source,
      description: row.description,
      accountCode: row.account_code,
      accountLabel: accountLabel(row.account_code),
      auxiliaryCode: row.auxiliary_code ?? undefined,
      auxiliaryLabel: row.auxiliary_label ?? undefined,
      label: row.label,
      debit: Number(row.debit),
      credit: Number(row.credit),
      letteringCode: group?.code,
      letteringMode: group?.mode,
      letteringCreatedAt: group?.createdAt
    };
  });
}

async function buildLetteringState(accountCode = "", organizationId = defaultOrganizationId) {
  const requestedAccountCode = String(accountCode || "").trim();
  const rows = (await readLetteringRows(organizationId)).filter(
    (row) => !requestedAccountCode || row.accountCode === requestedAccountCode
  );
  return {
    rows,
    groups: (await readLetteringGroups(organizationId)).filter(
      (group) => !requestedAccountCode || group.accountCode === requestedAccountCode
    ),
    accountCode: requestedAccountCode || undefined
  };
}

function sumLetteringRows(rows) {
  return rows.reduce(
    (acc, row) => ({ debit: acc.debit + row.debit, credit: acc.credit + row.credit }),
    { debit: 0, credit: 0 }
  );
}

function groupRowsByAccount(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.accountCode)) map.set(row.accountCode, []);
    map.get(row.accountCode).push(row);
  }
  return map;
}

function matchLetteringPairs(rows) {
  const matches = [];
  const unmatched = new Set(rows);
  for (const row1 of unmatched) {
    unmatched.delete(row1);
    const amount = row1.debit || row1.credit;
    for (const row2 of unmatched) {
      const amount2 = row2.debit || row2.credit;
      if (
        amount === amount2 &&
        ((row1.debit > 0 && row2.credit > 0) || (row1.credit > 0 && row2.debit > 0))
      ) {
        matches.push([row1, row2]);
        unmatched.delete(row2);
        break;
      }
    }
  }
  return matches;
}

async function nextLetteringCode(tx) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const row = await (tx || pg()).one("SELECT COUNT(*)::int AS count FROM lettering_groups");
  let num = Number(row?.count || 0);
  let code = "";
  do {
    code = chars[num % 26] + code;
    num = Math.floor(num / 26) - 1;
  } while (num >= 0);
  return code;
}

async function createLetteringGroup(
  tx,
  accountCode,
  lineRefs,
  mode,
  organizationId = defaultOrganizationId
) {
  const group = {
    id: crypto.randomUUID(),
    organizationId,
    code: await nextLetteringCode(tx),
    accountCode,
    lineRefs,
    mode,
    createdAt: new Date().toISOString()
  };
  await tx.run(
    "INSERT INTO lettering_groups (id, organization_id, code, account_code, line_refs_json, mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      group.id,
      group.organizationId,
      group.code,
      group.accountCode,
      JSON.stringify(group.lineRefs),
      group.mode,
      group.createdAt
    ]
  );
  return group;
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
  const row =
    (await pg().one("SELECT * FROM companies WHERE organization_id = ? LIMIT 1", [
      organizationId
    ])) ?? (await pg().one("SELECT * FROM companies LIMIT 1"));
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
  const row = await database.one(
    "SELECT * FROM accounting_periods WHERE id = ? AND organization_id = ?",
    [periodId, organizationId]
  );
  return row ? mapPeriod(row) : null;
}

async function readAllOrganizations() {
  return (
    await pg().many(`
    SELECT *
    FROM organizations
    ORDER BY created_at ASC
  `)
  ).map(mapOrganization);
}

async function readOrganization(organizationId) {
  const row = await pg().one("SELECT * FROM organizations WHERE id = ?", [organizationId]);
  return row ? mapOrganization(row) : null;
}

async function readAllUsers(organizationId = null) {
  if (organizationId) {
    return (
      await pg().many(
        `
      SELECT u.*, ou.organization_id, ou.role
      FROM users u
      JOIN organization_users ou ON u.id = ou.user_id
      WHERE ou.organization_id = ?
      ORDER BY u.created_at ASC
    `,
        [organizationId]
      )
    ).map(mapUser);
  }
  return (
    await pg().many(`
    SELECT *
    FROM users
    ORDER BY created_at ASC
  `)
  ).map(mapUser);
}

async function readUserByEmail(email) {
  const row = await pg().one(
    `
    SELECT u.*, ou.organization_id, ou.role
    FROM users u
    LEFT JOIN organization_users ou ON u.id = ou.user_id
    WHERE u.email = ?
    ORDER BY u.created_at ASC
    LIMIT 1
  `,
    [email]
  );
  return row ? mapUser(row) : null;
}

export async function readJobs(organizationId = defaultOrganizationId) {
  return (
    await pg().many(
      `
    SELECT *
    FROM jobs
    WHERE organization_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `,
      [organizationId]
    )
  ).map(mapJob);
}

export async function readStoredFiles(organizationId = defaultOrganizationId) {
  return (
    await pg().many(
      `
    SELECT *
    FROM stored_files
    WHERE organization_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `,
      [organizationId]
    )
  ).map(mapStoredFile);
}

async function readPeriods(organizationId = defaultOrganizationId) {
  return (
    await pg().many(
      `
    SELECT *
    FROM accounting_periods
    WHERE organization_id = ?
    ORDER BY start_date ASC
  `,
      [organizationId]
    )
  ).map(mapPeriod);
}

async function accountCatalog(organizationId = defaultOrganizationId) {
  return buildAccountCatalog(await readCustomAccounts(organizationId));
}

async function readCustomAccounts(organizationId = defaultOrganizationId) {
  return (
    await pg().many(
      `
    SELECT *
    FROM custom_accounts
    WHERE organization_id = ?
    ORDER BY code ASC
  `,
      [organizationId]
    )
  ).map(mapCustomAccount);
}

async function readCustomAccount(code, organizationId = defaultOrganizationId) {
  const row = await pg().one(
    "SELECT * FROM custom_accounts WHERE code = ? AND organization_id = ?",
    [code, organizationId]
  );
  return row ? mapCustomAccount(row) : null;
}

async function readAllJournals(organizationId = defaultOrganizationId) {
  return (
    await pg().many(
      `
    SELECT *
    FROM journals
    WHERE organization_id = ?
    ORDER BY code ASC
  `,
      [organizationId]
    )
  ).map(mapJournal);
}

async function readJournal(code, organizationId = defaultOrganizationId) {
  const row = await pg().one("SELECT * FROM journals WHERE code = ? AND organization_id = ?", [
    code,
    organizationId
  ]);
  return row ? mapJournal(row) : null;
}

async function readAuxiliaryAccounts(organizationId = defaultOrganizationId) {
  const accountsByCode = new Map(
    (await accountCatalog(organizationId)).map((account) => [account.code, account])
  );
  return (
    await pg().many(
      `
    SELECT *
    FROM auxiliary_accounts
    WHERE organization_id = ?
    ORDER BY account_code ASC, code ASC
  `,
      [organizationId]
    )
  ).map((row) => ({
    code: row.code,
    organizationId: row.organization_id ?? defaultOrganizationId,
    label: row.label,
    accountCode: row.account_code,
    accountLabel: accountsByCode.get(row.account_code)?.label ?? accountLabel(row.account_code),
    createdAt: isoDateTime(row.created_at)
  }));
}

async function readCorrections(organizationId = defaultOrganizationId) {
  return (
    await pg().many(
      `
    SELECT *
    FROM classification_corrections
    WHERE organization_id = ?
    ORDER BY learned_at DESC
  `,
      [organizationId]
    )
  ).map((row) => ({
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
  return (
    await pg().many(
      `
    SELECT *
    FROM bank_import_batches
    WHERE organization_id = ?
    ORDER BY created_at DESC
  `,
      [organizationId]
    )
  ).map(mapBatch);
}

async function readBatchWithRuntime(database, batchId) {
  const row = await database.one("SELECT * FROM bank_import_batches WHERE id = ?", [batchId]);
  return row ? mapBatch(row) : null;
}

async function readSubscriptionBatches(organizationId = defaultOrganizationId) {
  return (
    await pg().many(
      `
    SELECT *
    FROM subscription_batches
    WHERE organization_id = ?
    ORDER BY created_at DESC
  `,
      [organizationId]
    )
  ).map((row) => ({
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
  return (
    await pg().many(
      `
    SELECT *
    FROM lettering_groups
    WHERE organization_id = ?
    ORDER BY created_at DESC
  `,
      [organizationId]
    )
  ).map(mapLetteringGroup);
}

async function readAuditEvents(organizationId = defaultOrganizationId) {
  return (
    await pg().many(
      `
    SELECT *
    FROM audit_events
    WHERE organization_id = ?
    ORDER BY created_at DESC
    LIMIT 250
  `,
      [organizationId]
    )
  ).map((row) => ({
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
  const rows = await pg().many(
    `
    SELECT *
    FROM journal_entries
    WHERE organization_id = ?
    ORDER BY created_at DESC
  `,
    [organizationId]
  );
  const entries = [];
  for (const row of rows) entries.push(await readEntryFromRow(row));
  return entries;
}

async function readEntry(entryId) {
  const row = await pg().one("SELECT * FROM journal_entries WHERE id = ?", [entryId]);
  return row ? readEntryFromRow(row) : null;
}

async function readEntryFromRow(row) {
  const lines = await pg().many(
    `
    SELECT *
    FROM journal_lines
    WHERE entry_id = ?
    ORDER BY line_index ASC
  `,
    [row.id]
  );

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

async function ensureKnownJournal(code, organizationId) {
  const journalCode = String(code || "manual").trim();
  if (["manual", "seed", "subscription", "bank-csv"].includes(journalCode)) return;
  if (!(await readJournal(journalCode, organizationId))) {
    const error = new Error(`Journal inconnu: ${journalCode}.`);
    error.status = 422;
    throw error;
  }
}

async function assertEntriesInOpenPeriods(entries) {
  for (const entry of entries) {
    const lockedPeriod = await findLockedPeriodForDate(entry.date, entry.organizationId);
    if (lockedPeriod) {
      const error = new Error(`Periode verrouillee: ${lockedPeriod.name}.`);
      error.status = 423;
      throw error;
    }
  }
}

async function findLockedPeriodForDate(date, organizationId = defaultOrganizationId) {
  const row = await pg().one(
    `
    SELECT *
    FROM accounting_periods
    WHERE organization_id = ? AND status = 'locked' AND ? BETWEEN start_date AND end_date
    LIMIT 1
  `,
    [organizationId ?? defaultOrganizationId, date]
  );
  return row ? mapPeriod(row) : null;
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
  await database.run(
    `
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
  `,
    [
      company.id,
      company.organizationId ?? company.id ?? defaultOrganizationId,
      company.name,
      company.country,
      company.currency,
      company.fiscalYearStart,
      company.fiscalYearEnd
    ]
  );
}

async function insertPeriod(database, period) {
  await database.run(
    `
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
  `,
    [
      period.id,
      period.organizationId ?? defaultOrganizationId,
      period.name,
      period.startDate,
      period.endDate,
      period.status,
      period.lockedAt ?? null,
      period.updatedAt ?? new Date().toISOString()
    ]
  );
}

async function insertAuxiliaryAccount(database, auxiliary) {
  await database.run(
    `
    INSERT INTO auxiliary_accounts
    (code, organization_id, label, account_code, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (code) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      label = EXCLUDED.label,
      account_code = EXCLUDED.account_code,
      created_at = EXCLUDED.created_at
  `,
    [
      auxiliary.code,
      auxiliary.organizationId ?? defaultOrganizationId,
      auxiliary.label,
      auxiliary.accountCode,
      auxiliary.createdAt ?? new Date().toISOString()
    ]
  );
}

async function insertCustomAccount(database, account) {
  await database.run(
    `
    INSERT INTO custom_accounts
    (code, organization_id, label, type, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (organization_id, code) DO UPDATE SET
      label = EXCLUDED.label,
      type = EXCLUDED.type,
      created_at = EXCLUDED.created_at
  `,
    [
      account.code,
      account.organizationId ?? defaultOrganizationId,
      account.label,
      account.type,
      account.createdAt ?? new Date().toISOString()
    ]
  );
}

async function insertJournal(database, journal) {
  await database.run(
    `
    INSERT INTO journals
    (code, organization_id, label, type, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (organization_id, code) DO UPDATE SET
      label = EXCLUDED.label,
      type = EXCLUDED.type,
      status = EXCLUDED.status,
      created_at = EXCLUDED.created_at
  `,
    [
      journal.code,
      journal.organizationId ?? defaultOrganizationId,
      journal.label,
      journal.type,
      journal.status ?? "active",
      journal.createdAt ?? new Date().toISOString()
    ]
  );
}

async function insertAuditEvent(database, event) {
  await database.run(
    `
    INSERT INTO audit_events
    (id, organization_id, actor, action, entity_type, entity_id, summary, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      event.id ?? crypto.randomUUID(),
      event.organizationId ?? defaultOrganizationId,
      event.actor ?? "system",
      event.action,
      event.entityType,
      event.entityId,
      event.summary,
      JSON.stringify(event.details ?? {}),
      event.createdAt ?? new Date().toISOString()
    ]
  );
}

async function insertEntry(database, entry) {
  await database.run(
    `
    INSERT INTO journal_entries
    (id, organization_id, date, reference, description, source, batch_id, bank_fingerprint, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      date = EXCLUDED.date,
      reference = EXCLUDED.reference,
      description = EXCLUDED.description,
      source = EXCLUDED.source,
      batch_id = EXCLUDED.batch_id,
      bank_fingerprint = EXCLUDED.bank_fingerprint,
      created_at = EXCLUDED.created_at
  `,
    [
      entry.id,
      entry.organizationId ?? defaultOrganizationId,
      entry.date,
      entry.reference ?? fallbackReference(entry),
      entry.description,
      entry.source,
      entry.batchId ?? null,
      entry.bankFingerprint ?? null,
      entry.createdAt
    ]
  );

  await database.run("DELETE FROM journal_lines WHERE entry_id = ?", [entry.id]);
  const nextIdRow = await database.one(
    "SELECT COALESCE(MAX(id), 0)::int + 1 AS id FROM journal_lines"
  );
  let nextLineId = Number(nextIdRow?.id || 1);
  for (const [index, line] of entry.lines.entries()) {
    await database.run(
      `
      INSERT INTO journal_lines
      (id, entry_id, line_index, account_code, auxiliary_code, label, debit, credit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        nextLineId,
        entry.id,
        index,
        line.accountCode,
        line.auxiliaryCode ?? null,
        line.label,
        line.debit,
        line.credit
      ]
    );
    nextLineId += 1;
  }
}

async function insertBatch(database, batch) {
  await database.run(
    `
    INSERT INTO bank_import_batches
    (id, organization_id, created_at, source, status, transaction_count, imported_count, duplicate_count, learned_count, entry_ids_json, voided_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      created_at = EXCLUDED.created_at,
      source = EXCLUDED.source,
      status = EXCLUDED.status,
      transaction_count = EXCLUDED.transaction_count,
      imported_count = EXCLUDED.imported_count,
      duplicate_count = EXCLUDED.duplicate_count,
      learned_count = EXCLUDED.learned_count,
      entry_ids_json = EXCLUDED.entry_ids_json,
      voided_at = EXCLUDED.voided_at,
      updated_at = EXCLUDED.updated_at
  `,
    [
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
    ]
  );
}

async function insertSubscriptionBatch(database, batch) {
  await database.run(
    `
    INSERT INTO subscription_batches
    (id, organization_id, name, description, start_date, end_date, frequency, entry_count, entry_ids_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      frequency = EXCLUDED.frequency,
      entry_count = EXCLUDED.entry_count,
      entry_ids_json = EXCLUDED.entry_ids_json,
      created_at = EXCLUDED.created_at
  `,
    [
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
    ]
  );
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
  const latest = await pg().one(
    `
    SELECT *
    FROM accounting_periods
    WHERE organization_id = ?
    ORDER BY end_date DESC
    LIMIT 1
  `,
    [organizationId]
  );
  const nextRange = latest
    ? nextPeriodRange(mapPeriod(latest))
    : nextPeriodRange(await readCompany(organizationId));
  const startDate = String(input.startDate || nextRange.startDate).trim();
  const endDate = String(input.endDate || nextRange.endDate).trim();
  const year = startDate.slice(0, 4);

  return {
    id: String(
      input.id || periodIdForCompany({ organizationId, fiscalYearStart: startDate })
    ).trim(),
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
  if (!/^[A-Z]{2,3}$/.test(company.country))
    errors.push("Le pays doit etre renseigne avec un code court, ex: CI.");
  if (!/^[A-Z]{3}$/.test(company.currency))
    errors.push("La devise doit etre un code a 3 lettres, ex: XOF.");
  if (!isIsoDate(company.fiscalYearStart)) errors.push("La date de debut d'exercice est invalide.");
  if (!isIsoDate(company.fiscalYearEnd)) errors.push("La date de fin d'exercice est invalide.");
  if (
    isIsoDate(company.fiscalYearStart) &&
    isIsoDate(company.fiscalYearEnd) &&
    company.fiscalYearEnd < company.fiscalYearStart
  ) {
    errors.push("La fin d'exercice doit etre posterieure au debut.");
  }
  return errors;
}

async function validatePeriod(period) {
  const errors = [];
  if (!period.name || period.name.length < 3) errors.push("Le nom de l'exercice est obligatoire.");
  if (!isIsoDate(period.startDate)) errors.push("La date de debut d'exercice est invalide.");
  if (!isIsoDate(period.endDate)) errors.push("La date de fin d'exercice est invalide.");
  if (
    isIsoDate(period.startDate) &&
    isIsoDate(period.endDate) &&
    period.endDate < period.startDate
  ) {
    errors.push("La fin d'exercice doit etre posterieure au debut.");
  }

  if (await readPeriod(period.id, period.organizationId))
    errors.push("Un exercice avec cet identifiant existe deja.");

  if (errors.length === 0) {
    const overlap = await pg().one(
      `
      SELECT *
      FROM accounting_periods
      WHERE organization_id = ? AND NOT (end_date < ? OR start_date > ?)
      LIMIT 1
    `,
      [period.organizationId ?? defaultOrganizationId, period.startDate, period.endDate]
    );
    if (overlap) errors.push(`La periode chevauche ${overlap.name}.`);
  }

  return errors;
}

async function validateCustomAccount(account, organizationId) {
  const errors = [];
  if (!/^\d{4}$/.test(account.code)) errors.push("Le compte doit contenir exactement 4 chiffres.");
  if (account.label.length < 2) errors.push("Le libelle du compte est obligatoire.");
  if (!["asset", "liability", "equity", "expense", "revenue"].includes(account.type))
    errors.push("Le type du compte est invalide.");
  if (accountByCode.has(account.code)) errors.push("Ce compte existe deja dans le plan SYSCOHADA.");
  if (await readCustomAccount(account.code, organizationId))
    errors.push("Ce compte existe deja dans ce dossier.");
  return errors;
}

async function validateJournal(journal) {
  const errors = [];
  if (!/^[A-Z0-9]{2,8}$/.test(journal.code))
    errors.push("Le code journal doit contenir 2 a 8 caracteres alphanumeriques.");
  if (journal.label.length < 2) errors.push("Le libelle du journal est obligatoire.");
  if (!["misc", "bank", "cash", "sales", "purchase", "payroll", "closing"].includes(journal.type))
    errors.push("Le type du journal est invalide.");
  if (await readJournal(journal.code, journal.organizationId))
    errors.push("Ce journal existe deja dans ce dossier.");
  return errors;
}

function normalizeJournalType(type) {
  return ["misc", "bank", "cash", "sales", "purchase", "payroll", "closing"].includes(type)
    ? type
    : "misc";
}

function periodIdForCompany(company) {
  const year = company.fiscalYearStart.slice(0, 4);
  return company.organizationId === defaultOrganizationId
    ? `period-${year}`
    : `period-${company.organizationId}-${year}`;
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
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) &&
    !Number.isNaN(new Date(`${value}T00:00:00`).getTime())
  );
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
  ]
    .filter(Boolean)
    .join("-");
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}
