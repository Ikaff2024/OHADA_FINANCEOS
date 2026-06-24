import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditEventHash, verifyAuditChain } from "../src/security.js";

function buildChain(events) {
  let prevHash = "";
  return events.map((event) => {
    const withPrev = { ...event, prevHash };
    const hash = auditEventHash(withPrev);
    prevHash = hash;
    return { ...withPrev, hash };
  });
}

const baseEvents = [
  {
    id: "a1",
    organizationId: "org",
    actor: "admin",
    action: "company.update",
    entityType: "company",
    entityId: "org",
    summary: "Parametres mis a jour",
    createdAt: "2026-01-01T10:00:00.000Z"
  },
  {
    id: "a2",
    organizationId: "org",
    actor: "admin",
    action: "journal-entry.create",
    entityType: "journal-entry",
    entityId: "e1",
    summary: "Ecriture creee",
    createdAt: "2026-01-02T10:00:00.000Z"
  },
  {
    id: "a3",
    organizationId: "org",
    actor: "admin",
    action: "period.lock",
    entityType: "period",
    entityId: "p1",
    summary: "Exercice verrouille",
    createdAt: "2026-01-03T10:00:00.000Z"
  }
];

test("a well-formed hash chain verifies", () => {
  const chain = buildChain(baseEvents);
  assert.deepEqual(verifyAuditChain(chain), { ok: true, count: 3 });
});

test("tampering with an event's summary breaks the chain", () => {
  const chain = buildChain(baseEvents);
  chain[1] = { ...chain[1], summary: "Montant falsifie" };
  const result = verifyAuditChain(chain);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, "a2");
});

test("deleting an event breaks the chain linkage", () => {
  const chain = buildChain(baseEvents);
  const without = [chain[0], chain[2]]; // drop the middle event
  const result = verifyAuditChain(without);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, "a3");
});

test("timestamp normalization keeps the hash stable across formats", () => {
  const iso = auditEventHash({
    ...baseEvents[0],
    prevHash: "",
    createdAt: "2026-01-01T10:00:00.000Z"
  });
  const date = auditEventHash({
    ...baseEvents[0],
    prevHash: "",
    createdAt: new Date("2026-01-01T10:00:00.000Z")
  });
  assert.equal(iso, date);
});

// Integration: real audited actions on an isolated SQLite database verify clean.
let workingDir;
let store;
before(async () => {
  workingDir = await mkdtemp(join(tmpdir(), "ohada-audit-"));
  process.env.OHADA_DB_RUNTIME = "sqlite";
  process.env.OHADA_DB_PATH = join(workingDir, "audit.sqlite");
  process.env.OHADA_STORAGE_DIR = join(workingDir, "storage");
  store = await import("../src/store.js");
});
after(async () => {
  await rm(workingDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
});

test("audited actions produce a verifiable chain", async () => {
  await store.updateCompany({
    name: "Chain Test",
    country: "CI",
    currency: "XOF",
    fiscalYearStart: "2026-01-01",
    fiscalYearEnd: "2026-12-31"
  });
  const result = await store.verifyAuditTrail();
  assert.equal(result.ok, true);
  assert.ok(result.count >= 1);
});
