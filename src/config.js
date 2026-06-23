import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

export const config = {
  port: Number(process.env.PORT || 3050),
  runtimeDatabase: process.env.OHADA_DB_RUNTIME === "postgres" ? "postgres" : "sqlite",
  sqlitePath: process.env.OHADA_DB_PATH || join(rootDir, "data", "financeos.sqlite"),
  storageDir: process.env.OHADA_STORAGE_DIR || join(rootDir, "storage", "uploads"),
  defaultAdminEmail: process.env.OHADA_DEFAULT_ADMIN_EMAIL || "admin@demo.ohada",
  defaultAdminPassword: process.env.OHADA_DEFAULT_ADMIN_PASSWORD || "admin12345",
  sessionTtlHours: Number(process.env.OHADA_SESSION_TTL_HOURS || 12),
  jobWorkerIntervalMs: Number(process.env.OHADA_JOB_WORKER_INTERVAL_MS || 1500),
  authRateLimitWindowMs: Number(process.env.OHADA_AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  authRateLimitMaxAttempts: Number(process.env.OHADA_AUTH_RATE_LIMIT_MAX_ATTEMPTS || 10),
  exposeAuthTokens: process.env.OHADA_EXPOSE_AUTH_TOKENS === "true",
  corsAllowedOrigins: String(process.env.OHADA_CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  databaseUrl: process.env.DATABASE_URL || "",
  appUrl: process.env.APP_URL || "",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "noreply@financeos.com"
  }
};

export const publicConfig = {
  runtimeDatabase: config.runtimeDatabase,
  postgresConfigured: Boolean(config.databaseUrl),
  storageMode: process.env.OHADA_STORAGE_DIR ? "local-configured" : "local-default"
};
