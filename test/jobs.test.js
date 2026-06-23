import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Each node:test file runs in its own process, so setting the SQLite path here
// isolates this suite from the rest of the test run.
let workingDir;
let store;

before(async () => {
  workingDir = await mkdtemp(join(tmpdir(), "ohada-jobs-"));
  process.env.OHADA_DB_RUNTIME = "sqlite";
  process.env.OHADA_DB_PATH = join(workingDir, "jobs.sqlite");
  process.env.OHADA_STORAGE_DIR = join(workingDir, "storage");
  store = await import("../src/store.js");
});

after(async () => {
  // Best-effort cleanup: the SQLite handle may still be open on Windows (EBUSY).
  await rm(workingDir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
});

test("claimNextJob atomically claims a queued job", async () => {
  const enqueued = await store.enqueueJob({ type: "financial-statements-export", payload: {} });
  assert.equal(enqueued.ok, true);

  const claimed = await store.claimNextJob();
  assert.equal(claimed.id, enqueued.job.id);
  assert.equal(claimed.status, "running");

  // No other queued job remains.
  assert.equal(await store.claimNextJob(), null);
});

test("requeueJob makes a failed attempt claimable again", async () => {
  const enqueued = await store.enqueueJob({ type: "financial-statements-export", payload: {} });
  const claimed = await store.claimNextJob();
  assert.equal(claimed.id, enqueued.job.id);

  await store.requeueJob(claimed.id, "Tentative 1 echouee");

  const reclaimed = await store.claimNextJob();
  assert.equal(reclaimed.id, enqueued.job.id);
  assert.equal(reclaimed.status, "running");
});

test("completeJob marks the job done", async () => {
  const enqueued = await store.enqueueJob({ type: "financial-statements-export", payload: {} });
  const claimed = await store.claimNextJob();
  await store.completeJob(claimed.id, { ok: true });

  const jobs = await store.readJobs(enqueued.job.organizationId);
  const done = jobs.find((job) => job.id === enqueued.job.id);
  assert.equal(done.status, "done");
});

test("failJob marks the job failed (dead-letter)", async () => {
  const enqueued = await store.enqueueJob({ type: "financial-statements-export", payload: {} });
  const claimed = await store.claimNextJob();
  await store.failJob(claimed.id, "erreur definitive");

  const jobs = await store.readJobs(enqueued.job.organizationId);
  const failed = jobs.find((job) => job.id === enqueued.job.id);
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /definitive/);
});
