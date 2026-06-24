import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const keyLength = 64;

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, keyLength).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, storedHash) {
  const [algorithm, salt, expectedHash] = String(storedHash || "").split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHash) return false;

  const expected = Buffer.from(expectedHash, "hex");
  const actual = scryptSync(String(password), salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

export function createSessionToken() {
  return randomBytes(32).toString("hex");
}

// Tamper-evident audit log: each event's hash chains the previous one, so any
// later alteration of a core field breaks every subsequent hash. The timestamp
// is normalized to ISO so the hash is stable across SQLite (TEXT) and
// PostgreSQL (TIMESTAMPTZ) round-trips. Free-form `details` are intentionally
// excluded to keep the hash reproducible across both stores.
function normalizeTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value ?? "") : date.toISOString();
}

export function auditEventHash(fields) {
  const canonical = JSON.stringify([
    fields.prevHash ?? "",
    fields.id,
    fields.organizationId,
    fields.actor,
    fields.action,
    fields.entityType,
    fields.entityId,
    fields.summary,
    normalizeTimestamp(fields.createdAt)
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

// Verifies a list of hashed audit events ordered oldest-first. Events without a
// hash (recorded before the feature existed) must be filtered out by the caller.
export function verifyAuditChain(events) {
  let prevHash = "";
  for (const event of events) {
    if ((event.prevHash ?? "") !== prevHash) {
      return { ok: false, brokenAt: event.id, reason: "prev_hash" };
    }
    const expected = auditEventHash({ ...event, prevHash });
    if (expected !== event.hash) {
      return { ok: false, brokenAt: event.id, reason: "hash" };
    }
    prevHash = event.hash;
  }
  return { ok: true, count: events.length };
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    organizationId: user.organizationId,
    createdAt: user.createdAt
  };
}
