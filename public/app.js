const state = {
  company: null,
  organizations: [],
  accounts: [],
  accountClasses: [],
  auxiliaryAccounts: [],
  journals: [],
  users: [],
  entries: [],
  periods: [],
  importTransactions: [],
  batches: [],
  subscriptionBatches: [],
  jobs: [],
  storedFiles: [],
  lettering: { rows: [], groups: [] },
  auditEvents: [],
  reports: {
    trialBalance: [],
    generalLedger: [],
    auxiliaryBalance: [],
    balanceSheet: null,
    incomeStatement: null,
    closingControls: null,
    agedBalanceClients: [],
    agedBalanceSuppliers: []
  },
  auth: {
    token: localStorage.getItem("ohada-auth-token") || "",
    user: null,
    organization: null,
    activeOrganizationId: localStorage.getItem("ohada-active-org") || null,
    availableOrganizations: []
  },
  booted: false
};

const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input?.url ?? "";
  const headers = new Headers(init.headers || (typeof input === "string" ? undefined : input.headers));
  const isApi = isApiRequest(url);
  if (isApi) {
    if (state.auth.token && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${state.auth.token}`);
    }
    if (state.auth.activeOrganizationId && !headers.has("x-organization-id")) {
      headers.set("x-organization-id", state.auth.activeOrganizationId);
    }
  }
  const response = await nativeFetch(input, { ...init, headers });
  // Session expired (token no longer valid) while the user was logged in.
  if (isApi && response.status === 401 && state.auth.token && !url.includes("/api/auth/")) {
    handleSessionExpired();
  }
  return response;
};

function handleSessionExpired() {
  if (!state.auth.token) return; // already handled
  state.auth.token = "";
  state.auth.user = null;
  state.auth.organization = null;
  localStorage.removeItem("ohada-auth-token");
  if (typeof showLogin === "function") showLogin();
  if (typeof window.toast === "function") {
    window.toast("Session expiree. Veuillez vous reconnecter.", "error");
  }
}

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
const organizationForm = document.querySelector("#organization-form");
const organizationMessageEl = document.querySelector("#organization-message");
const organizationsTableEl = document.querySelector("#organizations-table");
const organizationsCountEl = document.querySelector("#organizations-count");
const subscriptionForm = document.querySelector("#subscription-form");
const subscriptionMessageEl = document.querySelector("#subscription-message");
const journalSearchEl = document.querySelector("#journal-search");
const journalSourceEl = document.querySelector("#journal-source");
const journalDetailEl = document.querySelector("#journal-detail");
const viewLabelEl = document.querySelector("#view-label");
const viewTitleEl = document.querySelector("#view-title");
const viewSubtitleEl = document.querySelector("#view-subtitle");
const uiThemeEl = document.querySelector("#ui-theme");
const entryJournalEl = document.querySelector("#entry-journal");
const accountSearchEl = document.querySelector("#account-search");
const accountClassFilterEl = document.querySelector("#account-class-filter");
const accountForm = document.querySelector("#account-form");
const accountMessageEl = document.querySelector("#account-message");
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
const printAuxiliaryLedgerButton = document.querySelector("#print-auxiliary-ledger");
const queueFinancialExportButton = document.querySelector("#queue-financial-export");
const jobsMessageEl = document.querySelector("#jobs-message");
const jobsTableEl = document.querySelector("#jobs-table");
const auxiliaryBalanceSearchEl = document.querySelector("#auxiliary-balance-search");
const auxiliaryBalancePartyFilterEl = document.querySelector("#auxiliary-balance-party-filter");
const agedBalanceClientsSearchEl = document.querySelector("#aged-balance-clients-search");
const agedBalanceSuppliersSearchEl = document.querySelector("#aged-balance-suppliers-search");
const reportPeriodEls = document.querySelectorAll("[data-report-period]");
const reportPeriodSelectEl = document.querySelector("#report-period-select");
const createNextPeriodButton = document.querySelector("#create-next-period");
const auditSearchEl = document.querySelector("#audit-search");
const auditActionFilterEl = document.querySelector("#audit-action-filter");
const auxiliaryForm = document.querySelector("#auxiliary-form");
const auxiliaryMessageEl = document.querySelector("#auxiliary-message");
const journalForm = document.querySelector("#journal-form");
const journalMessageEl = document.querySelector("#journal-message");
const journalsTableEl = document.querySelector("#journals-table");
const journalsCountEl = document.querySelector("#journals-count");
const userForm = document.querySelector("#user-form");
const userMessageEl = document.querySelector("#user-message");
const inviteForm = document.querySelector("#invite-form");
const inviteMessageEl = document.querySelector("#invite-message");
const usersTableEl = document.querySelector("#users-table");
const usersCountEl = document.querySelector("#users-count");
const autoBalanceEl = document.querySelector("#auto-balance");
const balanceEntryButton = document.querySelector("#balance-entry");
const entryBalanceStatusEl = document.querySelector("#entry-balance-status");
const accountOptionsEl = document.querySelector("#account-options");
const auxiliaryOptionsEl = document.querySelector("#auxiliary-options");
const cancelEntryEditButton = document.querySelector("#cancel-entry-edit");
const saveEntryButton = document.querySelector("#save-entry");
const authGateEl = document.querySelector("#auth-gate");
const loginForm = document.querySelector("#login-form");
const loginMessageEl = document.querySelector("#login-message");
const passwordResetRequestForm = document.querySelector("#password-reset-request-form");
const passwordResetRequestMessageEl = document.querySelector("#password-reset-request-message");
const tokenPasswordForm = document.querySelector("#token-password-form");
const tokenPasswordSubmitButton = document.querySelector("#token-password-submit");
const tokenPasswordMessageEl = document.querySelector("#token-password-message");
const logoutButton = document.querySelector("#logout-button");
const userAvatarEl = document.querySelector("#user-avatar");
const userNameEl = document.querySelector("#user-name");
const userRoleEl = document.querySelector("#user-role");
let isBalancingEntry = false;
let editingEntryId = "";
let authTokenMode = "";
let authTokenValue = "";

document.querySelector("#add-line").addEventListener("click", () => {
  addLine();
  renderEntryBalanceStatus();
});
document.querySelector("#demo-sale").addEventListener("click", fillDemoSale);
cancelEntryEditButton.addEventListener("click", cancelEntryEdit);
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
organizationForm.addEventListener("submit", submitOrganization);
accountForm.addEventListener("submit", submitAccount);
journalForm.addEventListener("submit", submitJournal);
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
printAuxiliaryBalanceButton.addEventListener("click", () => printState(auxiliaryBalancePrintTitle(), "auxiliary-balance"));
printAuxiliaryLedgerButton.addEventListener("click", () => printState(auxiliaryLedgerPrintTitle(), "auxiliary-ledger"));
queueFinancialExportButton.addEventListener("click", queueFinancialExport);
auxiliaryBalanceSearchEl.addEventListener("input", renderAuxiliaries);
auxiliaryBalancePartyFilterEl.addEventListener("change", renderAuxiliaries);
agedBalanceClientsSearchEl?.addEventListener("input", renderAgedBalanceClients);
agedBalanceSuppliersSearchEl?.addEventListener("input", renderAgedBalanceSuppliers);
reportPeriodEls.forEach((input) => input.addEventListener("change", () => updateReportPeriod(input)));
reportPeriodSelectEl.addEventListener("change", updateSelectedReportPeriod);
createNextPeriodButton.addEventListener("click", createNextPeriod);
auditSearchEl.addEventListener("input", renderAuditEvents);
auditActionFilterEl.addEventListener("change", renderAuditEvents);
form.addEventListener("submit", submitEntry);
auxiliaryForm.addEventListener("submit", submitAuxiliaryAccount);
userForm.addEventListener("submit", submitUser);
inviteForm.addEventListener("submit", submitInvitation);
loginForm.addEventListener("submit", submitLogin);
passwordResetRequestForm.addEventListener("submit", submitPasswordResetRequest);
tokenPasswordForm.addEventListener("submit", submitTokenPassword);
logoutButton.addEventListener("click", logout);
document.querySelectorAll("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.viewTarget));
});

const viewCopy = {
  dashboard: {
    label: "Tableau de bord",
    title: 'Tableau de <span>Bord</span>.',
    subtitle: "Vue d'ensemble de votre activite financiere."
  },
  entry: {
    label: "Saisie",
    title: '<span>Saisie</span> et controles.',
    subtitle: "Pilotez les saisies, controles et derniers mouvements depuis un espace structure."
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
    title: 'Etats <span>financiers</span> SYSCOHADA.',
    subtitle: "Consultez le bilan, le compte de résultat et la balance générale."
  },
  taxes: {
    label: "Déclaration TVA",
    title: 'Déclaration <span>TVA</span>.',
    subtitle: "Suivez la TVA collectée et déductible sur la période."
  },
  "aged-clients": {
    label: "Balance agee clients",
    title: 'Balance <span>agee</span> clients.',
    subtitle: "Suivez l'anciennete des creances clients par tranches de retard."
  },
  "aged-suppliers": {
    label: "Balance agee fournisseurs",
    title: 'Balance <span>agee</span> fournisseurs.',
    subtitle: "Suivez l'anciennete des dettes fournisseurs par tranches de retard."
  },
  audit: {
    label: "Audit",
    title: "Journal <span>d'audit</span> comptable.",
    subtitle: "Suivez les modifications sensibles: saisies, clotures, imports, lettrages et parametres."
  },
  settings: {
    label: "Parametres entreprise",
    title: "Parametres de <span>l'entreprise</span>.",
    subtitle: "Mettez a jour la societe, les exercices, les utilisateurs et les droits d'acces."
  }
};

await boot();

async function boot() {
  setUiTheme(localStorage.getItem("ohada-ui-theme") || "classic", false);
  detectAuthTokenFlow();
  const hasSession = await restoreSession();
  if (!hasSession) {
    showLogin();
    return;
  }
  await loadApplication();
}

function detectAuthTokenFlow() {
  const params = new URLSearchParams(window.location.search);
  const invite = params.get("invite");
  const reset = params.get("reset");
  if (invite) {
    authTokenMode = "invitation";
    authTokenValue = invite;
    tokenPasswordSubmitButton.textContent = "Activer mon compte";
    tokenPasswordForm.hidden = false;
    setTokenPasswordMessage("Choisissez votre mot de passe pour accepter l'invitation.");
  }
  if (reset) {
    authTokenMode = "password_reset";
    authTokenValue = reset;
    tokenPasswordSubmitButton.textContent = "Reinitialiser le mot de passe";
    tokenPasswordForm.hidden = false;
    setTokenPasswordMessage("Saisissez votre nouveau mot de passe.");
  }
}

async function loadApplication() {
  hideLogin();
  const [company, accounts, accountClasses, journals] = await Promise.all([
    fetchJson("/api/company"),
    fetchJson("/api/accounts"),
    fetchJson("/api/account-classes"),
    fetchJson("/api/journals")
  ]);

  state.accounts = accounts;
  state.accountClasses = accountClasses;
  state.journals = journals;
  state.company = company;
  renderCompanyHeader();
  fillCompanyForm();
  form.elements.date.valueAsDate = new Date();
  form.elements.reference.value = nextManualReference();
  renderAccountOptions();
  renderJournalOptions();
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
  state.booted = true;
}

async function restoreSession() {
  if (!state.auth.token) return false;
  try {
    const auth = await fetchJson("/api/auth/me");
    state.auth.user = auth.user;
    state.auth.organization = auth.organization;
    state.auth.availableOrganizations = auth.availableOrganizations || [];
    if (!state.auth.activeOrganizationId || !state.auth.availableOrganizations.find(o => o.id === state.auth.activeOrganizationId)) {
      state.auth.activeOrganizationId = auth.organization?.id;
      if (state.auth.activeOrganizationId) {
        localStorage.setItem("ohada-active-org", state.auth.activeOrganizationId);
      }
    }
    renderUser();
    renderOrganizationSelector();
    return true;
  } catch {
    clearSession();
    return false;
  }
}

async function submitLogin(event) {
  event.preventDefault();
  setLoginMessage("Connexion en cours...");
  const response = await nativeFetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: loginForm.elements.email.value,
      password: loginForm.elements.password.value
    })
  });
  const body = await response.json();
  if (!response.ok || !body.ok) {
    setLoginMessage(body.error || "Connexion impossible.", true);
    return;
  }

  state.auth.token = body.token;
  state.auth.user = body.user;
  state.auth.organization = body.organization;
  state.auth.availableOrganizations = body.availableOrganizations || [];
  if (!state.auth.activeOrganizationId || !state.auth.availableOrganizations.find(o => o.id === state.auth.activeOrganizationId)) {
    state.auth.activeOrganizationId = body.organization?.id;
    if (state.auth.activeOrganizationId) {
      localStorage.setItem("ohada-active-org", state.auth.activeOrganizationId);
    }
  }
  localStorage.setItem("ohada-auth-token", body.token);
  renderUser();
  renderOrganizationSelector();
  setLoginMessage("");

  if (state.booted) {
    hideLogin();
    await refresh();
    return;
  }
  await loadApplication();
}

async function submitPasswordResetRequest(event) {
  event.preventDefault();
  setPasswordResetRequestMessage("Preparation du lien...");
  const response = await nativeFetch("/api/auth/password-reset/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: passwordResetRequestForm.elements.email.value })
  });
  const body = await response.json();
  if (!response.ok || !body.ok) {
    setPasswordResetRequestMessage(body.error || "Demande impossible.", true);
    return;
  }
  setPasswordResetRequestMessage(body.message);
}

async function submitTokenPassword(event) {
  event.preventDefault();
  const password = tokenPasswordForm.elements.password.value;
  const endpoint = authTokenMode === "invitation"
    ? "/api/auth/invitations/accept"
    : "/api/auth/password-reset/confirm";
  setTokenPasswordMessage("Validation en cours...");
  const response = await nativeFetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: authTokenValue, password })
  });
  const body = await response.json();
  if (!response.ok || !body.ok) {
    setTokenPasswordMessage(body.errors?.join(" ") ?? body.error ?? "Lien invalide.", true);
    return;
  }
  tokenPasswordForm.reset();
  tokenPasswordForm.hidden = true;
  setTokenPasswordMessage("");
  setLoginMessage(authTokenMode === "invitation" ? "Compte active. Vous pouvez vous connecter." : "Mot de passe reinitialise. Vous pouvez vous connecter.");
  window.history.replaceState({}, "", window.location.pathname);
}

async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    clearSession();
    showLogin();
  }
}

function clearSession() {
  state.auth.token = "";
  state.auth.user = null;
  state.auth.organization = null;
  localStorage.removeItem("ohada-auth-token");
  renderUser();
}

function showLogin() {
  document.body.dataset.auth = "locked";
  authGateEl.removeAttribute("hidden");
  loginForm.elements.email.focus();
}

function hideLogin() {
  document.body.dataset.auth = "unlocked";
  authGateEl.setAttribute("hidden", "");
}

function renderUser() {
  const user = state.auth.user;
  if (!user) {
    userAvatarEl.textContent = "--";
    userNameEl.textContent = "Non connecte";
    userRoleEl.textContent = "Session requise";
    return;
  }
  userAvatarEl.textContent = initials(user.name || user.email);
  userNameEl.textContent = user.name || user.email;
  userRoleEl.textContent = roleLabel(user.role);
}

function renderOrganizationSelector() {
  const selector = document.querySelector("#organization-selector");
  if (!selector) return;
  const orgs = state.auth.availableOrganizations || [];
  selector.innerHTML = "";
  if (orgs.length === 0) {
    selector.innerHTML = `<option value="">Aucun dossier</option>`;
    selector.disabled = true;
    return;
  }
  
  selector.disabled = false;
  orgs.forEach(org => {
    const option = document.createElement("option");
    option.value = org.id;
    option.textContent = org.name;
    if (org.id === state.auth.organization?.id) {
      option.selected = true;
    }
    selector.appendChild(option);
  });
  
  selector.onchange = async (e) => {
    state.auth.activeOrganizationId = e.target.value;
    localStorage.setItem("ohada-active-org", e.target.value);
    await restoreSession();
    await refresh();
  };
}

function setLoginMessage(text, isError = false) {
  loginMessageEl.textContent = text;
  loginMessageEl.classList.toggle("error", isError);
}

function setPasswordResetRequestMessage(text, isError = false) {
  passwordResetRequestMessageEl.textContent = text;
  passwordResetRequestMessageEl.classList.toggle("error", isError);
}

function setTokenPasswordMessage(text, isError = false) {
  tokenPasswordMessageEl.textContent = text;
  tokenPasswordMessageEl.classList.toggle("error", isError);
}

function isApiRequest(url) {
  try {
    return new URL(url, window.location.origin).pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function initials(value) {
  return String(value || "")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";
}

function roleLabel(role) {
  return {
    owner: "Proprietaire",
    admin: "Administrateur",
    accountant: "Comptable",
    viewer: "Lecture seule"
  }[role] || "Utilisateur";
}

function canManageUsers() {
  return ["owner", "admin"].includes(state.auth.user?.role);
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
  const companyNameEl = document.querySelector("#company-name");
  if (companyNameEl) companyNameEl.textContent = company.name;
  
  const companyMetaEl = document.querySelector("#company");
  if (companyMetaEl) {
    companyMetaEl.textContent = `${company.country} - ${company.currency} - Exercice ${company.fiscalYearStart?.slice(0, 4) || ""}`;
  }
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
  const [company, accounts, entries, auxiliaryAccounts, journals, batches, subscriptionBatches, lettering, periods, auditEvents, jobs, storedFiles, organizations] = await Promise.all([
    fetchJson("/api/company"),
    fetchJson("/api/accounts"),
    fetchJson("/api/journal-entries"),
    fetchJson("/api/auxiliary-accounts"),
    fetchJson("/api/journals"),
    fetchJson("/api/bank-imports/batches"),
    fetchJson("/api/subscriptions"),
    fetchJson("/api/lettering"),
    fetchJson("/api/accounting-periods"),
    fetchJson("/api/audit-events"),
    fetchJson("/api/jobs"),
    fetchJson("/api/files"),
    fetchJson("/api/organizations")
  ]);

  state.company = company;
  state.accounts = accounts;
  state.organizations = organizations;
  state.entries = entries;
  state.auxiliaryAccounts = auxiliaryAccounts;
  state.journals = journals;
  state.batches = batches;
  state.subscriptionBatches = subscriptionBatches;
  state.lettering = lettering;
  state.periods = periods;
  state.auditEvents = auditEvents;
  state.jobs = jobs;
  state.storedFiles = storedFiles;
  state.users = await fetchUsersForRole();
  renderReportPeriodOptions();
  ensureReportPeriodSelected();
  const reports = await fetchReportsForPeriod();
  state.reports = reports;

  renderCompanyHeader();
  fillCompanyForm();
  renderAuxiliaryOptions();
  renderAccountOptions();
  renderJournalOptions();
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
  renderAgedBalanceClients();
  renderAgedBalanceSuppliers();
  renderGeneralLedger();
  renderSyscohadaBalanceSheet();
  renderSyscohadaIncomeStatement();
  renderVatDeclaration();
  renderLettering();
  renderAuditActionFilter();
  renderAuditEvents();
  renderUsers();
  renderJobs();
  renderOrganizations();
  renderJournals();
}

async function fetchUsersForRole() {
  if (!canManageUsers()) return [];
  try {
    return await fetchJson("/api/users");
  } catch {
    return [];
  }
}

async function fetchReportsForPeriod() {
  const query = reportPeriodQuery();
  const [trialBalance, generalLedger, auxiliaryBalance, balanceSheet, incomeStatement, closingControls, agedBalanceClients, agedBalanceSuppliers, vatDeclaration] = await Promise.all([
    fetchJson(`/api/reports/trial-balance${query}`),
    fetchJson(`/api/reports/general-ledger${query}`),
    fetchJson(`/api/reports/auxiliary-balance${query}`),
    fetchJson(`/api/reports/balance-sheet${query}`),
    fetchJson(`/api/reports/income-statement${query}`),
    fetchJson(`/api/reports/closing-controls${query}`),
    fetchJson(`/api/reports/aged-balance/clients${query}`),
    fetchJson(`/api/reports/aged-balance/suppliers${query}`),
    fetchJson(`/api/reports/vat-declaration${query}`)
  ]);
  return { trialBalance, generalLedger, auxiliaryBalance, balanceSheet, incomeStatement, closingControls, agedBalanceClients, agedBalanceSuppliers, vatDeclaration };
}

async function updateReportPeriod(changedInput) {
  const periodSide = changedInput.dataset.reportPeriod;
  for (const input of reportPeriodEls) {
    if (input.dataset.reportPeriod === periodSide) input.value = changedInput.value;
  }
  reportPeriodSelectEl.value = matchingReportPeriodValue();
  state.reports = await fetchReportsForPeriod();
  renderLedgerAccountFilter();
  renderLedgerAuxiliaryFilter();
  renderMetrics();
  renderClosingControls();
  renderTrialBalance();
  renderSyscohadaBalanceSheet();
  renderSyscohadaIncomeStatement();
  renderVatDeclaration();
  renderAuxiliaries();
  renderGeneralLedger();
}

async function updateSelectedReportPeriod() {
  const selected = state.periods.find((period) => period.id === reportPeriodSelectEl.value);
  for (const input of reportPeriodEls) {
    if (input.dataset.reportPeriod === "from") input.value = selected?.startDate ?? "";
    if (input.dataset.reportPeriod === "to") input.value = selected?.endDate ?? "";
  }
  state.reports = await fetchReportsForPeriod();
  renderMetrics();
  renderClosingControls();
  renderTrialBalance();
  renderSyscohadaBalanceSheet();
  renderSyscohadaIncomeStatement();
  renderVatDeclaration();
  renderAuxiliaries();
  renderAgedBalanceClients();
  renderAgedBalanceSuppliers();
  renderGeneralLedger();
}

async function queueFinancialExport() {
  setJobsMessage("Generation planifiee...");
  const { from, to } = selectedReportPeriod();
  const response = await fetch("/api/reports/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ from, to })
  });
  const body = await response.json();
  if (!response.ok) {
    setJobsMessage(body.error ?? "Export refuse.", true);
    return;
  }

  setJobsMessage("Export ajoute a la file de jobs.");
  await refreshJobsUntilSettled(body.job?.id);
}

async function refreshJobsUntilSettled(jobId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 650));
    state.jobs = await fetchJson("/api/jobs");
    state.storedFiles = await fetchJson("/api/files");
    renderJobs();
    const job = state.jobs.find((candidate) => candidate.id === jobId);
    if (job && ["done", "failed"].includes(job.status)) {
      setJobsMessage(job.status === "done" ? "Export pret." : job.error || "Export echoue.", job.status === "failed");
      return;
    }
  }
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
  setMessage(editingEntryId ? "Modification en cours..." : "Enregistrement en cours...");

  const payload = {
    date: form.elements.date.value,
    reference: form.elements.reference.value,
    description: form.elements.description.value,
    source: form.elements.source.value || "manual",
    lines: [...linesEl.querySelectorAll(".line-row")].map((row) => ({
      accountCode: parseAccountCode(row.querySelector(".account").value),
      auxiliaryCode: parseAuxiliaryCode(row.querySelector(".auxiliary").value),
      label: row.querySelector(".line-label").value || form.elements.description.value,
      debit: Number(row.querySelector(".debit").value || 0),
      credit: Number(row.querySelector(".credit").value || 0)
    }))
  };

  const response = await fetch(editingEntryId ? `/api/journal-entries/${encodeURIComponent(editingEntryId)}` : "/api/journal-entries", {
    method: editingEntryId ? "PUT" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const body = await response.json();
  if (!response.ok) {
    setMessage(body.errors?.join(" ") ?? body.error ?? "Ecriture refusee.", true);
    return;
  }

  setMessage(editingEntryId ? "Ecriture modifiee." : "Ecriture enregistree.");
  if (editingEntryId) {
    exitEntryEditMode();
  } else {
    form.elements.reference.value = nextManualReference();
  }
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

async function submitAccount(event) {
  event.preventDefault();
  setAccountMessage("Creation du compte en cours...");

  const payload = {
    code: accountForm.elements.code.value,
    label: accountForm.elements.label.value,
    type: accountForm.elements.type.value
  };

  const response = await fetch("/api/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json();

  if (!response.ok) {
    setAccountMessage(body.errors?.join(" ") ?? body.error ?? "Creation refusee.", true);
    return;
  }

  accountForm.reset();
  setAccountMessage(`Compte ${body.account.code} cree.`);
  await refresh();
}

async function submitJournal(event) {
  event.preventDefault();
  if (!canManageUsers()) {
    setJournalMessage("Droits administrateur requis.", true);
    return;
  }

  setJournalMessage("Creation du journal en cours...");
  const payload = {
    code: journalForm.elements.code.value,
    label: journalForm.elements.label.value,
    type: journalForm.elements.type.value
  };

  const response = await fetch("/api/journals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json();

  if (!response.ok) {
    setJournalMessage(body.errors?.join(" ") ?? body.error ?? "Creation refusee.", true);
    return;
  }

  journalForm.reset();
  setJournalMessage(`Journal ${body.journal.code} cree.`);
  await refresh();
}

async function submitUser(event) {
  event.preventDefault();
  if (!canManageUsers()) {
    setUserMessage("Droits administrateur requis.", true);
    return;
  }

  setUserMessage("Creation en cours...");
  const payload = {
    name: userForm.elements.name.value,
    email: userForm.elements.email.value,
    role: userForm.elements.role.value,
    password: userForm.elements.password.value
  };

  const response = await fetch("/api/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json();

  if (!response.ok) {
    setUserMessage(body.errors?.join(" ") ?? body.error ?? "Creation refusee.", true);
    return;
  }

  userForm.reset();
  userForm.elements.role.value = "accountant";
  setUserMessage("Utilisateur cree.");
  state.users = await fetchUsersForRole();
  renderUsers();
}

async function submitInvitation(event) {
  event.preventDefault();
  if (!canManageUsers()) {
    setInviteMessage("Droits administrateur requis.", true);
    return;
  }

  setInviteMessage("Generation de l'invitation...");
  const payload = {
    name: inviteForm.elements.name.value,
    email: inviteForm.elements.email.value,
    role: inviteForm.elements.role.value
  };

  const response = await fetch("/api/users/invitations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json();

  if (!response.ok) {
    setInviteMessage(body.errors?.join(" ") ?? body.error ?? "Invitation refusee.", true);
    return;
  }

  inviteForm.reset();
  setInviteMessage(`L'invitation a été envoyée par email à ${payload.email}.`);
  state.users = await fetchUsersForRole();
  renderUsers();
}

async function submitOrganization(event) {
  event.preventDefault();
  if (!canManageUsers()) {
    setOrganizationMessage("Droits administrateur requis.", true);
    return;
  }

  setOrganizationMessage("Creation du dossier en cours...");
  const payload = {
    name: organizationForm.elements.name.value,
    country: organizationForm.elements.country.value,
    currency: organizationForm.elements.currency.value,
    fiscalYearStart: organizationForm.elements.fiscalYearStart.value,
    fiscalYearEnd: organizationForm.elements.fiscalYearEnd.value,
    ownerName: organizationForm.elements.ownerName.value,
    ownerEmail: organizationForm.elements.ownerEmail.value,
    ownerPassword: organizationForm.elements.ownerPassword.value
  };

  const response = await fetch("/api/organizations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json();

  if (!response.ok) {
    setOrganizationMessage(body.errors?.join(" ") ?? body.error ?? "Creation refusee.", true);
    return;
  }

  organizationForm.reset();
  organizationForm.elements.country.value = state.company?.country || "CI";
  organizationForm.elements.currency.value = state.company?.currency || "XOF";
  setOrganizationMessage(`Dossier ${body.organization.name} cree avec son proprietaire.`);
  await refresh();
}

async function updateUserAccess(userId) {
  const row = usersTableEl.querySelector(`[data-user-row="${CSS.escape(userId)}"]`);
  if (!row) return;
  setUserMessage("Mise a jour en cours...");

  const response = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: row.querySelector('[data-user-field="name"]').value,
      role: row.querySelector('[data-user-field="role"]').value,
      status: row.querySelector('[data-user-field="status"]').value
    })
  });
  const body = await response.json();

  if (!response.ok) {
    setUserMessage(body.error ?? "Mise a jour refusee.", true);
    return;
  }

  setUserMessage("Utilisateur mis a jour.");
  state.users = await fetchUsersForRole();
  renderUsers();
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
  const { balanceSheet, incomeStatement, trialBalance } = state.reports;
  if (!document.querySelector("#dashboard-cash")) return;

  const cashRows = trialBalance.filter(r => r.classCode === "5");
  const cashAmount = cashRows.reduce((sum, r) => sum + r.debit - r.credit, 0);

  const salesRows = trialBalance.filter(r => r.classCode === "7");
  const salesAmount = salesRows.reduce((sum, r) => sum + r.credit - r.debit, 0);

  const expensesRows = trialBalance.filter(r => r.classCode === "6");
  const expensesAmount = expensesRows.reduce((sum, r) => sum + r.debit - r.credit, 0);

  document.querySelector("#dashboard-cash").textContent = compactMoney(cashAmount);
  document.querySelector("#dashboard-sales").textContent = compactMoney(salesAmount);
  document.querySelector("#dashboard-expenses").textContent = compactMoney(expensesAmount);
  document.querySelector("#dashboard-net-income").textContent = compactMoney(incomeStatement.resultatNet ?? incomeStatement.netIncome ?? 0);

  // Repartition des charges
  const expenseGroups = {};
  for (const row of expensesRows) {
    if (!expenseGroups[row.groupLabel]) expenseGroups[row.groupLabel] = 0;
    expenseGroups[row.groupLabel] += (row.debit - row.credit);
  }
  const maxExpense = Math.max(...Object.values(expenseGroups), 1);
  const expenseChart = document.querySelector("#expense-breakdown-chart");
  expenseChart.innerHTML = Object.entries(expenseGroups)
    .filter(([_, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, amount]) => `
      <div class="chart-bar-row">
        <div class="chart-bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
        <div class="chart-bar-track"><div class="chart-bar-fill" style="width: ${(amount / maxExpense) * 100}%"></div></div>
        <div class="chart-bar-value">${compactMoney(amount)}</div>
      </div>
    `).join("") || '<div class="empty-state">Aucune charge constatee.</div>';

  // Repartition des produits
  const revenueGroups = {};
  for (const row of salesRows) {
    if (!revenueGroups[row.groupLabel]) revenueGroups[row.groupLabel] = 0;
    revenueGroups[row.groupLabel] += (row.credit - row.debit);
  }
  const maxRevenue = Math.max(...Object.values(revenueGroups), 1);
  const revenueChart = document.querySelector("#revenue-breakdown-chart");
  revenueChart.innerHTML = Object.entries(revenueGroups)
    .filter(([_, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, amount]) => `
      <div class="chart-bar-row">
        <div class="chart-bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
        <div class="chart-bar-track"><div class="chart-bar-fill" style="width: ${(amount / maxRevenue) * 100}%"></div></div>
        <div class="chart-bar-value">${compactMoney(amount)}</div>
      </div>
    `).join("") || '<div class="empty-state">Aucun produit constate.</div>';

  // Soldes Intermediaires de Gestion (SIG)
  const getBal = (prefixes) => trialBalance.filter(r => prefixes.some(p => r.code.startsWith(p))).reduce((sum, r) => sum + r.credit - r.debit, 0);
  const marge = getBal(["701", "601", "6031"]);
  const va = getBal(["70", "71", "72", "73", "74", "75", "60", "61", "62", "63", "64", "65"]);
  const ebe = va + getBal(["66"]);
  const rex = ebe + getBal(["68", "78", "79"]);
  const rfin = getBal(["77", "67"]);
  const rhao = trialBalance.filter(r => r.classCode === "8" && !r.code.startsWith("89")).reduce((sum, r) => sum + r.credit - r.debit, 0);

  document.querySelector("#sig-breakdown").innerHTML = `
    <div class="sig-row">
      <div class="sig-label" title="Ventes de marchandises - Achats">Marge Commerciale</div>
      <div class="sig-value">${compactMoney(marge)}</div>
    </div>
    <div class="sig-row">
      <div class="sig-label" title="Richesse creee par l'entreprise">Valeur Ajoutee (VA)</div>
      <div class="sig-value">${compactMoney(va)}</div>
    </div>
    <div class="sig-row">
      <div class="sig-label" title="Ressource d'exploitation degagee">Excedent Brut (EBE)</div>
      <div class="sig-value">${compactMoney(ebe)}</div>
    </div>
    <div class="sig-row">
      <div class="sig-label" title="Performance de l'activite principale">Resultat d'Exploitation</div>
      <div class="sig-value">${compactMoney(rex)}</div>
    </div>
    <div class="sig-row">
      <div class="sig-label" title="Revenus financiers moins charges financieres">Resultat Financier</div>
      <div class="sig-value">${compactMoney(rfin)}</div>
    </div>
    <div class="sig-row">
      <div class="sig-label" title="Activites Hors Ordinaires">Resultat HAO</div>
      <div class="sig-value">${compactMoney(rhao)}</div>
    </div>
    <div class="sig-row highlight">
      <div class="sig-label">Resultat Net</div>
      <div class="sig-value">${compactMoney(incomeStatement.resultatNet ?? incomeStatement.netIncome ?? 0)}</div>
    </div>
  `;
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

function renderReportPeriodOptions() {
  const selectedValue = reportPeriodSelectEl.value || matchingReportPeriodValue();
  reportPeriodSelectEl.innerHTML = `
    <option value="all">Toutes dates</option>
    ${state.periods.map((period) => `
      <option value="${escapeHtml(period.id)}">${escapeHtml(period.name)}</option>
    `).join("")}
  `;
  reportPeriodSelectEl.value = state.periods.some((period) => period.id === selectedValue) ? selectedValue : matchingReportPeriodValue();
}

function ensureReportPeriodSelected() {
  const hasDateFilter = [...reportPeriodEls].some((input) => input.value);
  if (hasDateFilter || state.periods.length === 0) {
    reportPeriodSelectEl.value = matchingReportPeriodValue();
    return;
  }

  const activePeriod = state.periods.find((period) => period.status === "open") ?? state.periods[0];
  reportPeriodSelectEl.value = activePeriod.id;
  for (const input of reportPeriodEls) {
    if (input.dataset.reportPeriod === "from") input.value = activePeriod.startDate;
    if (input.dataset.reportPeriod === "to") input.value = activePeriod.endDate;
  }
}

function matchingReportPeriodValue() {
  const { from, to } = selectedReportPeriod();
  const period = state.periods.find((candidate) => candidate.startDate === from && candidate.endDate === to);
  return period?.id ?? "all";
}

async function createNextPeriod() {
  if (!confirm("Creer l'exercice suivant ?")) return;

  const response = await fetch("/api/accounting-periods", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  const body = await response.json();
  if (!response.ok) {
    setMessage(body.errors?.join(" ") ?? body.error ?? "Creation impossible.", true);
    return;
  }

  setMessage(`${body.period.name} cree.`);
  await refresh();
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

function renderAuditActionFilter() {
  const selected = auditActionFilterEl.value || "all";
  const actions = [...new Set(state.auditEvents.map((event) => event.action))].sort();
  auditActionFilterEl.innerHTML = `
    <option value="all">Toutes actions</option>
    ${actions.map((action) => `<option value="${escapeHtml(action)}">${escapeHtml(auditActionLabel(action))}</option>`).join("")}
  `;
  auditActionFilterEl.value = actions.includes(selected) ? selected : "all";
}

function renderAuditEvents() {
  const rows = filteredAuditEvents();
  document.querySelector("#audit-count").textContent = `${rows.length} evenement(s)`;
  document.querySelector("#audit-events").innerHTML = rows
    .slice(0, 120)
    .map((event) => `
      <article class="audit-event">
        <div class="audit-event-main">
          <strong>${escapeHtml(event.summary)}</strong>
          <span>${escapeHtml(auditActionLabel(event.action))} - ${escapeHtml(event.entityType)} ${escapeHtml(event.entityId)}</span>
        </div>
        <div class="audit-event-meta">
          <span>${escapeHtml(event.actor)}</span>
          <span>${formatDateTime(event.createdAt)}</span>
        </div>
      </article>
    `)
    .join("");

  if (rows.length === 0) {
    document.querySelector("#audit-events").innerHTML = `<div class="message">Aucun evenement ne correspond aux filtres.</div>`;
  }
}

function filteredAuditEvents() {
  const query = auditSearchEl.value.trim().toLowerCase();
  const action = auditActionFilterEl.value;
  return state.auditEvents.filter((event) => {
    const matchesAction = action === "all" || event.action === action;
    const haystack = [
      event.action,
      event.actor,
      event.entityType,
      event.entityId,
      event.summary
    ].join(" ").toLowerCase();
    return matchesAction && (!query || haystack.includes(query));
  });
}

function auditActionLabel(action) {
  return {
    "auxiliary.create": "Creation auxiliaire",
    "bank_import.commit": "Validation import bancaire",
    "bank_import.void": "Annulation import bancaire",
    "company.update": "Modification entreprise",
    "journal.bulk_create": "Creation ecritures",
    "journal.create": "Creation ecriture",
    "journal.delete": "Suppression ecriture",
    "lettering.auto": "Lettrage automatique",
    "lettering.manual": "Lettrage manuel",
    "period.create": "Creation exercice",
    "period.lock": "Verrouillage exercice",
    "period.unlock": "Reouverture exercice",
    "subscription.generate": "Generation abonnement"
  }[action] ?? action;
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

function renderSyscohadaBalanceSheet() {
  const balanceSheetEl = document.getElementById("syscohada-balance-sheet");
  if (!balanceSheetEl || !state.reports) return;

  const bs = state.reports.balanceSheet;
  const actif = bs.actif || { actifImmobilise: 0, actifCirculantStock: 0, actifCirculantCreances: 0, tresorerieActif: 0, totalActif: 0 };
  const passif = bs.passif || { capitauxPropres: 0, resultatNet: 0, dettesFinancieres: 0, passifCirculant: 0, tresoreriePassif: 0, totalPassif: 0 };

  balanceSheetEl.innerHTML = `
    <tr><td>Actif Immobilisé</td><td class="amount">${money(actif.actifImmobilise)}</td><td>Capitaux Propres</td><td class="amount">${money(passif.capitauxPropres)}</td></tr>
    <tr><td>Actif Circulant HAO & Stocks</td><td class="amount">${money(actif.actifCirculantStock)}</td><td>Résultat Net de l'Exercice</td><td class="amount">${money(passif.resultatNet)}</td></tr>
    <tr><td>Créances et emplois assimilés</td><td class="amount">${money(actif.actifCirculantCreances)}</td><td>Dettes Financières</td><td class="amount">${money(passif.dettesFinancieres)}</td></tr>
    <tr><td>Trésorerie Actif</td><td class="amount">${money(actif.tresorerieActif)}</td><td>Passif Circulant</td><td class="amount">${money(passif.passifCirculant)}</td></tr>
    <tr><td></td><td></td><td>Trésorerie Passif</td><td class="amount">${money(passif.tresoreriePassif)}</td></tr>
    <tr class="total-row"><td>Total Actif</td><td class="amount">${money(actif.totalActif)}</td><td>Total Passif</td><td class="amount">${money(passif.totalPassif)}</td></tr>
  `;
}

function renderSyscohadaIncomeStatement() {
  const isEl = document.getElementById("syscohada-income-statement");
  if (!isEl || !state.reports) return;

  const is = state.reports.incomeStatement;
  
  isEl.innerHTML = `
    <tr><td>Marge Brute</td><td class="amount">${money(is.margeBrute)}</td></tr>
    <tr><td>Valeur Ajoutée</td><td class="amount">${money(is.valeurAjoutee)}</td></tr>
    <tr><td>Excédent Brut d'Exploitation (EBE)</td><td class="amount">${money(is.ebe)}</td></tr>
    <tr><td>Résultat d'Exploitation</td><td class="amount">${money(is.resultatExploitation)}</td></tr>
    <tr><td>Résultat Financier</td><td class="amount">${money(is.resultatFinancier)}</td></tr>
    <tr><td>Résultat HAO</td><td class="amount">${money(is.resultatHao)}</td></tr>
    <tr class="total-row"><td>Résultat Net</td><td class="amount">${money(is.resultatNet)}</td></tr>
  `;
}

function renderVatDeclaration() {
  const vatEl = document.getElementById("vat-declaration");
  const vatTotalsEl = document.getElementById("vat-totals");
  if (!vatEl || !state.reports || !state.reports.vatDeclaration) return;

  const vat = state.reports.vatDeclaration;

  vatEl.innerHTML = `
    <tr><td>Chiffre d'Affaires HT (Base)</td><td class="amount">${money(vat.caHt)}</td></tr>
    <tr><td>TVA Collectée</td><td class="amount">${money(vat.tvaCollectee)}</td></tr>
    <tr><td>Achats HT (Base)</td><td class="amount">${money(vat.achatsHt)}</td></tr>
    <tr><td>TVA Déductible</td><td class="amount">${money(vat.tvaDeductible)}</td></tr>
    <tr class="total-row"><td>TVA Nette</td><td class="amount">${money(vat.tvaNette)}</td></tr>
  `;

  vatTotalsEl.innerHTML = `
    <div class="total-chip"><span>TVA à payer</span><strong>${money(vat.tvaAPayer)}</strong></div>
    <div class="total-chip"><span>Crédit de TVA</span><strong>${money(vat.creditTva)}</strong></div>
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

function renderUsers() {
  const canManage = canManageUsers();
  userForm.classList.toggle("is-disabled", !canManage);
  inviteForm.classList.toggle("is-disabled", !canManage);
  [...userForm.elements].forEach((element) => {
    element.disabled = !canManage;
  });
  [...inviteForm.elements].forEach((element) => {
    element.disabled = !canManage;
  });

  if (!canManage) {
    usersCountEl.textContent = "Acces reserve";
    usersTableEl.innerHTML = `
      <tr>
        <td colspan="5">La gestion des utilisateurs est reservee aux proprietaires et administrateurs.</td>
      </tr>
    `;
    return;
  }

  usersCountEl.textContent = `${state.users.length} utilisateur${state.users.length > 1 ? "s" : ""}`;
  usersTableEl.innerHTML = state.users.map((user) => `
    <tr data-user-row="${escapeHtml(user.id)}">
      <td>
        <label class="compact-field">
          Nom
          <input data-user-field="name" value="${escapeHtml(user.name)}" />
        </label>
        <div class="muted-text">${escapeHtml(user.email)}</div>
      </td>
      <td>
        <select data-user-field="role">
          ${["owner", "admin", "accountant", "viewer"].map((role) => `
            <option value="${role}" ${user.role === role ? "selected" : ""}>${roleLabel(role)}</option>
          `).join("")}
        </select>
      </td>
      <td>
        <select data-user-field="status">
          <option value="active" ${user.status === "active" ? "selected" : ""}>Actif</option>
          <option value="disabled" ${user.status === "disabled" ? "selected" : ""}>Desactive</option>
        </select>
      </td>
      <td>${formatDate(user.createdAt?.slice(0, 10) || "")}</td>
      <td>
        <button class="btn" type="button" data-save-user="${escapeHtml(user.id)}">Enregistrer</button>
      </td>
    </tr>
  `).join("");

  if (state.users.length === 0) {
    usersTableEl.innerHTML = `
      <tr>
        <td colspan="5">Aucun utilisateur trouve.</td>
      </tr>
    `;
  }

  for (const button of usersTableEl.querySelectorAll("[data-save-user]")) {
    button.addEventListener("click", () => updateUserAccess(button.dataset.saveUser));
  }
}

function renderOrganizations() {
  const canManage = canManageUsers();
  organizationForm.classList.toggle("is-disabled", !canManage);
  [...organizationForm.elements].forEach((element) => {
    element.disabled = !canManage;
  });

  if (!canManage) {
    organizationsCountEl.textContent = "Acces reserve";
    organizationsTableEl.innerHTML = `
      <tr>
        <td colspan="4">La creation de dossiers est reservee aux proprietaires et administrateurs.</td>
      </tr>
    `;
    return;
  }

  organizationsCountEl.textContent = `${state.organizations.length} dossier${state.organizations.length > 1 ? "s" : ""}`;
  organizationsTableEl.innerHTML = state.organizations.map((organization) => `
    <tr>
      <td>
        <strong>${escapeHtml(organization.name)}</strong>
        <div class="muted-text">${escapeHtml(organization.id)}</div>
      </td>
      <td>${escapeHtml(organization.country)}</td>
      <td>${escapeHtml(organization.currency)}</td>
      <td>${organization.createdAt ? formatDate(organization.createdAt.slice(0, 10)) : "-"}</td>
    </tr>
  `).join("");

  if (state.organizations.length === 0) {
    organizationsTableEl.innerHTML = `
      <tr>
        <td colspan="4">Aucun dossier trouve.</td>
      </tr>
    `;
  }
}

function renderJournals() {
  const canManage = canManageUsers();
  journalForm.classList.toggle("is-disabled", !canManage);
  [...journalForm.elements].forEach((element) => {
    element.disabled = !canManage;
  });

  if (!canManage) {
    journalsCountEl.textContent = "Acces reserve";
    journalsTableEl.innerHTML = `
      <tr>
        <td colspan="4">La creation des journaux est reservee aux proprietaires et administrateurs.</td>
      </tr>
    `;
    return;
  }

  journalsCountEl.textContent = `${state.journals.length} journal${state.journals.length > 1 ? "x" : ""}`;
  journalsTableEl.innerHTML = state.journals.map((journal) => `
    <tr>
      <td><strong>${escapeHtml(journal.code)}</strong></td>
      <td>${escapeHtml(journal.label)}</td>
      <td>${journalTypeLabel(journal.type)}</td>
      <td><span class="status-pill">${journal.status === "active" ? "Actif" : "Archive"}</span></td>
    </tr>
  `).join("");

  if (state.journals.length === 0) {
    journalsTableEl.innerHTML = `
      <tr>
        <td colspan="4">Aucun journal trouve.</td>
      </tr>
    `;
  }
}

function renderJobs() {
  const recentJobs = state.jobs.filter((job) => job.type === "financial-statements-export").slice(0, 8);
  jobsTableEl.innerHTML = recentJobs.map((job) => `
    <tr>
      <td>
        <strong>Etats financiers</strong>
        <div class="muted-text">${job.payload?.from || "debut"} - ${job.payload?.to || "fin"}</div>
      </td>
      <td><span class="status-pill ${job.status === "failed" ? "terra" : ""}">${jobStatusLabel(job.status)}</span></td>
      <td>${job.result?.fileId ? `<button class="btn" type="button" data-download-file="${escapeHtml(job.result.fileId)}" data-file-name="${escapeHtml(job.result.fileName || "export.json")}">Telecharger</button>` : escapeHtml(job.error || "-")}</td>
      <td>${formatDateTime(job.createdAt)}</td>
    </tr>
  `).join("");

  if (recentJobs.length === 0) {
    jobsTableEl.innerHTML = `
      <tr>
        <td colspan="4">Aucun export serveur genere.</td>
      </tr>
    `;
  }

  for (const button of jobsTableEl.querySelectorAll("[data-download-file]")) {
    button.addEventListener("click", () => downloadStoredFile(button.dataset.downloadFile, button.dataset.fileName));
  }
}

function jobStatusLabel(status) {
  return {
    queued: "En attente",
    running: "En cours",
    done: "Termine",
    failed: "Echoue"
  }[status] || status;
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
  
  renderAuxiliaryLedger();
}

function filteredAgedBalanceClients() {
  const query = (agedBalanceClientsSearchEl?.value || "").toLowerCase();
  return (state.reports?.agedBalanceClients || []).filter((row) =>
    !query ||
    row.code.toLowerCase().includes(query) ||
    row.label.toLowerCase().includes(query)
  );
}

function filteredAgedBalanceSuppliers() {
  const query = (agedBalanceSuppliersSearchEl?.value || "").toLowerCase();
  return (state.reports?.agedBalanceSuppliers || []).filter((row) =>
    !query ||
    row.code.toLowerCase().includes(query) ||
    row.label.toLowerCase().includes(query)
  );
}

function renderAgedBalanceClients() {
  const target = document.querySelector("#aged-balance-clients");
  if (!target) return;
  
  const rows = filteredAgedBalanceClients();
  const totals = rows.reduce((acc, row) => {
    acc.total += row.total;
    acc.current += row.current;
    acc.b30 += row.b30;
    acc.b60 += row.b60;
    acc.b90 += row.b90;
    acc.b90plus += row.b90plus;
    return acc;
  }, { total: 0, current: 0, b30: 0, b60: 0, b90: 0, b90plus: 0 });

  target.innerHTML = rows
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.code)} - ${escapeHtml(row.label)}</td>
        <td>${escapeHtml(row.accountCode)}</td>
        <td><strong>${money(row.total)}</strong></td>
        <td>${money(row.current)}</td>
        <td>${money(row.b30)}</td>
        <td>${money(row.b60)}</td>
        <td class="${row.b90 > 0 ? 'text-warning' : ''}">${money(row.b90)}</td>
        <td class="${row.b90plus > 0 ? 'text-danger' : ''}">${money(row.b90plus)}</td>
      </tr>
    `)
    .join("");

  if (rows.length > 0) {
    target.innerHTML += `
      <tr class="total-row">
        <td colspan="2">Totaux</td>
        <td><strong>${money(totals.total)}</strong></td>
        <td>${money(totals.current)}</td>
        <td>${money(totals.b30)}</td>
        <td>${money(totals.b60)}</td>
        <td class="${totals.b90 > 0 ? 'text-warning' : ''}">${money(totals.b90)}</td>
        <td class="${totals.b90plus > 0 ? 'text-danger' : ''}">${money(totals.b90plus)}</td>
      </tr>
    `;
  } else {
    target.innerHTML = `
      <tr>
        <td colspan="8">Aucune donnee pour la balance agee clients.</td>
      </tr>
    `;
  }
}

function renderAgedBalanceSuppliers() {
  const target = document.querySelector("#aged-balance-suppliers");
  if (!target) return;
  
  const rows = filteredAgedBalanceSuppliers();
  const totals = rows.reduce((acc, row) => {
    acc.total += row.total;
    acc.current += row.current;
    acc.b30 += row.b30;
    acc.b60 += row.b60;
    acc.b90 += row.b90;
    acc.b90plus += row.b90plus;
    return acc;
  }, { total: 0, current: 0, b30: 0, b60: 0, b90: 0, b90plus: 0 });

  target.innerHTML = rows
    .map((row) => `
      <tr>
        <td>${escapeHtml(row.code)} - ${escapeHtml(row.label)}</td>
        <td>${escapeHtml(row.accountCode)}</td>
        <td><strong>${money(row.total)}</strong></td>
        <td>${money(row.current)}</td>
        <td>${money(row.b30)}</td>
        <td>${money(row.b60)}</td>
        <td class="${row.b90 > 0 ? 'text-warning' : ''}">${money(row.b90)}</td>
        <td class="${row.b90plus > 0 ? 'text-danger' : ''}">${money(row.b90plus)}</td>
      </tr>
    `)
    .join("");

  if (rows.length > 0) {
    target.innerHTML += `
      <tr class="total-row">
        <td colspan="2">Totaux</td>
        <td><strong>${money(totals.total)}</strong></td>
        <td>${money(totals.current)}</td>
        <td>${money(totals.b30)}</td>
        <td>${money(totals.b60)}</td>
        <td class="${totals.b90 > 0 ? 'text-warning' : ''}">${money(totals.b90)}</td>
        <td class="${totals.b90plus > 0 ? 'text-danger' : ''}">${money(totals.b90plus)}</td>
      </tr>
    `;
  } else {
    target.innerHTML = `
      <tr>
        <td colspan="8">Aucune donnee pour la balance agee fournisseurs.</td>
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

function filteredAuxiliaryLedgerLines() {
  const query = auxiliaryBalanceSearchEl.value.trim().toLowerCase();
  const partyKind = auxiliaryBalancePartyFilterEl.value;
  const period = reportPeriod();
  
  let matchingLines = [];
  for (const entry of state.entries) {
    if (entry.date < period.startDate || entry.date > period.endDate) continue;
    
    for (const line of entry.lines) {
      if (line.auxiliaryCode) {
        matchingLines.push({ ...line, date: entry.date, reference: entry.reference, description: entry.description });
      }
    }
  }
  
  return matchingLines.filter(line => {
    const matchesParty = partyKind === "all" || accountPartyKind(line.accountCode) === partyKind;
    if (!matchesParty) return false;
    
    if (query) {
       const auxLabel = auxiliaryInputValue(line.auxiliaryCode).toLowerCase();
       const accLabel = accountName(line.accountCode).toLowerCase();
       if (!auxLabel.includes(query) && !accLabel.includes(query) && !line.auxiliaryCode.toLowerCase().includes(query)) {
          return false;
       }
    }
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function renderAuxiliaryLedger() {
  const lines = filteredAuxiliaryLedgerLines();
  const tbody = document.querySelector("#auxiliary-ledger");
  if (!tbody) return;
  
  tbody.innerHTML = lines.map(line => `
    <tr>
      <td>${escapeHtml(line.date)}</td>
      <td>${escapeHtml(line.reference)}</td>
      <td>${escapeHtml(line.accountCode)}</td>
      <td>${escapeHtml(auxiliaryInputValue(line.auxiliaryCode))}</td>
      <td>${escapeHtml(line.description || "")}</td>
      <td class="amount">${line.debit > 0 ? money(line.debit) : ""}</td>
      <td class="amount">${line.credit > 0 ? money(line.credit) : ""}</td>
    </tr>
  `).join("") || '<tr><td colspan="7" class="empty-state">Aucune ecriture trouvee pour les tiers selectionnes.</td></tr>';
}

function renderAccountOptions() {
  accountOptionsEl.innerHTML = state.accounts
    .filter((account) => account.isPostable)
    .map((account) => `<option value="${escapeHtml(account.code)}" label="${escapeHtml(account.label)}"></option>`)
    .join("");
}

function renderJournalOptions() {
  const options = [
    `<option value="manual">Saisie manuelle</option>`,
    `<option value="subscription">Abonnement</option>`,
    `<option value="bank-csv">Import bancaire</option>`,
    `<option value="seed">Demo</option>`,
    ...state.journals
      .filter((journal) => journal.status === "active")
      .map((journal) => `<option value="${escapeHtml(journal.code)}">${escapeHtml(journal.code)} - ${escapeHtml(journal.label)}</option>`)
  ];
  entryJournalEl.innerHTML = options.join("");
  journalSourceEl.innerHTML = `
    <option value="all">Toutes sources</option>
    <option value="manual">Saisie manuelle</option>
    <option value="subscription">Abonnement</option>
    <option value="bank-csv">Import bancaire</option>
    <option value="seed">Demo</option>
    ${state.journals.map((journal) => `<option value="${escapeHtml(journal.code)}">${escapeHtml(journal.code)} - ${escapeHtml(journal.label)}</option>`).join("")}
  `;
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
      <td>${typeLabel(account.reportType ?? account.type)}${account.source === "custom" ? " - dossier" : ""}</td>
    </tr>
  `).join("");
}

function renderEntries() {
  const filteredEntries = filterEntries();
  document.querySelector("#entries").innerHTML = filteredEntries
    .slice(0, 8)
    .map(
      (entry) => {
        const locked = isEntryLocked(entry);
        return `
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
            <button class="btn" type="button" data-edit-entry="${escapeHtml(entry.id)}" ${locked ? "disabled title=\"Exercice verrouille\"" : ""}>Modifier</button>
            <button class="btn danger" type="button" data-delete-entry="${escapeHtml(entry.id)}" ${locked ? "disabled title=\"Exercice verrouille\"" : ""}>Supprimer</button>
          </div>
        </article>
      `;
      }
    )
    .join("");

  if (filteredEntries.length === 0) {
    document.querySelector("#entries").innerHTML = `<div class="message">Aucune ecriture ne correspond aux filtres.</div>`;
  }

  for (const button of document.querySelectorAll("[data-view-entry]")) {
    button.addEventListener("click", () => showEntryDetail(button.dataset.viewEntry));
  }

  for (const button of document.querySelectorAll("[data-edit-entry]")) {
    button.addEventListener("click", () => startEntryEdit(button.dataset.editEntry));
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

function isEntryLocked(entry) {
  const period = state.periods.find((candidate) => entry.date >= candidate.startDate && entry.date <= candidate.endDate);
  return period?.status === "locked";
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
      ${isEntryLocked(entry) ? `<div class="message">Exercice verrouille: modification et suppression indisponibles.</div>` : `
        <div class="entry-actions">
          <button class="btn" type="button" data-edit-entry-detail="${escapeHtml(entry.id)}">Modifier</button>
        </div>
      `}
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

  const editButton = journalDetailEl.querySelector("[data-edit-entry-detail]");
  if (editButton) editButton.addEventListener("click", () => startEntryEdit(editButton.dataset.editEntryDetail));
}

function startEntryEdit(entryId) {
  const entry = state.entries.find((candidate) => candidate.id === entryId);
  if (!entry) return;
  if (isEntryLocked(entry)) {
    setMessage("Cette ecriture appartient a un exercice verrouille.", true);
    return;
  }

  editingEntryId = entry.id;
  form.elements.date.value = entry.date;
  form.elements.reference.value = entry.reference ?? "";
  form.elements.description.value = entry.description;
  if (![...entryJournalEl.options].some((option) => option.value === entry.source)) {
    entryJournalEl.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(entry.source)}">${sourceLabel(entry.source)}</option>`);
  }
  form.elements.source.value = entry.source ?? "manual";
  linesEl.innerHTML = "";
  for (const line of entry.lines) {
    addLine(line);
  }
  saveEntryButton.textContent = "Modifier l'ecriture";
  cancelEntryEditButton.hidden = false;
  setMessage(`Modification de l'ecriture ${entry.reference}.`);
  setView("entry");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelEntryEdit() {
  exitEntryEditMode();
  setMessage("Modification annulee.");
}

function exitEntryEditMode() {
  editingEntryId = "";
  form.reset();
  linesEl.innerHTML = "";
  form.elements.date.valueAsDate = new Date();
  form.elements.reference.value = nextManualReference();
  form.elements.source.value = "manual";
  addLine({ accountCode: "4111", debit: 250000, credit: 0 });
  addLine({ accountCode: "7061", debit: 0, credit: 250000 });
  form.elements.description.value = "Vente de services";
  saveEntryButton.textContent = "Enregistrer";
  cancelEntryEditButton.hidden = true;
  renderEntryBalanceStatus();
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

function auxiliaryLedgerPrintTitle() {
  const party = auxiliaryBalancePartyFilterEl.value;
  const parts = [party === "all" ? "Grand Livre des Tiers" : `Grand Livre des Tiers - ${partyKindLabel(party)}`];
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
  if (response.status === 401) {
    clearSession();
    showLogin();
    throw new Error("Session expiree");
  }
  if (!response.ok) throw new Error(`Erreur API ${url}`);
  return response.json();
}

// Writes an inline message and also surfaces an animated toast. Transient
// "...en cours" loading messages are not toasted (the top progress bar covers them).
function notify(el, text, isError = false) {
  if (el) {
    el.textContent = text;
    el.classList.toggle("error", isError);
  }
  if (text && !String(text).endsWith("...") && typeof window.toast === "function") {
    window.toast(text, isError ? "error" : "success");
  }
}

function setMessage(text, isError = false) {
  notify(messageEl, text, isError);
}

function setCompanyMessage(text, isError = false) {
  notify(companyMessageEl, text, isError);
}

function setAuxiliaryMessage(text, isError = false) {
  notify(auxiliaryMessageEl, text, isError);
}

function setAccountMessage(text, isError = false) {
  notify(accountMessageEl, text, isError);
}

function setUserMessage(text, isError = false) {
  notify(userMessageEl, text, isError);
}

function setInviteMessage(text, isError = false) {
  notify(inviteMessageEl, text, isError);
}

function setOrganizationMessage(text, isError = false) {
  notify(organizationMessageEl, text, isError);
}

function setJournalMessage(text, isError = false) {
  notify(journalMessageEl, text, isError);
}

function setJobsMessage(text, isError = false) {
  notify(jobsMessageEl, text, isError);
}

function setSubscriptionMessage(text, isError = false) {
  notify(subscriptionMessageEl, text, isError);
}

function setLetteringMessage(text, isError = false) {
  notify(letteringMessageEl, text, isError);
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

async function downloadStoredFile(fileId, filename) {
  const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/content`);
  if (!response.ok) {
    setJobsMessage("Telechargement impossible.", true);
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "export.json";
  link.click();
  URL.revokeObjectURL(url);
}

function printState(title, mode = "") {
  const company = state.company ?? {};
  document.body.dataset.printTitle = title;
  document.body.dataset.printMode = mode;
  document.body.dataset.printCompany = company.name ?? "";
  document.body.dataset.printMeta = [
    company.country,
    company.currency,
    company.fiscalYearStart ? `Exercice ${String(company.fiscalYearStart).slice(0, 4)}` : "",
    reportPeriodLabel()
  ].filter(Boolean).join(" - ");
  document.body.dataset.printDate = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
  window.print();
  document.body.dataset.printMode = "";
}

function setImportStatus(text, tone) {
  importStatusEl.textContent = text;
  importStatusEl.classList.toggle("terra", tone === "terra");
}

function money(amount) {
  return formatter.format(Number(amount || 0));
}

function compactMoney(amount) {
  return compactFormatter.format(Number(amount || 0));
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
  const journal = state.journals.find((candidate) => candidate.code === source);
  if (journal) return `${journal.code} - ${journal.label}`;
  return {
    "bank-csv": "Import bancaire",
    manual: "Saisie manuelle",
    subscription: "Abonnement",
    seed: "Demo"
  }[source] ?? source ?? "Inconnu";
}

function journalTypeLabel(type) {
  return {
    misc: "Operations diverses",
    bank: "Banque",
    cash: "Caisse",
    sales: "Ventes",
    purchase: "Achats",
    payroll: "Paie",
    closing: "Cloture"
  }[type] ?? type ?? "Inconnu";
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

/* =========================================================================
   AI Chat Assistant Logic
   ========================================================================= */
const aiChatToggle = document.getElementById("ai-chat-toggle");
const aiChatWindow = document.getElementById("ai-chat-window");
const aiChatClose = document.getElementById("ai-chat-close");
const aiChatForm = document.getElementById("ai-chat-form");
const aiChatInput = document.getElementById("ai-chat-input");
const aiChatMessages = document.getElementById("ai-chat-messages");
const aiChatSubmit = document.getElementById("ai-chat-submit");

let aiChatHistory = [];

aiChatToggle?.addEventListener("click", () => {
  aiChatWindow.classList.remove("hidden");
  aiChatInput.focus();
});

aiChatClose?.addEventListener("click", () => {
  aiChatWindow.classList.add("hidden");
});

function addChatMessage(content, role) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${role}`;
  // Use simple HTML formatting for bold and line breaks
  const formatted = escapeHtml(content)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
  msgDiv.innerHTML = formatted;
  aiChatMessages.appendChild(msgDiv);
  aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
}

function showTypingIndicator() {
  const div = document.createElement("div");
  div.className = "message ai typing-indicator";
  div.id = "typing-indicator";
  div.innerHTML = "<span></span><span></span><span></span>";
  aiChatMessages.appendChild(div);
  aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
}

function hideTypingIndicator() {
  const indicator = document.getElementById("typing-indicator");
  if (indicator) indicator.remove();
}

aiChatForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = aiChatInput.value.trim();
  if (!text) return;

  aiChatInput.value = "";
  aiChatSubmit.disabled = true;
  
  addChatMessage(text, "user");
  showTypingIndicator();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: aiChatHistory })
    });

    const data = await response.json();
    hideTypingIndicator();

    if (!response.ok) {
      addChatMessage(data.error || "Erreur lors de la communication avec l'assistant.", "error");
    } else {
      addChatMessage(data.answer, "ai");
      aiChatHistory.push({ role: "user", content: text });
      aiChatHistory.push({ role: "model", content: data.answer });
    }
  } catch (err) {
    hideTypingIndicator();
    addChatMessage("Impossible de joindre le serveur.", "error");
  } finally {
    aiChatSubmit.disabled = false;
    aiChatInput.focus();
  }
});
