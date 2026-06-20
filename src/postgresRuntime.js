import { Client, Pool } from "pg";
import { config } from "./config.js";

export function requirePostgresUrl() {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL est obligatoire pour utiliser PostgreSQL.");
  }
  return config.databaseUrl;
}

export function postgresSslConfig() {
  if (process.env.PGSSLMODE === "disable" || process.env.PGSSL === "false") return false;
  return { rejectUnauthorized: false };
}

export function createPostgresClient() {
  return new Client({
    connectionString: requirePostgresUrl(),
    ssl: postgresSslConfig(),
    connectionTimeoutMillis: postgresConnectionTimeoutMs()
  });
}

export function createPostgresPool() {
  const pool = new Pool({
    connectionString: requirePostgresUrl(),
    ssl: postgresSslConfig(),
    connectionTimeoutMillis: postgresConnectionTimeoutMs()
  });
  pool.on("error", (error) => {
    console.error("Erreur client PostgreSQL inactif:", error.message);
  });
  return pool;
}

function postgresConnectionTimeoutMs() {
  return Math.max(500, Number(process.env.OHADA_PG_CONNECTION_TIMEOUT_MS || 3000));
}

export function createPostgresRuntime(clientOrPool = createPostgresPool()) {
  return {
    async query(sql, params = []) {
      const query = toPostgresQuery(sql);
      return clientOrPool.query(query.text, params);
    },
    async one(sql, params = []) {
      const result = await this.query(sql, params);
      return result.rows[0] ?? null;
    },
    async many(sql, params = []) {
      const result = await this.query(sql, params);
      return result.rows;
    },
    async run(sql, params = []) {
      const result = await this.query(sql, params);
      return {
        changes: result.rowCount ?? 0,
        rows: result.rows
      };
    },
    async transaction(callback) {
      const client = await clientOrPool.connect();
      const runtime = createPostgresRuntime(client);
      try {
        await client.query("BEGIN");
        const value = await callback(runtime);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release?.();
      }
    },
    async close() {
      await clientOrPool.end?.();
    }
  };
}

export function toPostgresQuery(sql) {
  let index = 0;
  let text = "";
  let mode = "code";
  let dollarTag = "";

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (mode === "line-comment") {
      text += char;
      if (char === "\n") mode = "code";
      continue;
    }

    if (mode === "block-comment") {
      text += char;
      if (char === "*" && next === "/") {
        text += next;
        i += 1;
        mode = "code";
      }
      continue;
    }

    if (mode === "single-quote") {
      text += char;
      if (char === "'" && next === "'") {
        text += next;
        i += 1;
      } else if (char === "'") {
        mode = "code";
      }
      continue;
    }

    if (mode === "double-quote") {
      text += char;
      if (char === '"' && next === '"') {
        text += next;
        i += 1;
      } else if (char === '"') {
        mode = "code";
      }
      continue;
    }

    if (mode === "dollar-quote") {
      if (sql.startsWith(dollarTag, i)) {
        text += dollarTag;
        i += dollarTag.length - 1;
        mode = "code";
      } else {
        text += char;
      }
      continue;
    }

    if (char === "-" && next === "-") {
      text += char + next;
      i += 1;
      mode = "line-comment";
      continue;
    }

    if (char === "/" && next === "*") {
      text += char + next;
      i += 1;
      mode = "block-comment";
      continue;
    }

    if (char === "'") {
      text += char;
      mode = "single-quote";
      continue;
    }

    if (char === '"') {
      text += char;
      mode = "double-quote";
      continue;
    }

    if (char === "$") {
      const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        text += dollarTag;
        i += dollarTag.length - 1;
        mode = "dollar-quote";
        continue;
      }
    }

    if (char === "?") {
      index += 1;
      text += `$${index}`;
      continue;
    }

    text += char;
  }

  return { text, parameterCount: index };
}
