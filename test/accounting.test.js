import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAgedBalance,
  buildAuxiliaryBalance,
  buildBalanceSheet,
  buildClosingControls,
  buildGeneralLedger,
  buildIncomeStatement,
  buildTrialBalance,
  normalizeJournalEntry,
  totalsForLines,
  validateJournalEntry
} from "../src/accounting.js";

// Coherent set of balanced entries used across several reports.
// 1. Capital injection, 2. credit sale, 3. credit purchase.
const period = {
  id: "period-2026",
  name: "Exercice 2026",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  status: "open"
};

const entries = [
  {
    id: "e1",
    date: "2026-01-05",
    reference: "MAN-1",
    description: "Apport en capital",
    lines: [
      { accountCode: "5211", debit: 1000000, credit: 0 },
      { accountCode: "1013", debit: 0, credit: 1000000 }
    ]
  },
  {
    id: "e2",
    date: "2026-02-10",
    reference: "MAN-2",
    description: "Vente a credit",
    lines: [
      { accountCode: "4111", auxiliaryCode: "C-001", debit: 500000, credit: 0 },
      { accountCode: "7011", debit: 0, credit: 500000 }
    ]
  },
  {
    id: "e3",
    date: "2026-03-15",
    reference: "MAN-3",
    description: "Achat a credit",
    lines: [
      { accountCode: "6011", debit: 200000, credit: 0 },
      { accountCode: "4011", debit: 0, credit: 200000 }
    ]
  }
];

test("validateJournalEntry accepts a balanced entry", () => {
  const result = validateJournalEntry({
    date: "2026-02-01",
    reference: "T-1",
    description: "Encaissement client",
    lines: [
      { accountCode: "5211", debit: 100000, credit: 0 },
      { accountCode: "4111", debit: 0, credit: 100000 }
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("validateJournalEntry rejects an unbalanced entry", () => {
  const result = validateJournalEntry({
    date: "2026-02-01",
    reference: "T-2",
    description: "Ecriture desequilibree",
    lines: [
      { accountCode: "5211", debit: 100000, credit: 0 },
      { accountCode: "7011", debit: 0, credit: 90000 }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => /desequilibree/i.test(message)));
});

test("validateJournalEntry flags missing date, description and reference", () => {
  const result = validateJournalEntry({
    date: "",
    reference: "",
    description: "ab",
    lines: [
      { accountCode: "5211", debit: 100, credit: 0 },
      { accountCode: "7011", debit: 0, credit: 100 }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => /date/i.test(message)));
  assert.ok(result.errors.some((message) => /libelle/i.test(message)));
  assert.ok(result.errors.some((message) => /reference/i.test(message)));
});

test("validateJournalEntry requires at least two lines", () => {
  const result = validateJournalEntry({
    date: "2026-02-01",
    reference: "T-3",
    description: "Une seule ligne",
    lines: [{ accountCode: "5211", debit: 100, credit: 0 }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => /deux lignes/i.test(message)));
});

test("validateJournalEntry rejects unknown accounts", () => {
  const result = validateJournalEntry({
    date: "2026-02-01",
    reference: "T-4",
    description: "Compte inconnu",
    lines: [
      { accountCode: "9999", debit: 100, credit: 0 },
      { accountCode: "7011", debit: 0, credit: 100 }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => /inconnu/i.test(message)));
});

test("validateJournalEntry rejects negative and ambiguous amounts", () => {
  const negative = validateJournalEntry({
    date: "2026-02-01",
    reference: "T-5",
    description: "Montant negatif",
    lines: [
      { accountCode: "5211", debit: -100, credit: 0 },
      { accountCode: "7011", debit: 0, credit: -100 }
    ]
  });
  assert.ok(negative.errors.some((message) => /negatif/i.test(message)));

  const both = validateJournalEntry({
    date: "2026-02-01",
    reference: "T-6",
    description: "Debit et credit",
    lines: [
      { accountCode: "5211", debit: 100, credit: 100 },
      { accountCode: "7011", debit: 0, credit: 0 }
    ]
  });
  assert.ok(both.errors.some((message) => /debit et credit/i.test(message)));
  assert.ok(both.errors.some((message) => /obligatoire/i.test(message)));
});

test("buildTrialBalance aggregates movements and exposes closing columns", () => {
  const balance = buildTrialBalance(entries);
  assert.equal(balance.length, 6);
  const bank = balance.find((row) => row.code === "5211");
  assert.equal(bank.debit, 1000000);
  assert.equal(bank.balance, 1000000);
  assert.equal(bank.closingDebit, 1000000);
  assert.equal(bank.closingCredit, 0);
  const supplier = balance.find((row) => row.code === "4011");
  assert.equal(supplier.balance, -200000);
  assert.equal(supplier.closingCredit, 200000);
  // Trial balance must net to zero across all accounts.
  const totalDebit = balance.reduce((sum, row) => sum + row.debit, 0);
  const totalCredit = balance.reduce((sum, row) => sum + row.credit, 0);
  assert.equal(totalDebit, totalCredit);
});

test("buildIncomeStatement computes revenue, expenses and net income", () => {
  const income = buildIncomeStatement(entries);
  assert.equal(income.revenue, 500000);
  assert.equal(income.expenses, 200000);
  assert.equal(income.netIncome, 300000);
});

test("buildBalanceSheet stays balanced including net income", () => {
  const sheet = buildBalanceSheet(entries);
  assert.equal(sheet.assets, 1500000);
  assert.equal(sheet.liabilities, 200000);
  assert.equal(sheet.equity, 1000000);
  assert.equal(sheet.retainedEarnings, 300000);
  assert.equal(sheet.liabilitiesAndEquity, 1500000);
  assert.equal(sheet.difference, 0);
});

test("buildGeneralLedger returns every line sorted by date", () => {
  const ledger = buildGeneralLedger(entries);
  assert.equal(ledger.length, 6);
  const dates = ledger.map((row) => row.date);
  assert.deepEqual(
    dates,
    [...dates].sort((a, b) => a.localeCompare(b))
  );
});

test("buildAuxiliaryBalance tracks per-tier balances", () => {
  const auxiliary = buildAuxiliaryBalance(entries, [
    { code: "C-001", label: "Client 001", accountCode: "4111", accountLabel: "Clients" }
  ]);
  assert.equal(auxiliary.length, 1);
  assert.equal(auxiliary[0].code, "C-001");
  assert.equal(auxiliary[0].balance, 500000);
});

test("buildClosingControls reports a ready, balanced file", () => {
  const controls = buildClosingControls(entries, [period]);
  assert.equal(controls.ready, true);
  assert.equal(controls.blockerCount, 0);
  assert.equal(controls.totals.debit, controls.totals.credit);
});

test("buildClosingControls blocks on an unknown account", () => {
  const withUnknown = [
    ...entries,
    {
      id: "e4",
      date: "2026-04-01",
      reference: "MAN-4",
      description: "Compte hors plan",
      lines: [
        { accountCode: "9999", debit: 100, credit: 0 },
        { accountCode: "7011", debit: 0, credit: 100 }
      ]
    }
  ];
  const controls = buildClosingControls(withUnknown, [period]);
  assert.equal(controls.ready, false);
  assert.ok(controls.blockerCount >= 1);
});

test("buildAgedBalance buckets receivables by age", () => {
  const asOf = "2026-12-31";
  const aged = buildAgedBalance(
    [
      {
        id: "old",
        date: "2026-01-01",
        reference: "OLD",
        description: "Vieille creance",
        lines: [
          { accountCode: "4111", auxiliaryCode: "C-OLD", debit: 300000, credit: 0 },
          { accountCode: "7011", debit: 0, credit: 300000 }
        ]
      }
    ],
    [{ code: "C-OLD", label: "Client ancien", accountCode: "4111" }],
    asOf,
    "411",
    "AR"
  );
  assert.equal(aged.length, 1);
  assert.equal(aged[0].total, 300000);
  assert.equal(aged[0].b90plus, 300000);
  assert.equal(aged[0].current, 0);
});

test("normalizeJournalEntry rounds money and fills defaults", () => {
  const normalized = normalizeJournalEntry({
    date: "2026-05-01",
    description: "Arrondi",
    source: "manual",
    lines: [
      { accountCode: "5211", debit: 100.005, credit: 0 },
      { accountCode: "7011", debit: 0, credit: 100.005 }
    ]
  });
  assert.equal(normalized.lines[0].debit, 100.01);
  assert.equal(normalized.reference, "MAN-20260501");
  assert.ok(normalized.id);
  assert.ok(normalized.createdAt);
});

test("totalsForLines sums debit and credit", () => {
  const totals = totalsForLines([
    { debit: 100, credit: 0 },
    { debit: 50.5, credit: 0 },
    { debit: 0, credit: 150.5 }
  ]);
  assert.equal(totals.debit, 150.5);
  assert.equal(totals.credit, 150.5);
});
