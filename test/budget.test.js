import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBudgetVsActual } from "../src/accounting.js";

const entries = [
  {
    id: "e1",
    date: "2026-02-01",
    reference: "ACH",
    description: "Achat",
    lines: [
      { accountCode: "6011", debit: 400000, credit: 0 },
      { accountCode: "5211", debit: 0, credit: 400000 }
    ]
  },
  {
    id: "e2",
    date: "2026-02-10",
    reference: "VTE",
    description: "Vente",
    lines: [
      { accountCode: "4111", debit: 1000000, credit: 0 },
      { accountCode: "7011", debit: 0, credit: 1000000 }
    ]
  }
];

test("buildBudgetVsActual compares budget to realized movements", () => {
  const rows = buildBudgetVsActual(
    [
      { id: "b1", accountCode: "6011", amount: 500000 },
      { id: "b2", accountCode: "7011", amount: 1200000 }
    ],
    entries
  );

  const purchase = rows.find((row) => row.accountCode === "6011");
  assert.equal(purchase.budget, 500000);
  assert.equal(purchase.actual, 400000);
  assert.equal(purchase.variance, 100000);
  assert.equal(purchase.consumedPct, 80);

  const sales = rows.find((row) => row.accountCode === "7011");
  assert.equal(sales.actual, 1000000);
  assert.equal(sales.consumedPct, 83.3);
});

test("buildBudgetVsActual treats accounts without movement as zero realized", () => {
  const rows = buildBudgetVsActual([{ id: "b3", accountCode: "6611", amount: 300000 }], entries);
  assert.equal(rows[0].actual, 0);
  assert.equal(rows[0].variance, 300000);
  assert.equal(rows[0].consumedPct, 0);
});
