import { createPostgresClient } from "./postgres-client.js";
import { config } from "../src/config.js";
import { hashPassword } from "../src/security.js";

const organizationId = String(process.env.OHADA_DEFAULT_ORGANIZATION_ID || "demo-company").trim();
const companyName = String(process.env.OHADA_DEFAULT_COMPANY_NAME || "Entreprise OHADA").trim();
const country = String(process.env.OHADA_DEFAULT_COUNTRY || "CI")
  .trim()
  .toUpperCase();
const currency = String(process.env.OHADA_DEFAULT_CURRENCY || "XOF")
  .trim()
  .toUpperCase();
const currentYear = new Date().getUTCFullYear();
const fiscalYearStart = String(
  process.env.OHADA_DEFAULT_FISCAL_YEAR_START || `${currentYear}-01-01`
).trim();
const fiscalYearEnd = String(
  process.env.OHADA_DEFAULT_FISCAL_YEAR_END || `${currentYear}-12-31`
).trim();
const adminName = String(process.env.OHADA_DEFAULT_ADMIN_NAME || "Administrateur").trim();

validateBootstrapConfig();

const client = createPostgresClient();
try {
  await client.connect();
  const existing = await client.query("SELECT COUNT(*)::int AS count FROM organizations");
  if (Number(existing.rows[0]?.count || 0) > 0) {
    console.log("Bootstrap PostgreSQL ignore: une organisation existe deja.");
    process.exit(0);
  }

  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const periodId = `period-${organizationId}-${fiscalYearStart.slice(0, 4)}`;
  const journals = [
    ["OD", "Operations diverses", "misc"],
    ["BQ", "Banque", "bank"],
    ["VT", "Ventes", "sales"],
    ["AC", "Achats", "purchase"]
  ];

  await client.query("BEGIN");
  try {
    await client.query(
      "INSERT INTO organizations (id, name, country, currency, created_at) VALUES ($1, $2, $3, $4, $5)",
      [organizationId, companyName, country, currency, now]
    );
    await client.query(
      "INSERT INTO companies (id, organization_id, name, country, currency, fiscal_year_start, fiscal_year_end) VALUES ($1, $1, $2, $3, $4, $5, $6)",
      [organizationId, companyName, country, currency, fiscalYearStart, fiscalYearEnd]
    );
    await client.query(
      "INSERT INTO accounting_periods (id, organization_id, name, start_date, end_date, status, updated_at) VALUES ($1, $2, $3, $4, $5, 'open', $6)",
      [
        periodId,
        organizationId,
        `Exercice ${fiscalYearStart.slice(0, 4)}`,
        fiscalYearStart,
        fiscalYearEnd,
        now
      ]
    );
    for (const [code, label, type] of journals) {
      await client.query(
        "INSERT INTO journals (code, organization_id, label, type, status, created_at) VALUES ($1, $2, $3, $4, 'active', $5)",
        [code, organizationId, label, type, now]
      );
    }
    await client.query(
      "INSERT INTO users (id, email, name, password_hash, status, created_at) VALUES ($1, $2, $3, $4, 'active', $5)",
      [
        userId,
        config.defaultAdminEmail.toLowerCase(),
        adminName,
        hashPassword(config.defaultAdminPassword),
        now
      ]
    );
    await client.query(
      "INSERT INTO organization_users (user_id, organization_id, role) VALUES ($1, $2, 'owner')",
      [userId, organizationId]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  console.log(
    `Bootstrap PostgreSQL termine: ${organizationId}, proprietaire ${config.defaultAdminEmail}.`
  );
} finally {
  await client.end().catch(() => {});
}

function validateBootstrapConfig() {
  const errors = [];
  if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(organizationId))
    errors.push("OHADA_DEFAULT_ORGANIZATION_ID est invalide.");
  if (companyName.length < 2) errors.push("OHADA_DEFAULT_COMPANY_NAME est invalide.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.defaultAdminEmail))
    errors.push("OHADA_DEFAULT_ADMIN_EMAIL est invalide.");
  if (!/^[A-Z]{2,3}$/.test(country)) errors.push("OHADA_DEFAULT_COUNTRY est invalide.");
  if (!/^[A-Z]{3}$/.test(currency)) errors.push("OHADA_DEFAULT_CURRENCY est invalide.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fiscalYearStart) || !/^\d{4}-\d{2}-\d{2}$/.test(fiscalYearEnd)) {
    errors.push("Les dates d'exercice sont invalides.");
  }
  if (fiscalYearEnd < fiscalYearStart) errors.push("La fin d'exercice doit suivre le debut.");
  if (
    ["admin12345", "change-me-before-production"].includes(config.defaultAdminPassword) ||
    config.defaultAdminPassword.length < 12
  ) {
    errors.push(
      "OHADA_DEFAULT_ADMIN_PASSWORD doit contenir au moins 12 caracteres et ne pas etre un placeholder."
    );
  }
  if (errors.length > 0) throw new Error(errors.join(" "));
}
