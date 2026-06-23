import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Isolated SQLite database for this file (node:test runs files in separate processes).
let workingDir;
let store;

before(async () => {
  workingDir = await mkdtemp(join(tmpdir(), "ohada-tenant-"));
  process.env.OHADA_DB_RUNTIME = "sqlite";
  process.env.OHADA_DB_PATH = join(workingDir, "tenant.sqlite");
  process.env.OHADA_STORAGE_DIR = join(workingDir, "storage");
  store = await import("../src/store.js");
});

after(async () => {
  await rm(workingDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
});

test("a spoofed x-organization-id never grants access to another organization", async () => {
  // Seeded demo organization + admin (admin@demo.ohada / admin12345 in non-prod).
  const admin = await store.loginUser({ email: "admin@demo.ohada", password: "admin12345" });
  assert.equal(admin.ok, true, "demo admin should be able to log in");
  const demoOrgId = admin.organization.id;

  // Create a second, fully separate organization with its own owner.
  const created = await store.addOrganization({
    name: "Org Beta",
    country: "CI",
    currency: "XOF",
    fiscalYearStart: "2026-01-01",
    fiscalYearEnd: "2026-12-31",
    ownerEmail: "owner.beta@example.com",
    ownerName: "Owner Beta",
    ownerPassword: "OwnerBeta-Strong-123"
  });
  assert.equal(created.ok, true, `org creation should succeed: ${JSON.stringify(created.errors)}`);
  const betaOrgId = created.organization.id;
  assert.notEqual(betaOrgId, demoOrgId);

  // The admin tries to act on Org Beta by spoofing the active organization header.
  const spoofed = await store.readAuthContext(admin.token, betaOrgId);
  assert.equal(
    spoofed.organization.id,
    demoOrgId,
    "spoofed org id must fall back to the user's own organization"
  );
  assert.ok(
    !spoofed.availableOrganizations.some((org) => org.id === betaOrgId),
    "admin must not see Org Beta in its available organizations"
  );
});

test("each owner only sees their own organization", async () => {
  const admin = await store.loginUser({ email: "admin@demo.ohada", password: "admin12345" });
  const demoOrgId = admin.organization.id;

  const beta = await store.loginUser({
    email: "owner.beta@example.com",
    password: "OwnerBeta-Strong-123"
  });
  assert.equal(beta.ok, true, "beta owner should be able to log in");

  assert.notEqual(beta.organization.id, demoOrgId);
  assert.ok(
    !beta.availableOrganizations.some((org) => org.id === demoOrgId),
    "beta owner must not see the demo organization"
  );
  assert.ok(
    !admin.availableOrganizations.some((org) => org.id === beta.organization.id),
    "admin must not see the beta organization"
  );
});
