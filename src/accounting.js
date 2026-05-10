import { accounts, inferAccountType } from "./ohadaChart.js";

export function validateJournalEntry(input, accountCatalog = accounts) {
  const errors = [];
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const accountByCode = mapAccounts(accountCatalog);

  if (!input.date || Number.isNaN(Date.parse(input.date))) {
    errors.push("La date de l'ecriture est obligatoire.");
  }

  if (!input.description || String(input.description).trim().length < 3) {
    errors.push("Le libelle doit contenir au moins 3 caracteres.");
  }

  if (!input.reference || String(input.reference).trim().length < 2) {
    errors.push("La reference de l'ecriture est obligatoire.");
  }

  if (lines.length < 2) {
    errors.push("Une ecriture doit contenir au moins deux lignes.");
  }

  for (const [index, line] of lines.entries()) {
    const account = accountByCode.get(String(line.accountCode));
    if (!account) {
      errors.push(`Ligne ${index + 1}: compte OHADA inconnu (${line.accountCode}).`);
    } else if (String(account.code).length !== 4) {
      errors.push(`Ligne ${index + 1}: le compte doit etre un compte imputable a 4 chiffres (${line.accountCode}).`);
    }

    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);

    if (debit < 0 || credit < 0) {
      errors.push(`Ligne ${index + 1}: les montants ne peuvent pas etre negatifs.`);
    }

    if (debit > 0 && credit > 0) {
      errors.push(`Ligne ${index + 1}: une ligne ne peut pas avoir debit et credit.`);
    }

    if (debit === 0 && credit === 0) {
      errors.push(`Ligne ${index + 1}: debit ou credit est obligatoire.`);
    }
  }

  const totals = totalsForLines(lines);
  if (roundMoney(totals.debit) !== roundMoney(totals.credit)) {
    errors.push(`Ecriture desequilibree: debit ${totals.debit}, credit ${totals.credit}.`);
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function normalizeJournalEntry(input) {
  return {
    id: input.id ?? crypto.randomUUID(),
    organizationId: input.organizationId,
    date: input.date,
    reference: String(input.reference || generateEntryReference(input)).trim(),
    description: String(input.description).trim(),
    source: input.source ?? "manual",
    batchId: input.batchId,
    bankFingerprint: input.bankFingerprint,
    createdAt: input.createdAt ?? new Date().toISOString(),
    lines: input.lines.map((line) => ({
      accountCode: String(line.accountCode),
      auxiliaryCode: line.auxiliaryCode ? String(line.auxiliaryCode).trim() : undefined,
      label: String(line.label || input.description).trim(),
      debit: roundMoney(Number(line.debit || 0)),
      credit: roundMoney(Number(line.credit || 0))
    }))
  };
}

export function buildGeneralLedger(entries, auxiliaryAccounts = [], accountCatalog = accounts) {
  const auxiliaryByCode = new Map(auxiliaryAccounts.map((auxiliary) => [auxiliary.code, auxiliary]));
  const accountByCode = mapAccounts(accountCatalog);
  return entries
    .flatMap((entry) => entry.lines.map((line, index) => {
      const account = accountByCode.get(String(line.accountCode));
      const auxiliary = line.auxiliaryCode ? auxiliaryByCode.get(line.auxiliaryCode) : null;
      return {
        entryId: entry.id,
        lineIndex: index + 1,
        date: entry.date,
        reference: entry.reference,
        description: entry.description,
        source: entry.source,
        accountCode: line.accountCode,
        accountLabel: account?.label ?? line.label,
        auxiliaryCode: line.auxiliaryCode,
        auxiliaryLabel: auxiliary?.label,
        label: line.label,
        debit: roundMoney(Number(line.debit || 0)),
        credit: roundMoney(Number(line.credit || 0))
      };
    }))
    .sort((a, b) =>
      a.date.localeCompare(b.date) ||
      String(a.reference || "").localeCompare(String(b.reference || ""), "fr", { numeric: true }) ||
      a.lineIndex - b.lineIndex
    );
}

export function buildTrialBalance(entries, accountCatalog = accounts) {
  const rows = accountCatalog.map((account) => ({
    code: account.code,
    label: account.label,
    type: account.reportType ?? account.type,
    classCode: account.classCode,
    classLabel: account.classLabel,
    groupCode: account.groupCode,
    groupLabel: account.groupLabel,
    debit: 0,
    credit: 0,
    balance: 0
  }));
  const rowByCode = new Map(rows.map((row) => [row.code, row]));

  for (const entry of entries) {
    for (const line of entry.lines) {
      const row = rowByCode.get(line.accountCode) ?? createUnknownRow(line.accountCode);
      if (!rowByCode.has(line.accountCode)) {
        rowByCode.set(line.accountCode, row);
        rows.push(row);
      }

      row.debit += Number(line.debit || 0);
      row.credit += Number(line.credit || 0);
    }
  }

  return rows
    .map((row) => ({
      ...row,
      debit: roundMoney(row.debit),
      credit: roundMoney(row.credit),
      balance: roundMoney(row.debit - row.credit),
      openingDebit: 0,
      openingCredit: 0,
      movementDebit: roundMoney(row.debit),
      movementCredit: roundMoney(row.credit),
      closingDebit: Math.max(roundMoney(row.debit - row.credit), 0),
      closingCredit: Math.max(roundMoney(row.credit - row.debit), 0)
    }))
    .filter((row) => row.debit !== 0 || row.credit !== 0);
}

export function buildIncomeStatement(entries, accountCatalog = accounts) {
  const balance = buildTrialBalance(entries, accountCatalog);
  const revenue = sumByType(balance, "revenue", (row) => row.credit - row.debit);
  const expenses = sumByType(balance, "expense", (row) => row.debit - row.credit);

  return {
    revenue: roundMoney(revenue),
    expenses: roundMoney(expenses),
    netIncome: roundMoney(revenue - expenses),
    rows: balance.filter((row) => ["revenue", "expense"].includes(row.type))
  };
}

export function buildBalanceSheet(entries, accountCatalog = accounts) {
  const balance = buildTrialBalance(entries, accountCatalog);
  const income = buildIncomeStatement(entries, accountCatalog);
  const assets = sumByType(balance, "asset", (row) => row.debit - row.credit);
  const liabilities = sumByType(balance, "liability", (row) => row.credit - row.debit);
  const equity = sumByType(balance, "equity", (row) => row.credit - row.debit);

  return {
    assets: roundMoney(assets),
    liabilities: roundMoney(liabilities),
    equity: roundMoney(equity),
    retainedEarnings: income.netIncome,
    liabilitiesAndEquity: roundMoney(liabilities + equity + income.netIncome),
    difference: roundMoney(assets - (liabilities + equity + income.netIncome)),
    rows: balance.filter((row) => ["asset", "liability", "equity"].includes(row.type))
  };
}

export function buildAuxiliaryBalance(entries, auxiliaryAccounts = []) {
  const rowsByCode = new Map(auxiliaryAccounts.map((auxiliary) => [
    auxiliary.code,
    {
      code: auxiliary.code,
      label: auxiliary.label,
      accountCode: auxiliary.accountCode,
      accountLabel: auxiliary.accountLabel,
      debit: 0,
      credit: 0,
      balance: 0
    }
  ]));

  for (const entry of entries) {
    for (const line of entry.lines) {
      if (!line.auxiliaryCode) continue;
      if (!rowsByCode.has(line.auxiliaryCode)) {
        rowsByCode.set(line.auxiliaryCode, {
          code: line.auxiliaryCode,
          label: "Auxiliaire non reference",
          accountCode: line.accountCode,
          accountLabel: "",
          debit: 0,
          credit: 0,
          balance: 0
        });
      }

      const row = rowsByCode.get(line.auxiliaryCode);
      row.debit += Number(line.debit || 0);
      row.credit += Number(line.credit || 0);
    }
  }

  return [...rowsByCode.values()]
    .map((row) => ({
      ...row,
      debit: roundMoney(row.debit),
      credit: roundMoney(row.credit),
      balance: roundMoney(row.debit - row.credit)
    }))
    .filter((row) => row.debit !== 0 || row.credit !== 0 || auxiliaryAccounts.some((auxiliary) => auxiliary.code === row.code))
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode, "fr", { numeric: true }) || a.code.localeCompare(b.code, "fr", { numeric: true }));
}

export function buildClosingControls(entries, periods = [], accountCatalog = accounts) {
  const trialBalance = buildTrialBalance(entries, accountCatalog);
  const balanceSheet = buildBalanceSheet(entries, accountCatalog);
  const totals = trialBalance.reduce(
    (sum, row) => ({
      debit: roundMoney(sum.debit + row.debit),
      credit: roundMoney(sum.credit + row.credit)
    }),
    { debit: 0, credit: 0 }
  );
  const unknownAccounts = trialBalance.filter((row) => row.type === "unknown");
  const entriesWithoutPeriod = entries.filter((entry) => !findPeriodForDate(periods, entry.date));
  const openPeriods = periods.filter((period) => period.status === "open");
  const lockedPeriods = periods.filter((period) => period.status === "locked");
  const receivables = balanceForAccount(trialBalance, "411");
  const payables = -balanceForAccount(trialBalance, "401");
  const bank = balanceForAccount(trialBalance, "52") + balanceForAccount(trialBalance, "57");

  const controls = [
    {
      id: "trial-balance",
      label: "Balance debit / credit",
      status: totals.debit === totals.credit ? "ok" : "blocker",
      detail: totals.debit === totals.credit
        ? `Total equilibre a ${formatMoney(totals.debit)}.`
        : `Ecart de ${formatMoney(Math.abs(totals.debit - totals.credit))}.`
    },
    {
      id: "balance-sheet",
      label: "Controle bilan",
      status: balanceSheet.difference === 0 ? "ok" : "blocker",
      detail: balanceSheet.difference === 0
        ? "Actif, passif et capitaux propres sont coherents."
        : `Ecart bilan de ${formatMoney(Math.abs(balanceSheet.difference))}.`
    },
    {
      id: "period-coverage",
      label: "Couverture des periodes",
      status: entriesWithoutPeriod.length === 0 ? "ok" : "warning",
      detail: entriesWithoutPeriod.length === 0
        ? "Toutes les ecritures appartiennent a un exercice configure."
        : `${entriesWithoutPeriod.length} ecriture(s) hors exercice configure.`
    },
    {
      id: "unknown-accounts",
      label: "Comptes references",
      status: unknownAccounts.length === 0 ? "ok" : "blocker",
      detail: unknownAccounts.length === 0
        ? "Aucun compte non reference dans la balance."
        : `${unknownAccounts.length} compte(s) a rattacher au plan OHADA.`
    },
    {
      id: "period-lock",
      label: "Verrouillage d'exercice",
      status: openPeriods.length === 0 && periods.length > 0 ? "ok" : "warning",
      detail: periods.length === 0
        ? "Aucun exercice configure."
        : `${openPeriods.length} exercice(s) ouvert(s), ${lockedPeriods.length} verrouille(s).`
    },
    {
      id: "third-parties",
      label: "Comptes tiers",
      status: receivables === 0 && payables === 0 ? "ok" : "warning",
      detail: `Clients ${formatMoney(receivables)} / fournisseurs ${formatMoney(payables)}.`
    },
    {
      id: "cash-position",
      label: "Tresorerie banque",
      status: bank >= 0 ? "ok" : "warning",
      detail: `Solde banque ${formatMoney(bank)}.`
    }
  ];

  return {
    ready: controls.every((control) => control.status !== "blocker"),
    blockerCount: controls.filter((control) => control.status === "blocker").length,
    warningCount: controls.filter((control) => control.status === "warning").length,
    okCount: controls.filter((control) => control.status === "ok").length,
    totals,
    controls
  };
}

export function totalsForLines(lines) {
  return lines.reduce(
    (totals, line) => ({
      debit: roundMoney(totals.debit + Number(line.debit || 0)),
      credit: roundMoney(totals.credit + Number(line.credit || 0))
    }),
    { debit: 0, credit: 0 }
  );
}

function sumByType(rows, type, amount) {
  return rows
    .filter((row) => row.type === type)
    .reduce((sum, row) => sum + amount(row), 0);
}

function createUnknownRow(code) {
  const classCode = String(code).at(0);
  return {
    code,
    label: "Compte non reference",
    type: inferAccountType(code),
    classCode,
    classLabel: `Classe ${classCode ?? "?"}`,
    groupCode: String(code).slice(0, 2),
    groupLabel: "Groupe non reference",
    debit: 0,
    credit: 0,
    balance: 0
  };
}

function mapAccounts(accountCatalog) {
  return new Map(accountCatalog.map((account) => [account.code, account]));
}

function balanceForAccount(rows, accountCode) {
  return roundMoney(rows
    .filter((row) => row.code === accountCode || row.code.startsWith(accountCode))
    .reduce((sum, row) => sum + row.balance, 0));
}

function findPeriodForDate(periods, date) {
  return periods.find((period) => date >= period.startDate && date <= period.endDate);
}

function formatMoney(amount) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(amount || 0))} FCFA`;
}

function generateEntryReference(input) {
  const prefix = {
    "bank-csv": "BAN",
    subscription: "ABN",
    seed: "INIT",
    manual: "MAN"
  }[input.source ?? "manual"] ?? "ECR";
  const datePart = String(input.date || new Date().toISOString().slice(0, 10)).replaceAll("-", "");
  return `${prefix}-${datePart}`;
}

function roundMoney(amount) {
  return Math.round((Number(amount) + Number.EPSILON) * 100) / 100;
}
