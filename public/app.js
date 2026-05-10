const state = {
  company: null,
  accounts: [],
  accountClasses: [],
  auxiliaryAccounts: [],
  entries: [],
  periods: [],
  importTransactions: [],
  batches: [],
  subscriptionBatches: [],
  lettering: { rows: [], groups: [] },
  reports: {
    trialBalance: [],
    generalLedger: [],
    auxiliaryBalance: [],
    balanceSheet: null,
    incomeStatement: null,
    closingControls: null
  }
};

const formatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0
});

const compactFormatter = new Intl.NumberFormat("fr-FR", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 0
});

const form = document.querySelector("#entry-form");
const linesEl = document.querySelector("#lines");
const template = document.querySelector("#line-template");
const messageEl = document.querySelector("#message");
const bankCsvEl = document.querySelector("#bank-csv");
const importPreviewEl = document.querySelector("#import-preview");
const importStatusEl = document.querySelector("#import-status");
const commitImportButton = document.querySelector("#commit-import");
const companyForm = document.querySelector("#company-form");
const companyMessageEl = document.querySelector("#company-message");
const subscriptionForm = document.querySelector("#subscription-form");
const subscriptionMessageEl = document.querySelector("#subscription-message");
const journalSearchEl = document.querySelector("#journal-search");
const journalSourceEl = document.querySelector("#journal-source");
const journalDetailEl = document.querySelector("#journal-detail");
const viewLabelEl = document.querySelector("#view-label");
const viewTitleEl = document.querySelector("#view-title");
const viewSubtitleEl = document.querySelector("#view-subtitle");
const uiThemeEl = document.querySelector("#ui-theme");
const accountSearchEl = document.querySelector("#account-search");
const accountClassFilterEl = document.querySelector("#account-class-filter");
const ledgerSearchEl = document.querySelector("#ledger-search");
const ledgerAccountFilterEl = document.querySelector("#ledger-account-filter");
const ledgerAuxiliaryFilterEl = document.querySelector("#ledger-auxiliary-filter");
const ledgerPartyFilterEl = document.querySelector("#ledger-party-filter");
const ledgerExportFormatEl = document.querySelector("#ledger-export-format");
const exportLedgerButton = document.querySelector("#export-ledger");
const printLedgerButton = document.querySelector("#print-ledger");
const letteringSearchEl = document.querySelector("#lettering-search");
const letteringAccountFilterEl = document.querySelector("#lettering-account-filter");
const letteringStatusFilterEl = document.querySelector("#lettering-status-filter");
const manualLetteringButton = document.querySelector("#manual-lettering");
const autoLetteringButton = document.querySelector("#auto-lettering");
const letteringMessageEl = document.querySelector("#lettering-message");
const balanceSearchEl = document.querySelector("#balance-search");
const balanceFormatEl = document.querySelector("#balance-format");
const balanceExportFormatEl = document.querySelector("#balance-export-format");
const exportBalanceButton = document.querySelector("#export-balance");
const printBalanceButton = document.querySelector("#print-balance");
const printAuxiliaryBalanceButton = document.querySelector("#print-auxiliary-balance");
const auxiliaryBalanceSearchEl = document.querySelector("#auxiliary-balance-search");
const auxiliaryBalancePartyFilterEl = document.querySelector("#auxiliary-balance-party-filter");
const reportPeriodEls = document.querySelectorAll("[data-report-period]");
const auxiliaryForm = document.querySelector("#auxiliary-form");
const auxiliaryMessageEl = document.querySelector("#auxiliary-message");
const autoBalanceEl = document.querySelector("#auto-balance");
const balanceEntryButton = document.querySelector("#balance-entry");
const entryBalanceStatusEl = document.querySelector("#entry-balance-status");
const accountOptionsEl = document.querySelector("#account-options");
const auxiliaryOptionsEl = document.querySelector("#auxiliary-options");
let isBalancingEntry = false;

document.querySelector("#add-line").addEventListener("click", () => {
  addLine();
  renderEntryBalanceStatus();
});
document.querySelector("#demo-sale").addEventListener("click", fillDemoSale);
document.querySelector("#load-sample").addEventListener("click", loadSampleCsv);
document.querySelector("#preview-import").addEventListener("click", previewImport);
uiThemeEl.addEventListener("change", () => setUiTheme(uiThemeEl.value));
balanceEntryButton.addEventListener("click", () => {
  balanceEntry();
  renderEntryBalanceStatus();
});
autoBalanceEl.addEventListener("change", () => {
  if (autoBalanceEl.checked) balanceEntry();
  renderEntryBalanceStatus();
});
commitImportButton.addEventListener("click", commitImport);
companyForm.addEventListener("submit", submitCompany);
subscriptionForm.addEventListener("submit", submitSubscription);
journalSearchEl.addEventListener("input", renderEntries);
journalSourceEl.addEventListener("change", renderEntries);
accountSearchEl.addEventListener("input", renderAccountCatalog);
accountClassFilterEl.addEventListener("change", renderAccountCatalog);
ledgerSearchEl.addEventListener("input", renderGeneralLedger);
ledgerAccountFilterEl.addEventListener("change", renderGeneralLedger);
ledgerAuxiliaryFilterEl.addEventListener("change", renderGeneralLedger);
ledgerPartyFilterEl.addEventListener("change", renderGeneralLedger);
exportLedgerButton.addEventListener("click", exportGeneralLedger);
printLedgerButton.addEventListener("click", () => printState(ledgerPrintTitle()));
letteringSearchEl.addEventListener("input", renderLettering);
letteringAccountFilterEl.addEventListener("change", renderLettering);
letteringStatusFilterEl.addEventListener("change", renderLettering);
manualLetteringButton.addEventListener("click", applyManualLettering);
autoLetteringButton.addEventListener("click", applyAutomaticLettering);
balanceSearchEl.addEventListener("input", renderTrialBalance);
balanceFormatEl.addEventListener("change", renderTrialBalance);
exportBalanceButton.addEventListener("click", exportTrialBalance);
printBalanceButton.addEventListener("click", () => printState(balancePrintTitle()));
printAuxiliaryBalanceButton.addEventListener("click", () => printState(auxiliaryBalancePrintTitle()));
auxiliaryBalanceSearchEl.addEventListener("input", renderAuxiliaries);
auxiliaryBalancePartyFilterEl.addEventListener("change", renderAuxiliaries);
reportPeriodEls.forEach((input) => input.addEventListener("change", () => updateReportPeriod(input)));
form.addEventListener("submit", submitEntry);
auxiliaryForm.addEventListener("submit", submitAuxiliaryAccount);
document.querySelectorAll("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.viewTarget));
});

const viewCopy = {
  dashboard: {
    label: "Dashboard / Tresorerie",
    title: '<span>Dashboard</span> et tresorerie.',
    subtitle: "Pilotez les saisies, imports, controles et premiers etats financiers depuis un espace structure."
  },
  journal: {
    label: "Journal",
    title: 'Revue des <span>ecritures</span> comptables.',
    subtitle: "Recherchez, controlez, detaillez et corrigez les mouvements comptables de l'exercice."
  },
  ledger: {
    label: "Grand livre",
    title: 'Grand <span>livre</span> exportable.',
    subtitle: "Consultez tous les mouvements par date, reference, compte et auxiliaire."
  },
  lettering: {
    label: "Lettrage",
    title: 'Lettrage <span>manuel</span> et automatique.',
    subtitle: "Selectionnez des lignes equilibrees ou laissez le systeme rapprocher les montants identiques par compte."
  },
  imports: {
    label: "Imports bancaires",
    title: 'Imports <span>bancaires</span> assistes.',
    subtitle: "Analysez les releves CSV, corrigez les comptes proposes, evitez les doublons et suivez les lots."
  },
  subscriptions: {
    label: "Abonnements",
    title: "Ecritures <span>d'abonnement</span>.",
    subtitle: "Generez automatiquement les ecritures mensuelles recurrentes sur une periode."
  },
  chart: {
    label: "Plan comptable",
    title: 'Plan <span>SYSCOHADA</span> exploitable.',
    subtitle: "Explorez les classes, familles et comptes issus des fichiers de reference ajoutes au projet."
  },
  auxiliaries: {
    label: "Auxiliaires",
    title: 'Comptes <span>auxiliaires</span> et tiers.',
    subtitle: "Creez des auxiliaires rattaches aux comptes collectifs et suivez leur balance dediee."
  },
  reports: {
    label: "Etats financiers",
    title: 'Etats <span>financiers</span> de controle.',
    subtitle: "Consultez la balance et les premiers indicateurs de coherence comptable."
  },
  settings: {
    label: "Parametres entreprise",
    title: 'Parametres de <span>l’entreprise</span>.',
    subtitle: "Mettez a jour la societe, la devise et les dates d'exercice utilisees dans les etats."
  }
};

await boot();

async function boot() {
  setUiTheme(localStorage.getItem("ohada-ui-theme") || "classic", false);
  const [company, accounts, accountClasses] = await Promise.all([
    fetchJson("/api/company"),
    fetchJson("/api/accounts"),
    fetchJson("/api/account-classes")
  ]);

  state.accounts = accounts;
  state.accountClasses = accountClasses;
  state.company = company;
  renderCompanyHeader();
  fillCompanyForm();
  form.elements.date.valueAsDate = new Date();
  form.elements.reference.value = nextManualReference();
  renderAccountOptions();
  initSubscriptionDefaults();

  addLine({ accountCode: "4111", debit: 250000, credit: 0 });
  addLine({ accountCode: "7061", debit: 0, credit: 250000 });
  form.elements.description.value = "Vente de services";
  renderEntryBalanceStatus();
  renderAccountClassFilter();
  renderAccountClasses();
  renderAccountCatalog();

  await refresh();
  setView(window.location.hash.replace("#", "") || "dashboard");
}

function setUiTheme(theme, persist = true) {
  const selectedTheme = theme === "linear-stripe" ? "linear-stripe" : "classic";
  document.body.dataset.uiTheme = selectedTheme;
  uiThemeEl.value = selectedTheme;
  if (persist) localStorage.setItem("ohada-ui-theme", selectedTheme);
}

function renderCompanyHeader() {
  const company = state.company;
  if (!company) return;
  document.querySelector("#company-name").textContent = company.name;
  document.querySelector("#company").textContent =
    `${company.country} - ${company.currency} - Exercice ${company.fiscalYearStart.slice(0, 4)}`;
}

function fillCompanyForm() {
  if (!state.company || !companyForm) return;
  companyForm.elements.name.value = state.company.name ?? "";
  companyForm.elements.country.value = state.company.country ?? "";
  companyForm.elements.currency.value = state.company.currency ?? "";
  companyForm.elements.fiscalYearStart.value = state.company.fiscalYearStart ?? "";
  companyForm.elements.fiscalYearEnd.value = state.company.fiscalYearEnd ?? "";
}

function initSubscriptionDefaults() {
  const today = new Date();
  const year = today.getFullYear();
  subscriptionForm.elements.name.value ||= "Loyer mensuel";
  subscriptionForm.elements.description.value ||= "Abonnement loyer bureau";
  subscriptionForm.elements.startDate.value ||= `${year}-01-05`;
  subscriptionForm.elements.endDate.value ||= `${year}-12-05`;
  subscriptionForm.elements.dayOfMonth.value ||= 5;
  subscriptionForm.elements.debitAccount.value ||= "6222";
  subscriptionForm.elements.creditAccount.value ||= "4011";
  subscriptionForm.elements.debitAmount.value ||= 300000;
  subscriptionForm.elements.creditAmount.value ||= 300000;
  syncSubscriptionLabel("debit");
  syncSubscriptionLabel("credit");
  subscriptionForm.elements.debitAccount.addEventListener("input", () => syncSubscriptionLabel("debit"));
  subscriptionForm.elements.creditAccount.addEventListener("input", () => syncSubscriptionLabel("credit"));
}

function syncSubscriptionLabel(side) {
  const accountInput = subscriptionForm.elements[`${side}Account`];
  const labelInput = subscriptionForm.elements[`${side}Label`];
  const label = accountLabelForInput(accountInput.value);
  if (label && (!labelInput.value.trim() || labelInput.dataset.autoFilled === "true")) {
    labelInput.value = label;
    labelInput.dataset.autoFilled = "true";
  }
  labelInput.addEventListener("input", () => {
    labelInput.dataset.autoFilled = "false";
  }, { once: true });
}

async function refresh() {
  const [company, entries, auxiliaryAccounts, reports, batches, subscriptionBatches, lettering, periods] = await Promise.all([
    fetchJson("/api/company"),
    fetchJson("/api/journal-entries"),
    fetchJson("/api/auxiliary-accounts"),
    fetchReportsForPeriod(),
    fetchJson("/api/bank-imports/batches"),
    fetchJson("/api/subscriptions"),
    fetchJson("/api/lettering"),
    fetchJson("/api/accounting-periods")
  ]);

  state.company = company;
  state.entries = entries;
  state.auxiliaryAccounts = auxiliaryAccounts;
  state.batches = batches;
  state.subscriptionBatches = subscriptionBatches;
  state.lettering = lettering;
  state.periods = periods;
  state.reports = reports;

  renderCompanyHeader();
  fillCompanyForm();
  renderAuxiliaryOptions();
  renderLedgerAccountFilter();
  renderLedgerAuxiliaryFilter();
  renderLetteringAccountFilter();
  renderMetrics();
  renderPeriods();
  renderClosingControls();
  renderTrialBalance();
  renderEntries();
  renderDashboardEntries();
  renderNavigation();
  renderBatches();
  renderSubscriptionBatches();
  renderAuxiliaries();
  renderGeneralLedger();
  renderLettering();
}

async function fetchReportsForPeriod() {
  const query = reportPeriodQuery();
  const [trialBalance, generalLedger, auxiliaryBalance, balanceSheet, incomeStatement, closingControls] = await Promise.all([
    fetchJson(`/api/reports/trial-balance${query}`),
    fetchJson(`/api/reports/general-ledger${query}`),
    fetchJson(`/api/reports/auxiliary-balance${query}`),
    fetchJson(`/api/reports/balance-sheet${query}`),
    fetchJson(`/api/reports/income-statement${query}`),
    fetchJson(`/api/reports/closing-controls${query}`)
  ]);
  return { trialBalance, generalLedger, auxiliaryBalance, balanceSheet, incomeStatement, closingControls };
}

async function updateReportPeriod(changedInput) {
  const periodSide = changedInput.dataset.reportPeriod;
  for (const input of reportPeriodEls) {
    if (input.dataset.reportPeriod === periodSide) input.value = changedInput.value;
  }
  state.reports = await fetchReportsForPeriod();
  renderLedgerAccountFilter();
  renderLedgerAuxiliaryFilter();
  renderMetrics();
  renderClosingControls();
  renderTrialBalance();
  renderAuxiliaries();
  renderGeneralLedger();
}

function setView(viewName) {
  const targetView = viewCopy[viewName] ? viewName : "dashboard";
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.dataset.view === targetView);
  });
  document.querySelectorAll(".nav-item[data-view-target]").forEach((item) => {
    item.classList.toggle("active", item.dataset.viewTarget === targetView);
  });
  viewLabelEl.textContent = viewCopy[targetView].label;
  viewTitleEl.innerHTML = viewCopy[targetView].title;
  viewSubtitleEl.textContent = viewCopy[targetView].subtitle;
  window.location.hash = targetView;
}

function addLine(values = {}) {
  const node = template.content.firstElementChild.cloneNode(true);
  const hasPresetAmount = Number(values.debit || 0) > 0 || Number(values.credit || 0) > 0;

  const accountInput = node.querySelector(".account");
  const lineLabelInput = node.querySelector(".line-label");
  accountInput.value = accountInputValue(values.accountCode ?? state.accounts.find((account) => account.isPostable)?.code ?? "");
  lineLabelInput.value = values.label ?? accountLabelForInput(accountInput.value);
  lineLabelInput.dataset.autoFilled = values.label ? "false" : "true";
  node.querySelector(".debit").value = values.debit ?? 0;
  node.querySelector(".credit").value = values.credit ?? 0;
  node.dataset.autoBalanced = "false";
  accountInput.addEventListener("input", () => syncLineLabelWithAccount(node));
  accountInput.addEventListener("change", () => syncLineLabelWithAccount(node, true));
  lineLabelInput.addEventListener("input", () => {
    lineLabelInput.dataset.autoFilled = "false";
  });
  node.querySelector(".debit").addEventListener("input", () => handleLineAmountInput(node, "debit"));
  node.querySelector(".credit").addEventListener("input", () => handleLineAmountInput(node, "credit"));
  node.querySelector(".remove-line").addEventListener("click", () => {
    node.remove();
    if (autoBalanceEl.checked) balanceEntry();
    renderEntryBalanceStatus();
  });
  linesEl.append(node);
  if (autoBalanceEl.checked) balanceEntry(null, hasPresetAmount ? null : node);
  renderEntryBalanceStatus();
}

async function submitEntry(event) {
  event.preventDefault();
  if (autoBalanceEl.checked) balanceEntry();
  setMessage("Enregistrement en cours...");

  const payload = {
    date: form.elements.date.value,
    reference: form.elements.reference.value,
    description: form.elements.description.value,
    lines: [...linesEl.querySelectorAll(".line-row")].map((row) => ({
      accountCode: parseAccountCode(row.querySelector(".account").value),
      auxiliaryCode: parseAuxiliaryCode(row.querySelector(".auxiliary").value),
      label: row.querySelector(".line-label").value || form.elements.description.value,
      debit: Number(row.querySelector(".debit").value || 0),
      credit: Number(row.querySelector(".credit").value || 0)
    }))
  };

  const response = await fetch("/api/journal-entries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const body = await response.json();
  if (!response.ok) {
    setMessage(body.errors?.join(" ") ?? body.error ?? "Ecriture refusee.", true);
    return;
  }

  setMessage("Ecriture enregistree.");
  form.elements.reference.value = nextManualReference();
  await refresh();
}

async function submitAuxiliaryAccount(event) {
  event.preventDefault();
  setAuxiliaryMessage("Creation en cours...");

  const payload = {
    code: auxiliaryForm.elements.code.value,
    label: auxiliaryForm.elements.label.value,
    accountCode: parseAccountCode(auxiliaryForm.elements.accountCode.value)
  };

  const response = await fetch("/api/auxiliary-accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json();

  if (!response.ok) {
    setAuxiliaryMessage(body.error ?? "Creation refusee.", true);
    return;
  }

  auxiliaryForm.reset();
  setAuxiliaryMessage("Auxiliaire cree.");
  await refresh();
}

async function submitCompany(event) {
  event.preventDefault();
  setCompanyMessage("Enregistrement en cours...");

  const payload = {
    name: companyForm.elements.name.value,
    country: companyForm.elements.country.value,
    currency: companyForm.elements.currency.value,
    fiscalYearStart: companyForm.elements.fiscalYearStart.value,
    fiscalYearEnd: companyForm.elements.fiscalYearEnd.value
  };

  const response = await fetch("/api/company", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json();

  if (!response.ok) {
    setCompanyMessage(body.errors?.join(" ") ?? body.error ?? "Parametres refuses.", true);
    return;
  }

  state.company = body.company;
  state.periods = body.accountingPeriods ?? state.periods;
  renderCompanyHeader();
  fillCompanyForm();
  renderPeriods();
  setCompanyMessage("Parametres de l'entreprise enregistres.");
  await refresh();
}

async function submitSubscription(event) {
  event.preventDefault();
  setSubscriptionMessage("Generation en cours...");

  const amountDebit = Number(subscriptionForm.elements.debitAmount.value || 0);
  const amountCredit = Number(subscriptionForm.elements.creditAmount.value || 0);
  const payload = {
    name: subscriptionForm.elements.name.value,
    description: subscriptionForm.elements.description.value,
    startDate: subscriptionForm.elements.startDate.value,
    endDate: subscriptionForm.elements.endDate.value,
    dayOfMonth: Number(subscriptionForm.elements.dayOfMonth.value || 1),
    lines: [
      {
        accountCode: parseAccountCode(subscriptionForm.elements.debitAccount.value),
        label: subscriptionForm.elements.debitLabel.value,
        debit: amountDebit,
        credit: 0
      },
      {
        accountCode: parseAccountCode(subscriptionForm.elements.creditAccount.value),
        label: subscriptionForm.elements.creditLabel.value,
        debit: 0,
        credit: amountCredit
      }
    ]
  };

  const response = await fetch("/api/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json();

  if (!response.ok) {
    setSubscriptionMessage(body.errors?.join(" ") ?? body.error ?? "Generation refusee.", true);
    return;
  }

  setSubscriptionMessage(`${body.entries.length} ecriture(s) d'abonnement generee(s).`);
  await refresh();
}

function fillDemoSale() {
  linesEl.replaceChildren();
  form.elements.reference.value = nextManualReference("FAC");
  form.elements.description.value = "Vente de marchandises client beta";
  addLine({ accountCode: "4111", debit: 375000, credit: 0 });
  addLine({ accountCode: "7011", debit: 0, credit: 375000 });
  renderEntryBalanceStatus();
  setMessage("Modele de vente charge.");
}

function handleLineAmountInput(row, side) {
  if (isBalancingEntry) return;

  const debitInput = row.querySelector(".debit");
  const creditInput = row.querySelector(".credit");
  row.dataset.autoBalanced = "false";

  if (side === "debit" && Number(debitInput.value || 0) > 0) {
    creditInput.value = 0;
  }
  if (side === "credit" && Number(creditInput.value || 0) > 0) {
    debitInput.value = 0;
  }

  if (autoBalanceEl.checked) balanceEntry(row);
  renderEntryBalanceStatus();
}

function balanceEntry(sourceRow = null, preferredTarget = null) {
  const rows = [...linesEl.querySelectorAll(".line-row")];
  if (rows.length < 2) return;

  const target = findBalanceTarget(rows, sourceRow, preferredTarget);
  if (!target) return;

  const totals = totalsForEntryRows(rows.filter((row) => row !== target));
  const difference = roundMoney(totals.debit - totals.credit);

  isBalancingEntry = true;
  setLineAmount(target, difference < 0 ? Math.abs(difference) : 0, difference > 0 ? difference : 0);
  target.dataset.autoBalanced = "true";
  isBalancingEntry = false;
}

function findBalanceTarget(rows, sourceRow, preferredTarget) {
  if (preferredTarget && preferredTarget !== sourceRow && rows.includes(preferredTarget)) {
    return preferredTarget;
  }

  const existingAuto = [...rows].reverse().find((row) => row !== sourceRow && row.dataset.autoBalanced === "true");
  if (existingAuto) return existingAuto;

  const emptyRow = [...rows].reverse().find((row) => row !== sourceRow && lineDebit(row) === 0 && lineCredit(row) === 0);
  if (emptyRow) return emptyRow;

  return [...rows].reverse().find((row) => row !== sourceRow) ?? null;
}

function renderEntryBalanceStatus() {
  const rows = [...linesEl.querySelectorAll(".line-row")];
  const totals = totalsForEntryRows(rows);
  const difference = roundMoney(totals.debit - totals.credit);
  const base = `${rows.length} ligne(s) - Debit ${money(totals.debit)} / Credit ${money(totals.credit)}`;
  entryBalanceStatusEl.textContent = difference === 0
    ? `${base} - equilibre`
    : `${base} - ecart ${money(Math.abs(difference))}`;
  entryBalanceStatusEl.classList.toggle("unbalanced", difference !== 0);
}

function totalsForEntryRows(rows) {
  return rows.reduce(
    (totals, row) => ({
      debit: roundMoney(totals.debit + lineDebit(row)),
      credit: roundMoney(totals.credit + lineCredit(row))
    }),
    { debit: 0, credit: 0 }
  );
}

function setLineAmount(row, debit, credit) {
  row.querySelector(".debit").value = formatInputAmount(debit);
  row.querySelector(".credit").value = formatInputAmount(credit);
}

function lineDebit(row) {
  return Number(row.querySelector(".debit").value || 0);
}

function lineCredit(row) {
  return Number(row.querySelector(".credit").value || 0);
}

function formatInputAmount(amount) {
  const rounded = roundMoney(amount);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded.toFixed(2));
}

async function loadSampleCsv() {
  const response = await fetch("/api/bank-imports/sample");
  bankCsvEl.value = await response.text();
  setImportStatus("Exemple charge", "terra");
  commitImportButton.disabled = true;
  importPreviewEl.innerHTML = "";
}

async function previewImport() {
  setImportStatus("Analyse...", "terra");
  commitImportButton.disabled = true;

  const response = await fetch("/api/bank-imports/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ csv: bankCsvEl.value })
  });
  const body = await response.json();

  if (!response.ok) {
    importPreviewEl.innerHTML = `<div class="message error">${escapeHtml(body.errors?.join(" ") ?? "CSV refuse.")}</div>`;
    setImportStatus("Erreur", "terra");
    return;
  }

  renderImportPreview(body.transactions);
  state.importTransactions = body.transactions;
  const duplicateCount = body.transactions.filter((transaction) => transaction.duplicate).length;
  const importableCount = body.transactions.length - duplicateCount;
  setImportStatus(`${importableCount} a importer / ${duplicateCount} doublon(s)`, duplicateCount > 0 ? "terra" : "");
  commitImportButton.disabled = importableCount === 0;
}

async function commitImport() {
  setImportStatus("Import...", "terra");
  commitImportButton.disabled = true;

  const response = await fetch("/api/bank-imports/commit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ csv: bankCsvEl.value, transactions: collectEditedImportTransactions() })
  });
  const body = await response.json();

  if (!response.ok) {
    importPreviewEl.innerHTML = `<div class="message error">${escapeHtml(body.errors?.join(" ") ?? "Import refuse.")}</div>`;
    setImportStatus("Erreur", "terra");
    return;
  }

  setImportStatus(`${body.importedCount} importees`, "");
  importPreviewEl.innerHTML =
    `<div class="message">${body.importedCount} ecritures ajoutees. ${body.duplicateCount} doublon(s) ignore(s). ${body.learnedCount} correction(s) memorisee(s).</div>`;
  state.importTransactions = [];
  await refresh();
}

function renderMetrics() {
  const { balanceSheet, incomeStatement } = state.reports;
  document.querySelector("#assets").textContent = compactMoney(balanceSheet.assets);
  document.querySelector("#net-income").textContent = compactMoney(incomeStatement.netIncome);
  document.querySelector("#difference").textContent = compactMoney(balanceSheet.difference);
  document.querySelector("#entry-total").textContent = state.entries.length;
}

function renderNavigation() {
  document.querySelector("#entry-count").textContent = state.entries.length;
}

function renderPeriods() {
  const current = state.periods[0];
  if (!current) {
    document.querySelector("#period-status").textContent = "Aucune periode";
    document.querySelector("#period-status").classList.add("terra");
    document.querySelector("#periods").innerHTML = `<div class="message">Aucune periode comptable configuree.</div>`;
    return;
  }

  document.querySelector("#period-status").textContent = current.status === "locked" ? "Verrouille" : "Ouvert";
  document.querySelector("#period-status").classList.toggle("terra", current.status === "locked");
  document.querySelector("#periods").innerHTML = state.periods.map((period) => `
    <article class="period ${period.status === "locked" ? "locked" : ""}">
      <div>
        <strong>${escapeHtml(period.name)}</strong>
        <span>${escapeHtml(period.startDate)} au ${escapeHtml(period.endDate)}</span>
        ${period.lockedAt ? `<span>Verrouille le ${formatDateTime(period.lockedAt)}</span>` : `<span>Saisie et imports autorises</span>`}
      </div>
      <button class="btn ${period.status === "locked" ? "" : "btn-primary"}" type="button" data-period-action="${period.status === "locked" ? "unlock" : "lock"}" data-period-id="${escapeHtml(period.id)}">
        ${period.status === "locked" ? "Rouvrir" : "Verrouiller"}
      </button>
    </article>
  `).join("");

  for (const button of document.querySelectorAll("[data-period-action]")) {
    button.addEventListener("click", () => updatePeriodStatus(button.dataset.periodId, button.dataset.periodAction));
  }
}

function renderClosingControls() {
  const closing = state.reports.closingControls;
  if (!closing) return;

  const statusLabel = closing.ready ? "Pret" : `${closing.blockerCount} blocage(s)`;
  for (const node of [document.querySelector("#closing-status"), document.querySelector("#reports-closing-status")]) {
    node.textContent = statusLabel;
    node.classList.toggle("terra", !closing.ready);
  }

  document.querySelector("#closing-summary").innerHTML = `
    <div class="closing-count">
      <strong>${closing.okCount}</strong>
      <span>Valides</span>
    </div>
    <div class="closing-count">
      <strong>${closing.warningCount}</strong>
      <span>A surveiller</span>
    </div>
    <div class="closing-count">
      <strong>${closing.blockerCount}</strong>
      <span>Bloquants</span>
    </div>
  `;

  const controlsHtml = closing.controls.map((control) => `
    <article class="closing-control ${escapeHtml(control.status)}">
      <span class="closing-dot"></span>
      <div>
        <strong>${escapeHtml(control.label)}</strong>
        <span>${escapeHtml(control.detail)}</span>
      </div>
    </article>
  `).join("");

  document.querySelector("#closing-controls").innerHTML = controlsHtml;
  document.querySelector("#reports-closing-controls").innerHTML = controlsHtml;
}

async function updatePeriodStatus(periodId, action) {
  const verb = action === "lock" ? "verrouiller" : "rouvrir";
  if (!confirm(`Voulez-vous ${verb} cette periode ?`)) return;

  const response = await fetch(`/api/accounting-periods/${encodeURIComponent(periodId)}/${action}`, { method: "POST" });
  const body = await response.json();
  if (!response.ok) {
    setMessage(body.error ?? "Action impossible.", true);
    return;
  }

  setMessage(action === "lock" ? "Periode verrouillee." : "Periode rouverte.");
  await refresh();
}

function renderBatches() {
  document.querySelector("#batch-count").textContent = `${state.batches.length} lot(s)`;
  document.querySelector("#batches").innerHTML = state.batches
    .slice(0, 8)
    .map((batch) => `
      <article class="batch ${batch.status === "voided" ? "voided" : ""}">
        <div>
          <strong>${formatDateTime(batch.createdAt)}</strong>
          <span>${batch.importedCount} importee(s), ${batch.duplicateCount} doublon(s), ${batch.learnedCount} correction(s)</span>
        </div>
        <div class="batch-actions">
          <span class="confidence">${batch.status === "voided" ? "Annule" : "Poste"}</span>
          ${batch.status === "posted" ? `<button class="btn" type="button" data-void-batch="${escapeHtml(batch.id)}">Annuler</button>` : ""}
        </div>
      </article>
    `)
    .join("");

  for (const button of document.querySelectorAll("[data-void-batch]")) {
    button.addEventListener("click", () => voidBatch(button.dataset.voidBatch));
  }
}

function renderSubscriptionBatches() {
  document.querySelector("#subscription-count").textContent = `${state.subscriptionBatches.length} lot(s)`;
  document.querySelector("#subscription-batches").innerHTML = state.subscriptionBatches
    .slice(0, 8)
    .map((batch) => `
      <article class="batch">
        <div>
          <strong>${escapeHtml(batch.name)}</strong>
          <span>${escapeHtml(batch.startDate)} au ${escapeHtml(batch.endDate)} - ${batch.entryCount} ecriture(s)</span>
          <span>${escapeHtml(batch.description)}</span>
        </div>
        <div class="batch-actions">
          <span class="confidence">Mensuel</span>
          <span>${formatDateTime(batch.createdAt)}</span>
        </div>
      </article>
    `)
    .join("");

  if (state.subscriptionBatches.length === 0) {
    document.querySelector("#subscription-batches").innerHTML = `<div class="message">Aucun abonnement genere.</div>`;
  }
}

async function voidBatch(batchId) {
  const response = await fetch(`/api/bank-imports/batches/${batchId}/void`, { method: "POST" });
  const body = await response.json();

  if (!response.ok) {
    setImportStatus(body.error ?? "Annulation impossible", "terra");
    return;
  }

  setImportStatus(`${body.removedCount} ecriture(s) annulee(s)`, "");
  await refresh();
}

function renderTrialBalance() {
  const format = balanceFormatEl.value;
  const rows = filteredTrialBalance();
  document.querySelector("#trial-balance-head").innerHTML = format === "8"
    ? `
      <tr>
        <th>Compte</th>
        <th>Libelle</th>
        <th>Initial debit</th>
        <th>Initial credit</th>
        <th>Mouvement debit</th>
        <th>Mouvement credit</th>
        <th>Solde debit</th>
        <th>Solde credit</th>
      </tr>
    `
    : `
      <tr>
        <th>Compte</th>
        <th>Libelle</th>
        <th>Mouvement debit</th>
        <th>Mouvement credit</th>
        <th>Solde debit</th>
        <th>Solde credit</th>
      </tr>
    `;

  document.querySelector("#trial-balance").innerHTML = rows
    .map((row) => format === "8" ? renderTrialBalance8Columns(row) : renderTrialBalance6Columns(row))
    .join("");

  if (rows.length > 0) {
    const totals = totalTrialBalanceRows(rows);
    renderTotalsStrip("#trial-balance-totals", trialBalanceTotalsItems(totals, format));
    document.querySelector("#trial-balance").innerHTML += format === "8"
      ? renderTrialBalance8Columns(totals, "Totaux")
      : renderTrialBalance6Columns(totals, "Totaux");
  } else {
    renderTotalsStrip("#trial-balance-totals", []);
  }

  if (rows.length === 0) {
    document.querySelector("#trial-balance").innerHTML = `
      <tr>
        <td colspan="${format === "8" ? 8 : 6}">Aucun compte ne correspond aux filtres.</td>
      </tr>
    `;
  }
}

function renderTrialBalance6Columns(row, label = row.label) {
  return `
    <tr class="${label === "Totaux" ? "total-row" : ""}">
      <td>${escapeHtml(row.code)}</td>
      <td>${escapeHtml(label)}</td>
      <td>${money(row.movementDebit ?? row.debit)}</td>
      <td>${money(row.movementCredit ?? row.credit)}</td>
      <td>${money(row.closingDebit ?? Math.max(row.balance, 0))}</td>
      <td>${money(row.closingCredit ?? Math.max(-row.balance, 0))}</td>
    </tr>
  `;
}

function renderTrialBalance8Columns(row, label = row.label) {
  return `
    <tr class="${label === "Totaux" ? "total-row" : ""}">
      <td>${escapeHtml(row.code)}</td>
      <td>${escapeHtml(label)}</td>
      <td>${money(row.openingDebit ?? 0)}</td>
      <td>${money(row.openingCredit ?? 0)}</td>
      <td>${money(row.movementDebit ?? row.debit)}</td>
      <td>${money(row.movementCredit ?? row.credit)}</td>
      <td>${money(row.closingDebit ?? Math.max(row.balance, 0))}</td>
      <td>${money(row.closingCredit ?? Math.max(-row.balance, 0))}</td>
    </tr>
  `;
}

function totalTrialBalanceRows(rows) {
  return rows.reduce((totals, row) => ({
    code: "",
    label: "Totaux",
    openingDebit: roundMoney(totals.openingDebit + Number(row.openingDebit ?? 0)),
    openingCredit: roundMoney(totals.openingCredit + Number(row.openingCredit ?? 0)),
    movementDebit: roundMoney(totals.movementDebit + Number(row.movementDebit ?? row.debit ?? 0)),
    movementCredit: roundMoney(totals.movementCredit + Number(row.movementCredit ?? row.credit ?? 0)),
    closingDebit: roundMoney(totals.closingDebit + Number(row.closingDebit ?? Math.max(row.balance, 0))),
    closingCredit: roundMoney(totals.closingCredit + Number(row.closingCredit ?? Math.max(-row.balance, 0)))
  }), {
    openingDebit: 0,
    openingCredit: 0,
    movementDebit: 0,
    movementCredit: 0,
    closingDebit: 0,
    closingCredit: 0
  });
}

function trialBalanceTotalsItems(totals, format) {
  const common = [
    ["Mouvement debit", totals.movementDebit],
    ["Mouvement credit", totals.movementCredit],
    ["Solde debit", totals.closingDebit],
    ["Solde credit", totals.closingCredit]
  ];
  if (format !== "8") return common;
  return [
    ["Initial debit", totals.openingDebit],
    ["Initial credit", totals.openingCredit],
    ...common
  ];
}

function filteredTrialBalance() {
  const query = balanceSearchEl.value.trim().toLowerCase();
  return state.reports.trialBalance.filter((row) => {
    const haystack = [
      row.code,
      row.label,
      row.classCode,
      row.classLabel,
      row.groupCode,
      row.groupLabel,
      row.type
    ].join(" ").toLowerCase();
    return !query || haystack.includes(query);
  });
}

function exportTrialBalance() {
  const format = balanceFormatEl.value;
  const header = format === "8"
    ? ["Compte", "Libelle", "Initial debit", "Initial credit", "Mouvement debit", "Mouvement credit", "Solde debit", "Solde credit"]
    : ["Compte", "Libelle", "Mouvement debit", "Mouvement credit", "Solde debit", "Solde credit"];
  const filteredRows = filteredTrialBalance();
  const totalRow = totalTrialBalanceRows(filteredRows);
  const exportRows = filteredRows.length > 0 ? [...filteredRows, totalRow] : [];
  const rows = exportRows.map((row) => format === "8"
    ? [
      row.code,
      row.label,
      row.openingDebit ?? 0,
      row.openingCredit ?? 0,
      row.movementDebit ?? row.debit,
      row.movementCredit ?? row.credit,
      row.closingDebit ?? Math.max(row.balance, 0),
      row.closingCredit ?? Math.max(-row.balance, 0)
    ]
    : [
      row.code,
      row.label,
      row.movementDebit ?? row.debit,
      row.movementCredit ?? row.credit,
      row.closingDebit ?? Math.max(row.balance, 0),
      row.closingCredit ?? Math.max(-row.balance, 0)
    ]);
  downloadExport(
    [header, ...rows],
    `balance-${format}-colonnes${reportPeriodSlug()}-${new Date().toISOString().slice(0, 10)}`,
    balanceExportFormatEl.value,
    balancePrintTitle()
  );
}

function renderLedgerAccountFilter() {
  const usedCodes = [...new Set(state.reports.generalLedger.map((row) => row.accountCode))].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  ledgerAccountFilterEl.innerHTML = `
    <option value="all">Tous comptes</option>
    ${usedCodes.map((code) => {
      const account = state.accounts.find((candidate) => candidate.code === code);
      return `<option value="${escapeHtml(code)}">${escapeHtml(code)} - ${escapeHtml(account?.label ?? "")}</option>`;
    }).join("")}
  `;
}

function renderLedgerAuxiliaryFilter() {
  const usedCodes = [...new Set(state.reports.generalLedger.map((row) => row.auxiliaryCode).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  ledgerAuxiliaryFilterEl.innerHTML = `
    <option value="all">Tous auxiliaires</option>
    ${usedCodes.map((code) => {
      const auxiliary = state.auxiliaryAccounts.find((candidate) => candidate.code === code);
      return `<option value="${escapeHtml(code)}">${escapeHtml(code)} - ${escapeHtml(auxiliary?.label ?? "")}</option>`;
    }).join("")}
  `;
}

function renderGeneralLedger() {
  const rows = filteredGeneralLedger();
  const totals = totalDebitCreditRows(rows);
  renderTotalsStrip("#ledger-totals", rows.length > 0 ? [
    ["Debit", totals.debit],
    ["Credit", totals.credit],
    ["Ecart", roundMoney(totals.debit - totals.credit)]
  ] : []);
  document.querySelector("#general-ledger").innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(row.reference ?? "")}</td>
      <td>${escapeHtml(row.accountCode)} - ${escapeHtml(row.accountLabel ?? "")}</td>
      <td>${row.auxiliaryCode ? `${escapeHtml(row.auxiliaryCode)} - ${escapeHtml(row.auxiliaryLabel ?? "")}` : ""}</td>
      <td>${escapeHtml(row.label || row.description)}</td>
      <td>${money(row.debit)}</td>
      <td>${money(row.credit)}</td>
    </tr>
  `).join("");

  if (rows.length > 0) {
    document.querySelector("#general-ledger").innerHTML += `
      <tr class="total-row">
        <td colspan="5">Totaux</td>
        <td>${money(totals.debit)}</td>
        <td>${money(totals.credit)}</td>
      </tr>
    `;
  }

  if (rows.length === 0) {
    document.querySelector("#general-ledger").innerHTML = `
      <tr>
        <td colspan="7">Aucun mouvement ne correspond aux filtres.</td>
      </tr>
    `;
  }
}

function filteredGeneralLedger() {
  const query = ledgerSearchEl.value.trim().toLowerCase();
  const accountCode = ledgerAccountFilterEl.value;
  const auxiliaryCode = ledgerAuxiliaryFilterEl.value;
  const partyKind = ledgerPartyFilterEl.value;
  return state.reports.generalLedger.filter((row) => {
    const matchesAccount = accountCode === "all" || row.accountCode === accountCode;
    const matchesAuxiliary = auxiliaryCode === "all" || row.auxiliaryCode === auxiliaryCode;
    const matchesParty = partyKind === "all" || accountPartyKind(row.accountCode) === partyKind;
    const haystack = [
      row.date,
      row.reference,
      row.description,
      row.accountCode,
      row.accountLabel,
      row.auxiliaryCode,
      row.auxiliaryLabel,
      row.label,
      row.source
    ].join(" ").toLowerCase();
    return matchesAccount && matchesAuxiliary && matchesParty && (!query || haystack.includes(query));
  });
}

function exportGeneralLedger() {
  const rows = filteredGeneralLedger();
  const totals = totalDebitCreditRows(rows);
  const header = ["Date", "Reference", "Compte", "Libelle compte", "Auxiliaire", "Libelle auxiliaire", "Libelle", "Debit", "Credit", "Source"];
  const selectedAccount = ledgerAccountFilterEl.value === "all" ? "tous-comptes" : `compte-${ledgerAccountFilterEl.value}`;
  const selectedAuxiliary = ledgerAuxiliaryFilterEl.value === "all" ? "" : `-aux-${ledgerAuxiliaryFilterEl.value}`;
  const selectedParty = ledgerPartyFilterEl.value === "all" ? "" : `-${ledgerPartyFilterEl.value}`;
  downloadExport([
    header,
    ...rows.map((row) => [
      row.date,
      row.reference ?? "",
      row.accountCode,
      row.accountLabel ?? "",
      row.auxiliaryCode ?? "",
      row.auxiliaryLabel ?? "",
      row.label || row.description,
      row.debit,
      row.credit,
      sourceLabel(row.source)
    ]),
    ["", "", "", "", "", "", "Totaux", totals.debit, totals.credit, ""]
  ], `grand-livre-${selectedAccount}${selectedAuxiliary}${selectedParty}${reportPeriodSlug()}-${new Date().toISOString().slice(0, 10)}`, ledgerExportFormatEl.value, ledgerPrintTitle());
}

function renderLetteringAccountFilter() {
  const currentValue = letteringAccountFilterEl.value || "all";
  const usedCodes = [...new Set(state.lettering.rows.map((row) => row.accountCode))]
    .sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  letteringAccountFilterEl.innerHTML = `
    <option value="all">Tous comptes</option>
    ${usedCodes.map((code) => {
      const account = state.accounts.find((candidate) => candidate.code === code);
      return `<option value="${escapeHtml(code)}">${escapeHtml(code)} - ${escapeHtml(account?.label ?? "")}</option>`;
    }).join("")}
  `;
  letteringAccountFilterEl.value = [...usedCodes, "all"].includes(currentValue) ? currentValue : "all";
}

function renderLettering() {
  const rows = filteredLetteringRows();
  const openRows = rows.filter((row) => !row.letteringCode);
  const totals = totalDebitCreditRows(openRows);
  renderTotalsStrip("#lettering-totals", [
    ["Debit ouvert", totals.debit],
    ["Credit ouvert", totals.credit],
    ["Ecart selection visible", roundMoney(totals.debit - totals.credit)]
  ]);

  document.querySelector("#lettering-rows").innerHTML = rows.map((row) => `
    <tr class="${row.letteringCode ? "muted-row" : ""}">
      <td>
        <input type="checkbox" data-lettering-line="${escapeHtml(row.lineRef)}" ${row.letteringCode ? "disabled" : ""} />
      </td>
      <td>${escapeHtml(row.date)}</td>
      <td>${escapeHtml(row.reference ?? "")}</td>
      <td>${escapeHtml(row.accountCode)} - ${escapeHtml(row.accountLabel ?? "")}</td>
      <td>${row.auxiliaryCode ? `${escapeHtml(row.auxiliaryCode)} - ${escapeHtml(row.auxiliaryLabel ?? "")}` : ""}</td>
      <td>${escapeHtml(row.label || row.description)}</td>
      <td>${money(row.debit)}</td>
      <td>${money(row.credit)}</td>
      <td>${row.letteringCode ? `${escapeHtml(row.letteringCode)} (${row.letteringMode === "automatic" ? "auto" : "manuel"})` : "Ouvert"}</td>
    </tr>
  `).join("");

  if (rows.length === 0) {
    document.querySelector("#lettering-rows").innerHTML = `
      <tr>
        <td colspan="9">Aucune ligne ne correspond aux filtres.</td>
      </tr>
    `;
  }
}

function filteredLetteringRows() {
  const query = letteringSearchEl.value.trim().toLowerCase();
  const accountCode = letteringAccountFilterEl.value;
  const status = letteringStatusFilterEl.value;
  return state.lettering.rows.filter((row) => {
    const matchesAccount = accountCode === "all" || row.accountCode === accountCode;
    const matchesStatus =
      status === "all" ||
      (status === "open" && !row.letteringCode) ||
      (status === "lettered" && row.letteringCode);
    const haystack = [
      row.date,
      row.reference,
      row.description,
      row.accountCode,
      row.accountLabel,
      row.auxiliaryCode,
      row.auxiliaryLabel,
      row.label,
      row.letteringCode
    ].join(" ").toLowerCase();
    return matchesAccount && matchesStatus && (!query || haystack.includes(query));
  });
}

async function applyManualLettering() {
  const lineRefs = [...document.querySelectorAll("[data-lettering-line]:checked")].map((input) => input.dataset.letteringLine);
  setLetteringMessage("Lettrage manuel en cours...");
  const response = await fetch("/api/lettering/manual", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lineRefs })
  });
  const body = await response.json();
  if (!response.ok) {
    setLetteringMessage(body.error ?? "Lettrage refuse.", true);
    return;
  }
  setLetteringMessage(`Lettrage ${body.group.code} applique.`);
  await refresh();
}

async function applyAutomaticLettering() {
  const accountCode = letteringAccountFilterEl.value === "all" ? "" : letteringAccountFilterEl.value;
  setLetteringMessage("Lettrage automatique en cours...");
  const response = await fetch("/api/lettering/auto", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountCode })
  });
  const body = await response.json();
  if (!response.ok) {
    setLetteringMessage(body.error ?? "Lettrage automatique refuse.", true);
    return;
  }
  setLetteringMessage(`${body.groups.length} rapprochement(s), ${body.matchedLineCount} ligne(s) lettree(s).`);
  await refresh();
}

function renderAuxiliaries() {
  document.querySelector("#auxiliary-count").textContent = `${state.auxiliaryAccounts.length} auxiliaire(s)`;
  const rows = filteredAuxiliaryBalance();
  const totals = totalAuxiliaryBalanceRows(rows);
  renderTotalsStrip("#auxiliary-balance-totals", rows.length > 0 ? [
    ["Debit", totals.debit],
    ["Credit", totals.credit],
    ["Solde", totals.balance]
  ] : []);
  document.querySelector("#auxiliary-balance").innerHTML = rows
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.code)} - ${escapeHtml(row.label)}</td>
        <td>${escapeHtml(row.accountCode)} ${escapeHtml(row.accountLabel ?? "")}</td>
        <td>${money(row.debit)}</td>
        <td>${money(row.credit)}</td>
        <td>${money(row.balance)}</td>
      </tr>
    `)
    .join("");

  if (rows.length > 0) {
    document.querySelector("#auxiliary-balance").innerHTML += `
      <tr class="total-row">
        <td colspan="2">Totaux</td>
        <td>${money(totals.debit)}</td>
        <td>${money(totals.credit)}</td>
        <td>${money(totals.balance)}</td>
      </tr>
    `;
  }

  if (rows.length === 0) {
    document.querySelector("#auxiliary-balance").innerHTML = `
      <tr>
        <td colspan="5">Aucun mouvement auxiliaire.</td>
      </tr>
    `;
  }
}

function totalDebitCreditRows(rows) {
  return rows.reduce((totals, row) => ({
    debit: roundMoney(totals.debit + Number(row.debit || 0)),
    credit: roundMoney(totals.credit + Number(row.credit || 0))
  }), { debit: 0, credit: 0 });
}

function totalAuxiliaryBalanceRows(rows) {
  return rows.reduce((totals, row) => ({
    debit: roundMoney(totals.debit + Number(row.debit || 0)),
    credit: roundMoney(totals.credit + Number(row.credit || 0)),
    balance: roundMoney(totals.balance + Number(row.balance || 0))
  }), { debit: 0, credit: 0, balance: 0 });
}

function renderTotalsStrip(selector, items) {
  const target = document.querySelector(selector);
  target.innerHTML = items.map(([label, value]) => `
    <div class="total-chip">
      <span>${escapeHtml(label)}</span>
      <strong>${money(value)}</strong>
    </div>
  `).join("");
}

function filteredAuxiliaryBalance() {
  const query = auxiliaryBalanceSearchEl.value.trim().toLowerCase();
  const partyKind = auxiliaryBalancePartyFilterEl.value;
  return state.reports.auxiliaryBalance.filter((row) => {
    const matchesParty = partyKind === "all" || accountPartyKind(row.accountCode) === partyKind;
    const haystack = [
      row.code,
      row.label,
      row.accountCode,
      row.accountLabel
    ].join(" ").toLowerCase();
    return matchesParty && (!query || haystack.includes(query));
  });
}

function renderAccountOptions() {
  accountOptionsEl.innerHTML = state.accounts
    .filter((account) => account.isPostable)
    .map((account) => `<option value="${escapeHtml(account.code)}" label="${escapeHtml(account.label)}"></option>`)
    .join("");
}

function renderAuxiliaryOptions() {
  auxiliaryOptionsEl.innerHTML = state.auxiliaryAccounts
    .map((auxiliary) => `<option value="${escapeHtml(auxiliaryInputValue(auxiliary.code))}"></option>`)
    .join("");
}

function renderAccountClassFilter() {
  accountClassFilterEl.innerHTML = `
    <option value="all">Toutes classes</option>
    ${state.accountClasses.map((accountClass) => `
      <option value="${escapeHtml(accountClass.code)}">Classe ${escapeHtml(accountClass.code)} - ${escapeHtml(accountClass.label)}</option>
    `).join("")}
  `;
}

function renderAccountClasses() {
  document.querySelector("#account-classes").innerHTML = state.accountClasses.map((accountClass) => {
    const count = state.accounts.filter((account) => account.isPostable && account.classCode === accountClass.code).length;
    return `
      <article class="account-class">
        <strong>${escapeHtml(accountClass.code)}</strong>
        <span>${escapeHtml(accountClass.label)}</span>
        <em>${count} compte(s)</em>
      </article>
    `;
  }).join("");
}

function renderAccountCatalog() {
  const query = accountSearchEl.value.trim().toLowerCase();
  const classCode = accountClassFilterEl.value;
  const accounts = state.accounts.filter((account) => {
    if (!account.isPostable) return false;
    const matchesClass = classCode === "all" || account.classCode === classCode;
    const haystack = [
      account.code,
      account.label,
      account.classLabel,
      account.groupLabel,
      account.type
    ].join(" ").toLowerCase();
    return matchesClass && (!query || haystack.includes(query));
  });

  document.querySelector("#account-total").textContent = `${accounts.length} compte(s) a 4 chiffres`;
  document.querySelector("#account-catalog").innerHTML = accounts.map((account) => `
    <tr>
      <td>${escapeHtml(account.code)}</td>
      <td>${escapeHtml(account.label)}</td>
      <td>Classe ${escapeHtml(account.classCode)} - ${escapeHtml(account.classLabel)}</td>
      <td>${escapeHtml(account.groupCode)} - ${escapeHtml(account.groupLabel)}</td>
      <td>${typeLabel(account.reportType ?? account.type)}</td>
    </tr>
  `).join("");
}

function renderEntries() {
  const filteredEntries = filterEntries();
  document.querySelector("#entries").innerHTML = filteredEntries
    .slice(0, 8)
    .map(
      (entry) => `
        <article class="entry" data-entry-id="${escapeHtml(entry.id)}">
          <header>
            <strong>${escapeHtml(entry.description)}</strong>
            <span>${escapeHtml(entry.date)}</span>
          </header>
          <div class="entry-meta">
            <span>${escapeHtml(entry.reference ?? "")}</span>
            <span>${sourceLabel(entry.source)}</span>
            ${entry.batchId ? `<span>Lot ${escapeHtml(entry.batchId.slice(0, 8))}</span>` : ""}
          </div>
          <ul>
            ${entry.lines
              .map((line) => {
                const account = state.accounts.find((candidate) => candidate.code === line.accountCode);
                const amount = line.debit > 0 ? `D ${money(line.debit)}` : `C ${money(line.credit)}`;
                return `<li>${escapeHtml(line.accountCode)} ${escapeHtml(account?.label ?? "")} - ${amount}</li>`;
              })
              .join("")}
          </ul>
          <div class="entry-actions">
            <button class="btn" type="button" data-view-entry="${escapeHtml(entry.id)}">Detail</button>
            <button class="btn danger" type="button" data-delete-entry="${escapeHtml(entry.id)}">Supprimer</button>
          </div>
        </article>
      `
    )
    .join("");

  if (filteredEntries.length === 0) {
    document.querySelector("#entries").innerHTML = `<div class="message">Aucune ecriture ne correspond aux filtres.</div>`;
  }

  for (const button of document.querySelectorAll("[data-view-entry]")) {
    button.addEventListener("click", () => showEntryDetail(button.dataset.viewEntry));
  }

  for (const button of document.querySelectorAll("[data-delete-entry]")) {
    button.addEventListener("click", () => deleteEntry(button.dataset.deleteEntry));
  }
}

function renderDashboardEntries() {
  document.querySelector("#dashboard-entries").innerHTML = state.entries
    .slice(0, 5)
    .map((entry) => `
      <article class="entry">
        <header>
          <strong>${escapeHtml(entry.description)}</strong>
          <span>${escapeHtml(entry.date)}</span>
        </header>
        <div class="entry-meta">
          <span>${escapeHtml(entry.reference ?? "")}</span>
          <span>${sourceLabel(entry.source)}</span>
          <span>${money(entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0))}</span>
        </div>
      </article>
    `)
    .join("");
}

function filterEntries() {
  const query = journalSearchEl.value.trim().toLowerCase();
  const source = journalSourceEl.value;

  return state.entries.filter((entry) => {
    const matchesSource = source === "all" || entry.source === source;
    const haystack = [
      entry.description,
      entry.reference,
      entry.date,
      entry.source,
      ...entry.lines.flatMap((line) => [line.accountCode, line.label])
    ].join(" ").toLowerCase();
    return matchesSource && (!query || haystack.includes(query));
  });
}

function showEntryDetail(entryId) {
  const entry = state.entries.find((candidate) => candidate.id === entryId);
  if (!entry) return;

  const debit = entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credit = entry.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  journalDetailEl.innerHTML = `
    <div class="detail-card">
      <div>
        <p class="eyebrow">Detail ecriture</p>
        <h3>${escapeHtml(entry.description)}</h3>
      </div>
      <div class="detail-meta">
        <span>${escapeHtml(entry.date)}</span>
        <span>${escapeHtml(entry.reference ?? "")}</span>
        <span>${sourceLabel(entry.source)}</span>
        <span>Debit ${money(debit)}</span>
        <span>Credit ${money(credit)}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Compte</th>
            <th>Auxiliaire</th>
            <th>Libelle</th>
            <th>Debit</th>
            <th>Credit</th>
          </tr>
        </thead>
        <tbody>
          ${entry.lines.map((line) => `
            <tr>
              <td>${escapeHtml(line.accountCode)}</td>
              <td>${escapeHtml(line.auxiliaryCode ?? "")}</td>
              <td>${escapeHtml(line.label)}</td>
              <td>${money(line.debit)}</td>
              <td>${money(line.credit)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function deleteEntry(entryId) {
  const entry = state.entries.find((candidate) => candidate.id === entryId);
  if (!entry) return;
  if (!confirm(`Supprimer l'ecriture "${entry.description}" ?`)) return;

  const response = await fetch(`/api/journal-entries/${encodeURIComponent(entryId)}`, { method: "DELETE" });
  const body = await response.json();

  if (!response.ok) {
    setMessage(body.error ?? "Suppression impossible.", true);
    return;
  }

  journalDetailEl.innerHTML = "";
  setMessage("Ecriture supprimee.");
  await refresh();
}

function renderImportPreview(transactions) {
  importPreviewEl.innerHTML = transactions
    .map((transaction) => {
      const account = state.accounts.find((candidate) => candidate.code === transaction.accountCode);
      return `
        <article class="suggestion ${transaction.duplicate ? "duplicate" : ""}" data-transaction-id="${escapeHtml(transaction.id)}">
          <div>
            <strong>${escapeHtml(transaction.description)}</strong>
            <span>${escapeHtml(transaction.date)} - ${money(transaction.amount)} - ${escapeHtml(transaction.accountCode)} ${escapeHtml(account?.label ?? "")}</span>
          </div>
          <div class="confidence">${transaction.duplicate ? "Doublon" : `${Math.round(transaction.confidence * 100)}%`}</div>
          <label class="suggestion-account">
            Compte propose
            <select data-role="suggested-account" ${transaction.duplicate ? "disabled" : ""}>
              ${state.accounts.filter((candidate) => candidate.isPostable).map((candidate) => `
                <option value="${escapeHtml(candidate.code)}" ${candidate.code === transaction.accountCode ? "selected" : ""}>
                  ${escapeHtml(candidate.code)} - ${escapeHtml(candidate.label)}
                </option>
              `).join("")}
            </select>
          </label>
          <span>${escapeHtml(transaction.reason)}</span>
        </article>
      `;
    })
    .join("");
}

function collectEditedImportTransactions() {
  const accountByTransactionId = new Map(
    [...importPreviewEl.querySelectorAll(".suggestion")].map((node) => [
      node.dataset.transactionId,
      node.querySelector('[data-role="suggested-account"]').value
    ])
  );

  return state.importTransactions.map((transaction) => ({
    ...transaction,
    accountCode: accountByTransactionId.get(transaction.id) || transaction.accountCode
  }));
}

function accountInputValue(accountCode) {
  return String(accountCode || "");
}

function accountLabelForInput(value) {
  const account = state.accounts.find((candidate) => candidate.code === parseAccountCode(value));
  return account?.label ?? "";
}

function syncLineLabelWithAccount(row, force = false) {
  const labelInput = row.querySelector(".line-label");
  const label = accountLabelForInput(row.querySelector(".account").value);
  if (!label) return;
  if (force || labelInput.dataset.autoFilled === "true" || !labelInput.value.trim()) {
    labelInput.value = label;
    labelInput.dataset.autoFilled = "true";
  }
}

function auxiliaryInputValue(auxiliaryCode) {
  const auxiliary = state.auxiliaryAccounts.find((candidate) => candidate.code === String(auxiliaryCode));
  return auxiliary ? `${auxiliary.code} - ${auxiliary.label}` : String(auxiliaryCode || "");
}

function accountPartyKind(accountCode) {
  const code = String(accountCode || "");
  if (code.startsWith("41")) return "clients";
  if (code.startsWith("40") || code.startsWith("481")) return "suppliers";
  return "general";
}

function partyKindLabel(kind) {
  return {
    clients: "clients",
    suppliers: "fournisseurs"
  }[kind] ?? "tous tiers";
}

function ledgerPrintTitle() {
  const party = ledgerPartyFilterEl.value;
  const account = ledgerAccountFilterEl.value;
  const auxiliary = ledgerAuxiliaryFilterEl.value;
  const parts = ["Grand livre"];
  if (party !== "all") parts.push(partyKindLabel(party));
  if (account !== "all") parts.push(`compte ${account}`);
  if (auxiliary !== "all") parts.push(`auxiliaire ${auxiliary}`);
  const period = reportPeriodLabel();
  if (period) parts.push(period);
  return parts.join(" - ");
}

function auxiliaryBalancePrintTitle() {
  const party = auxiliaryBalancePartyFilterEl.value;
  const parts = [party === "all" ? "Balance auxiliaire" : `Balance auxiliaire - ${partyKindLabel(party)}`];
  const period = reportPeriodLabel();
  if (period) parts.push(period);
  return parts.join(" - ");
}

function balancePrintTitle() {
  const parts = [`Balance ${balanceFormatEl.value} colonnes`];
  const period = reportPeriodLabel();
  if (period) parts.push(period);
  return parts.join(" - ");
}

function reportPeriodQuery() {
  const { from, to } = selectedReportPeriod();
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function selectedReportPeriod() {
  return {
    from: document.querySelector('[data-report-period="from"]')?.value || "",
    to: document.querySelector('[data-report-period="to"]')?.value || ""
  };
}

function reportPeriodLabel() {
  const { from, to } = selectedReportPeriod();
  if (from && to) return `du ${formatDate(from)} au ${formatDate(to)}`;
  if (from) return `depuis le ${formatDate(from)}`;
  if (to) return `jusqu'au ${formatDate(to)}`;
  return "";
}

function reportPeriodSlug() {
  const { from, to } = selectedReportPeriod();
  if (!from && !to) return "";
  return `-${from || "debut"}-${to || "fin"}`;
}

function parseAccountCode(value) {
  return String(value || "").trim().split(/\s+/)[0];
}

function parseAuxiliaryCode(value) {
  return String(value || "").trim().split(/\s+/)[0] || undefined;
}

function nextManualReference(prefix = "MAN") {
  const year = new Date().getFullYear();
  const count = state.entries.filter((entry) => String(entry.reference || "").startsWith(`${prefix}-${year}-`)).length + 1;
  return `${prefix}-${year}-${String(count).padStart(3, "0")}`;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Erreur API ${url}`);
  return response.json();
}

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle("error", isError);
}

function setCompanyMessage(text, isError = false) {
  companyMessageEl.textContent = text;
  companyMessageEl.classList.toggle("error", isError);
}

function setAuxiliaryMessage(text, isError = false) {
  auxiliaryMessageEl.textContent = text;
  auxiliaryMessageEl.classList.toggle("error", isError);
}

function setSubscriptionMessage(text, isError = false) {
  subscriptionMessageEl.textContent = text;
  subscriptionMessageEl.classList.toggle("error", isError);
}

function setLetteringMessage(text, isError = false) {
  letteringMessageEl.textContent = text;
  letteringMessageEl.classList.toggle("error", isError);
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadExport(rows, filename, format, title) {
  if (format === "xls") {
    downloadXls(rows, filename, title);
    return;
  }
  downloadCsv(rows, filename);
}

function downloadCsv(rows, filename) {
  const csv = rows.map((line) => line.map(csvCell).join(",")).join("\n");
  downloadBlob(`\ufeff${csv}`, "text/csv;charset=utf-8", `${filename}.csv`);
}

function downloadXls(rows, filename, title) {
  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          table { border-collapse: collapse; }
          th, td { border: 1px solid #999; padding: 6px; }
          th { background: #e8edf3; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        <table>
          <thead>
            <tr>${rows[0].map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.slice(1).map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </body>
    </html>
  `;
  downloadBlob(html, "application/vnd.ms-excel;charset=utf-8", `${filename}.xls`);
}

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function printState(title) {
  const company = state.company ?? {};
  document.body.dataset.printTitle = title;
  document.body.dataset.printCompany = company.name ?? "";
  document.body.dataset.printMeta = [
    company.country,
    company.currency,
    company.fiscalYearStart ? `Exercice ${String(company.fiscalYearStart).slice(0, 4)}` : "",
    reportPeriodLabel()
  ].filter(Boolean).join(" - ");
  window.print();
}

function setImportStatus(text, tone) {
  importStatusEl.textContent = text;
  importStatusEl.classList.toggle("terra", tone === "terra");
}

function money(amount) {
  return `${formatter.format(Number(amount || 0))} FCFA`;
}

function compactMoney(amount) {
  return `${compactFormatter.format(Number(amount || 0))} FCFA`;
}

function roundMoney(amount) {
  return Math.round((Number(amount || 0) + Number.EPSILON) * 100) / 100;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium"
  }).format(new Date(`${value}T00:00:00`));
}

function sourceLabel(source) {
  return {
    "bank-csv": "Import bancaire",
    manual: "Saisie manuelle",
    subscription: "Abonnement",
    seed: "Demo"
  }[source] ?? source ?? "Inconnu";
}

function typeLabel(type) {
  return {
    asset: "Actif",
    liability: "Passif",
    equity: "Capitaux propres",
    expense: "Charge",
    revenue: "Produit",
    off_balance: "Hors bilan",
    unknown: "Inconnu"
  }[type] ?? type ?? "Inconnu";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}
