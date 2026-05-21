import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

export const config = {
  port: Number(process.env.PORT || 3050),
  sqlitePath: process.env.OHADA_DB_PATH || join(rootDir, "data", "financeos.sqlite"),
  storageDir: process.env.OHADA_STORAGE_DIR || join(rootDir, "storage", "uploads"),
  defaultAdminEmail: process.env.OHADA_DEFAULT_ADMIN_EMAIL || "admin@demo.ohada",
  defaultAdminPassword: process.env.OHADA_DEFAULT_ADMIN_PASSWORD || "admin12345",
  sessionTtlHours: Number(process.env.OHADA_SESSION_TTL_HOURS || 12),
  jobWorkerIntervalMs: Number(process.env.OHADA_JOB_WORKER_INTERVAL_MS || 1500),
  authRateLimitWindowMs: Number(process.env.OHADA_AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  authRateLimitMaxAttempts: Number(process.env.OHADA_AUTH_RATE_LIMIT_MAX_ATTEMPTS || 10),
  corsAllowedOrigins: String(process.env.OHADA_CORS_ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean),
  databaseUrl: process.env.DATABASE_URL || ""
};

export const publicConfig = {
  databaseMode: config.databaseUrl ? "postgres-ready" : "sqlite",
  storageMode: process.env.OHADA_STORAGE_DIR ? "local-configured" : "local-default"
};
