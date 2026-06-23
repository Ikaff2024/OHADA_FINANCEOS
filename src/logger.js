import { config } from "./config.js";

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const REDACTED = "[redacted]";
const SENSITIVE_KEYS = new Set([
  "authorization",
  "password",
  "pass",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "cookie",
  "set-cookie",
  "smtp_pass",
  "gemini_api_key",
  "database_url"
]);

function thresholdFor(level) {
  const configured = LEVELS[String(level || "").toLowerCase()];
  return configured ?? LEVELS.info;
}

let activeThreshold = thresholdFor(config.logLevel);

export function setLogLevel(level) {
  activeThreshold = thresholdFor(level);
}

function redact(value, depth = 0) {
  if (value === null || typeof value !== "object" || depth > 4) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : redact(item, depth + 1);
  }
  return output;
}

function write(level, bindings, message, fields) {
  if (LEVELS[level] > activeThreshold) return;
  const entry = {
    level,
    time: new Date().toISOString(),
    msg: message,
    ...bindings,
    ...(fields ? redact(fields) : {})
  };
  const line = `${JSON.stringify(entry)}\n`;
  if (level === "error" || level === "warn") process.stderr.write(line);
  else process.stdout.write(line);
}

function buildLogger(bindings) {
  return {
    error: (message, fields) => write("error", bindings, message, fields),
    warn: (message, fields) => write("warn", bindings, message, fields),
    info: (message, fields) => write("info", bindings, message, fields),
    debug: (message, fields) => write("debug", bindings, message, fields),
    child: (extra) => buildLogger({ ...bindings, ...extra })
  };
}

export const logger = buildLogger({ service: "ohada-financeos-mvp" });
