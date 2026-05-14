import {
  createPostgresClient as createRuntimePostgresClient,
  postgresSslConfig,
  requirePostgresUrl
} from "../src/postgresRuntime.js";

export function requireDatabaseUrl() {
  try {
    return requirePostgresUrl();
  } catch {
    console.error("DATABASE_URL est obligatoire pour cette commande PostgreSQL.");
    process.exit(1);
  }
}

export function createPostgresClient() {
  requireDatabaseUrl();
  return createRuntimePostgresClient();
}

export { postgresSslConfig };
