import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSyscohadaBalanceSheet,
  buildSyscohadaIncomeStatement,
  buildVatDeclaration
} from "../src/syscohadaReports.js";

// Coherent, balanced set of entries spanning the SYSCOHADA statement lines.
const entries = [
  {
    id: "e1",
    date: "2026-01-05",
    reference: "CAP",
    description: "Apport en capital",
    lines: [
      { accountCode: "5211", debit: 2000000, credit: 0 },
      { accountCode: "1013", debit: 0, credit: 2000000 }
    ]
  },
  {
    id: "e2",
    date: "2026-02-01",
    reference: "VTE",
    description: "Vente a credit",
    lines: [
      { accountCode: "4111", debit: 1000000, credit: 0 },
      { accountCode: "7011", debit: 0, credit: 1000000 }
    ]
  },
  {
    id: "e3",
    date: "2026-02-10",
    reference: "ACH",
    description: "Achat marchandises a credit",
    lines: [
      { accountCode: "6011", debit: 400000, credit: 0 },
      { accountCode: "4011", debit: 0, credit: 400000 }
    ]
  },
  {
    id: "e4",
    date: "2026-02-15",
    reference: "SRV",
    description: "Services exterieurs regles par banque",
    lines: [
      { accountCode: "6221", debit: 100000, credit: 0 },
      { accountCode: "5211", debit: 0, credit: 100000 }
    ]
  },
  {
    id: "e5",
    date: "2026-02-28",
    reference: "SAL",
    description: "Salaires regles par banque",
    lines: [
      { accountCode: "6611", debit: 150000, credit: 0 },
      { accountCode: "5211", debit: 0, credit: 150000 }
    ]
  }
];

test("SYSCOHADA income statement computes the management balances", () => {
  const income = buildSyscohadaIncomeStatement(entries);
  assert.equal(income.margeBrute, 600000); // 1,000,000 ventes - 400,000 achats
  assert.equal(income.valeurAjoutee, 500000); // marge - 100,000 services
  assert.equal(income.ebe, 350000); // VA - 150,000 personnel
  assert.equal(income.resultatExploitation, 350000);
  assert.equal(income.resultatNet, 350000);
});

test("SYSCOHADA balance sheet balances (actif = passif)", () => {
  const sheet = buildSyscohadaBalanceSheet(entries);
  assert.equal(sheet.actif.actifCirculantCreances, 1000000); // clients 4111
  assert.equal(sheet.actif.tresorerieActif, 1750000); // 2,000,000 - 100,000 - 150,000
  assert.equal(sheet.actif.totalActif, 2750000);
  assert.equal(sheet.passif.capitauxPropres, 2000000); // capital 1013
  assert.equal(sheet.passif.resultatNet, 350000);
  assert.equal(sheet.passif.passifCirculant, 400000); // fournisseurs 4011
  assert.equal(sheet.passif.totalPassif, 2750000);
  assert.equal(sheet.difference, 0);
});

test("VAT declaration nets collected against deductible", () => {
  const vatEntries = [
    {
      id: "v1",
      date: "2026-03-01",
      reference: "VTVA",
      description: "Vente avec TVA",
      lines: [
        { accountCode: "4111", debit: 1180000, credit: 0 },
        { accountCode: "7011", debit: 0, credit: 1000000 },
        { accountCode: "4431", debit: 0, credit: 180000 }
      ]
    },
    {
      id: "v2",
      date: "2026-03-05",
      reference: "ATVA",
      description: "Achat avec TVA",
      lines: [
        { accountCode: "6011", debit: 500000, credit: 0 },
        { accountCode: "4451", debit: 90000, credit: 0 },
        { accountCode: "4011", debit: 0, credit: 590000 }
      ]
    }
  ];
  const vat = buildVatDeclaration(vatEntries);
  assert.equal(vat.caHt, 1000000);
  assert.equal(vat.tvaCollectee, 180000);
  assert.equal(vat.tvaDeductible, 90000);
  assert.equal(vat.tvaNette, 90000);
  assert.equal(vat.tvaAPayer, 90000);
  assert.equal(vat.creditTva, 0);
});
