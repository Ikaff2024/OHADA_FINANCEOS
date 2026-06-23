import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

const BACKUP_FILE_PATTERN = /^postgres-.*\.dump$/;

function readNonNegativeInteger(value, fallback, name) {
  if (value === undefined || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} doit etre un entier positif ou nul.`);
  }
  return parsed;
}

export function backupRetentionPolicy(env = process.env) {
  return {
    retentionDays: readNonNegativeInteger(
      env.OHADA_BACKUP_RETENTION_DAYS,
      30,
      "OHADA_BACKUP_RETENTION_DAYS"
    ),
    minCopies: readNonNegativeInteger(env.OHADA_BACKUP_MIN_COPIES, 7, "OHADA_BACKUP_MIN_COPIES")
  };
}

export async function prunePostgresBackups(
  directory,
  { retentionDays = 30, minCopies = 7, now = new Date() } = {}
) {
  if (retentionDays === 0) {
    return { enabled: false, scanned: 0, deleted: [], retained: 0, cutoffAt: null };
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const backupEntries = entries
    .filter((entry) => entry.isFile() && BACKUP_FILE_PATTERN.test(entry.name))
    .map((entry) => ({ name: entry.name, path: join(directory, entry.name) }));
  const backups = await Promise.all(
    backupEntries.map(async (backup) => ({
      ...backup,
      modifiedAt: (await stat(backup.path)).mtimeMs
    }))
  );
  backups.sort((left, right) => right.modifiedAt - left.modifiedAt);

  const cutoffMs = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const expired = backups.slice(minCopies).filter((backup) => backup.modifiedAt < cutoffMs);

  for (const backup of expired) await unlink(backup.path);

  return {
    enabled: true,
    scanned: backups.length,
    deleted: expired.map((backup) => backup.name),
    retained: backups.length - expired.length,
    cutoffAt: new Date(cutoffMs).toISOString()
  };
}
