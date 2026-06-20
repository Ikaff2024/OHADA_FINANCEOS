import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import { config } from "../src/config.js";

export function postgresConnection() {
  if (!config.databaseUrl) {
    const user = String(process.env.POSTGRES_USER || "").trim();
    const database = String(process.env.POSTGRES_DB || "").trim();
    if (!user || !database) throw new Error("DATABASE_URL ou POSTGRES_USER/POSTGRES_DB sont obligatoires.");
    return {
      host: String(process.env.POSTGRES_HOST || "localhost").trim(),
      port: String(process.env.POSTGRES_PORT || "5432").trim(),
      user,
      password: String(process.env.POSTGRES_PASSWORD || ""),
      database
    };
  }
  const url = new URL(config.databaseUrl);
  return {
    host: url.hostname,
    port: url.port || "5432",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, ""))
  };
}

export async function runPostgresTool(tool, args, { inputPath, outputPath } = {}) {
  const connection = postgresConnection();
  const container = String(process.env.PG_DOCKER_CONTAINER || "").trim();
  const connectionArgs = container
    ? ["--host=127.0.0.1", "--port=5432", `--username=${connection.user}`, `--dbname=${connection.database}`]
    : [`--host=${connection.host}`, `--port=${connection.port}`, `--username=${connection.user}`, `--dbname=${connection.database}`];

  let command;
  let commandArgs;
  const env = { ...process.env, PGPASSWORD: connection.password };

  if (container) {
    command = "docker";
    commandArgs = [
      "exec",
      ...(inputPath ? ["-i"] : []),
      "-e",
      `PGPASSWORD=${connection.password}`,
      container,
      tool,
      ...connectionArgs,
      ...args
    ];
  } else {
    const executable = process.platform === "win32" ? `${tool}.exe` : tool;
    command = process.env.PG_BIN_DIR ? join(process.env.PG_BIN_DIR, executable) : executable;
    commandArgs = [...connectionArgs, ...args];
  }

  const child = spawn(command, commandArgs, { env, stdio: ["pipe", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const input = inputPath ? pipeline(createReadStream(inputPath), child.stdin) : Promise.resolve(child.stdin.end());
  const output = outputPath
    ? pipeline(child.stdout, createWriteStream(outputPath))
    : pipeline(child.stdout, process.stdout, { end: false });
  const exitCode = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });

  const [code] = await Promise.all([exitCode, input, output]);
  if (code !== 0) throw new Error(`${tool} a echoue (${code}): ${stderr.trim()}`);
}
