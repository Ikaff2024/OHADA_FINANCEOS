import { normalizeJournalEntry, validateJournalEntry } from "./accounting.js";

export function buildSubscriptionEntries(input, batchId = crypto.randomUUID()) {
  const errors = [];
  const name = String(input.name || "").trim();
  const description = String(input.description || name).trim();
  const startDate = String(input.startDate || "");
  const endDate = String(input.endDate || "");
  const dayOfMonth = Math.min(
    28,
    Math.max(1, Number(input.dayOfMonth || startDate.slice(-2) || 1))
  );
  const lines = Array.isArray(input.lines) ? input.lines : [];

  if (name.length < 2) errors.push("Le nom de l'abonnement est obligatoire.");
  if (!startDate || Number.isNaN(Date.parse(startDate)))
    errors.push("La date de debut est obligatoire.");
  if (!endDate || Number.isNaN(Date.parse(endDate))) errors.push("La date de fin est obligatoire.");
  if (startDate && endDate && startDate > endDate)
    errors.push("La date de fin doit etre posterieure a la date de debut.");
  if (lines.length < 2) errors.push("L'abonnement doit contenir au moins deux lignes.");

  if (errors.length > 0) return { ok: false, errors, entries: [] };

  const dates = monthlyDates(startDate, endDate, dayOfMonth);
  const entries = dates.map((date, index) =>
    normalizeJournalEntry({
      date,
      reference: `ABN-${date.slice(0, 7).replace("-", "")}-${String(index + 1).padStart(3, "0")}`,
      description,
      source: "subscription",
      batchId,
      lines
    })
  );

  const validationErrors = entries.flatMap((entry, index) => {
    const validation = validateJournalEntry(entry);
    return validation.ok ? [] : validation.errors.map((error) => `Mois ${index + 1}: ${error}`);
  });

  return {
    ok: validationErrors.length === 0,
    errors: validationErrors,
    batchId,
    entries
  };
}

function monthlyDates(startDate, endDate, dayOfMonth) {
  const dates = [];
  const cursor = new Date(`${startDate.slice(0, 7)}-01T00:00:00.000Z`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00.000Z`);

  while (cursor <= end) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const date = `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
    if (date >= startDate && date <= endDate) dates.push(date);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return dates;
}
