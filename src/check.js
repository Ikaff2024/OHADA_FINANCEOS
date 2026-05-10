import assert from "node:assert/strict";
import {
  buildAuxiliaryBalance,
  buildBalanceSheet,
  buildClosingControls,
  buildGeneralLedger,
  buildIncomeStatement,
  buildTrialBalance,
  validateJournalEntry
} from "./accounting.js";
import {
  buildLearningCorrections,
  journalEntryFingerprints,
  previewBankCsv,
  sampleBankCsv,
  transactionsToJournalEntries
} from "./bankImport.js";

const validEntry = {
  date: "2026-02-01",
  reference: "TEST-001",
  description: "Encaissement client",
  lines: [
    { accountCode: "5211", debit: 100000, credit: 0 },
    { accountCode: "4111", debit: 0, credit: 100000 }
  ]
};

const invalidEntry = {
  date: "2026-02-01",
  reference: "TEST-002",
  description: "Ecriture invalide",
  lines: [
    { accountCode: "5211", debit: 100000, credit: 0 },
    { accountCode: "7061", debit: 0, credit: 90000 }
  ]
};

assert.equal(validateJournalEntry(validEntry).ok, true);
assert.equal(validateJournalEntry(invalidEntry).ok, false);

const entries = [
  {
    date: "2026-02-01",
    reference: "TEST-003",
    lines: [
      { accountCode: "5211", debit: 100000, credit: 0 },
      { accountCode: "7061", debit: 0, credit: 100000 }
    ]
  },
  {
    date: "2026-02-02",
    reference: "TEST-004",
    lines: [
      { accountCode: "6222", debit: 25000, credit: 0 },
      { accountCode: "5211", debit: 0, credit: 25000 }
    ]
  }
];

assert.equal(buildTrialBalance(entries).length, 3);
assert.equal(buildIncomeStatement(entries).netIncome, 75000);
assert.equal(buildBalanceSheet(entries).difference, 0);
assert.equal(buildGeneralLedger(entries).length, 4);
const auxiliaryBalance = buildAuxiliaryBalance([
  {
    date: "2026-02-03",
    reference: "TEST-005",
    lines: [
      { accountCode: "4111", auxiliaryCode: "C-TEST", debit: 100000, credit: 0 },
      { accountCode: "7061", debit: 0, credit: 100000 }
    ]
  }
], [{ code: "C-TEST", label: "Client Test", accountCode: "4111", accountLabel: "Clients" }]);
assert.equal(auxiliaryBalance.length, 1);
assert.equal(auxiliaryBalance[0].balance, 100000);
const closingControls = buildClosingControls(entries, [
  { id: "period-2026", name: "Exercice 2026", startDate: "2026-01-01", endDate: "2026-12-31", status: "open" }
]);
assert.equal(closingControls.blockerCount, 0);
assert.equal(closingControls.warningCount, 1);
assert.equal(closingControls.ready, true);

const preview = previewBankCsv(sampleBankCsv());
assert.equal(preview.ok, true);
assert.equal(preview.transactions.length, 4);
assert.equal(preview.transactions[0].accountCode, "7061");
assert.equal(transactionsToJournalEntries(preview.transactions).length, 4);

const editedTransactions = preview.transactions.map((transaction, index) => ({
  ...transaction,
  accountCode: index === 0 ? "7011" : transaction.accountCode
}));
const corrections = buildLearningCorrections(preview.transactions, editedTransactions);
assert.equal(corrections.length, 1);
assert.equal(previewBankCsv(sampleBankCsv(), corrections).transactions[0].accountCode, "7011");

const importedEntries = transactionsToJournalEntries([preview.transactions[0]]);
const duplicatePreview = previewBankCsv(sampleBankCsv(), [], journalEntryFingerprints(importedEntries));
assert.equal(duplicatePreview.transactions[0].duplicate, true);
assert.equal(duplicatePreview.transactions[1].duplicate, false);

console.log("Checks MVP OK");
