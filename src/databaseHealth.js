import { stat } from "node:fs/promises";
import { config, publicConfig } from "./config.js";
import { createPostgresClient } from "./postgresRuntime.js";

export async function databaseHealth({ checkPostgres = false } = {}) {
  const sqlite = await sqliteHealth();
  const postgres = await postgresHealth(checkPostgres);

  return {
    runtime: publicConfig.runtimeDatabase,
    sqlite,
    postgres
  };
}

async function sqliteHealth() {
  try {
    const info = await stat(config.sqlitePath);
    return {
      ok: true,
      exists: true,
      path: config.sqlitePath,
      size: info.size
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        ok: true,
        exists: false,
        path: config.sqlitePath,
        size: 0
      };
    }

    return {
      ok: false,
      exists: false,
      path: config.sqlitePath,
      error: error.message
    };
  }
}

async function postgresHealth(checkPostgres) {
  if (!config.databaseUrl) {
    return {
      configured: false,
      ok: null,
      runtime: false
    };
  }

  if (!checkPostgres) {
    return {
      configured: true,
      ok: null,
      runtime: false
    };
  }

  const client = createPostgresClient();

  try {
    await client.connect();
    await client.query("SELECT 1");
    return {
      configured: true,
      ok: true,
      runtime: false
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      runtime: false,
      error: error.message
    };
  } finally {
    await client.end().catch(() => {});
  }
}
