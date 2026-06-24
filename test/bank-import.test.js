import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLearningCorrections,
  journalEntryFingerprints,
  previewBankCsv,
  sampleBankCsv,
  transactionsToJournalEntries
} from "../src/bankImport.js";

test("previewBankCsv parses the sample and classifies transactions", () => {
  const preview = previewBankCsv(sampleBankCsv());
  assert.equal(preview.ok, true);
  assert.equal(preview.transactions.length, 4);

  const [income, rent, purchase, salary] = preview.transactions;
  assert.equal(income.direction, "credit");
  assert.equal(income.accountCode, "7061"); // "...service" -> service vendu
  assert.equal(rent.direction, "debit");
  assert.equal(rent.accountCode, "6222"); // loyer / bureau
  assert.equal(purchase.accountCode, "6011"); // achat marchandises
  assert.equal(salary.accountCode, "6611"); // salaires
});

test("transactionsToJournalEntries produces balanced entries", () => {
  const preview = previewBankCsv(sampleBankCsv());
  const entries = transactionsToJournalEntries(preview.transactions);
  assert.equal(entries.length, 4);
  for (const entry of entries) {
    const debit = entry.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
    const credit = entry.lines.reduce((sum, line) => sum + (line.credit || 0), 0);
    assert.equal(debit, credit);
    assert.equal(entry.source, "bank-csv");
  }
});

test("previewBankCsv flags a missing required column", () => {
  const preview = previewBankCsv("date,description\n2026-01-01,Sans montant");
  assert.equal(preview.ok, false);
  assert.ok(preview.errors.some((message) => /amount/i.test(message)));
});

test("previewBankCsv rejects a zero or invalid amount", () => {
  const preview = previewBankCsv("date,description,amount\n2026-01-01,Test,0");
  assert.equal(preview.ok, false);
  assert.ok(preview.errors.some((message) => /montant/i.test(message)));
});

test("previewBankCsv parses amounts with spaces and decimal comma", () => {
  const preview = previewBankCsv('date,description,amount\n2026-02-04,Vente,"1 200,50"');
  assert.equal(preview.ok, true);
  assert.equal(preview.transactions[0].amount, 1200.5);
  assert.equal(preview.transactions[0].direction, "credit");
});

test("duplicate transactions are detected via fingerprints", () => {
  const preview = previewBankCsv(sampleBankCsv());
  const imported = transactionsToJournalEntries([preview.transactions[0]]);
  const fingerprints = journalEntryFingerprints(imported);
  const second = previewBankCsv(sampleBankCsv(), [], fingerprints);
  assert.equal(second.transactions[0].duplicate, true);
  assert.equal(second.transactions[1].duplicate, false);
});

test("buildLearningCorrections captures and replays a manual correction", () => {
  const preview = previewBankCsv(sampleBankCsv());
  const edited = preview.transactions.map((transaction, index) =>
    index === 0 ? { ...transaction, accountCode: "7011" } : transaction
  );
  const corrections = buildLearningCorrections(preview.transactions, edited);
  assert.equal(corrections.length, 1);
  assert.equal(corrections[0].accountCode, "7011");

  // Re-running the preview with the learned correction reclassifies the row.
  const relearned = previewBankCsv(sampleBankCsv(), corrections);
  assert.equal(relearned.transactions[0].accountCode, "7011");
});
