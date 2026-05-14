import { Client } from "pg";
import { config } from "../src/config.js";

export function requireDatabaseUrl() {
  if (!config.databaseUrl) {
    console.error("DATABASE_URL est obligatoire pour cette commande PostgreSQL.");
    process.exit(1);
  }
  return config.databaseUrl;
}

export function createPostgresClient() {
  return new Client({
    connectionString: requireDatabaseUrl(),
    ssl: postgresSslConfig()
  });
}

export function postgresSslConfig() {
  if (process.env.PGSSLMODE === "disable" || process.env.PGSSL === "false") return false;
  return { rejectUnauthorized: false };
}
