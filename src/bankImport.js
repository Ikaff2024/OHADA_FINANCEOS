const rules = [
  {
    accountCode: "7061",
    counterpartyAccountCode: "5211",
    direction: "credit",
    confidence: 0.88,
    label: "Service vendu",
    keywords: ["honoraire", "prestation", "service", "consulting", "facture"]
  },
  {
    accountCode: "7011",
    counterpartyAccountCode: "5211",
    direction: "credit",
    confidence: 0.84,
    label: "Vente de marchandises",
    keywords: ["vente", "reglement client", "client", "encaissement"]
  },
  {
    accountCode: "6011",
    counterpartyAccountCode: "5211",
    direction: "debit",
    confidence: 0.82,
    label: "Achat de marchandises",
    keywords: ["achat", "fournisseur", "stock", "marchandise"]
  },
  {
    accountCode: "6222",
    counterpartyAccountCode: "5211",
    direction: "debit",
    confidence: 0.9,
    label: "Loyer ou charge locative",
    keywords: ["loyer", "bail", "location", "bureau"]
  },
  {
    accountCode: "6611",
    counterpartyAccountCode: "5211",
    direction: "debit",
    confidence: 0.86,
    label: "Charge de personnel",
    keywords: ["salaire", "paie", "remuneration", "cnps", "personnel"]
  },
  {
    accountCode: "4011",
    counterpartyAccountCode: "5211",
    direction: "debit",
    confidence: 0.62,
    label: "Paiement fournisseur",
    keywords: ["virement", "paiement", "reglement", "transfert"]
  },
  {
    accountCode: "4111",
    counterpartyAccountCode: "5211",
    direction: "credit",
    confidence: 0.66,
    label: "Encaissement client",
    keywords: ["virement recu", "versement", "depot", "mobile money"]
  }
];

const requiredColumns = ["date", "description", "amount"];

export function previewBankCsv(csvText, learnedRules = [], existingFingerprints = []) {
  const rows = parseCsv(csvText);
  const errors = [];
  const existing = new Set(existingFingerprints);
  const seenInFile = new Set();

  if (rows.length === 0) {
    return { ok: false, errors: ["Le fichier CSV ne contient aucune ligne exploitable."], transactions: [] };
  }

  const headers = rows[0].map(normalizeHeader);
  for (const column of requiredColumns) {
    if (!headers.includes(column)) {
      errors.push(`Colonne obligatoire manquante: ${column}.`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, transactions: [] };
  }

  const transactions = rows.slice(1)
    .filter((row) => row.some((cell) => String(cell).trim() !== ""))
    .map((row, index) => {
      const record = Object.fromEntries(headers.map((header, headerIndex) => [header, row[headerIndex] ?? ""]));
      const amount = parseAmount(record.amount);
      const direction = amount >= 0 ? "credit" : "debit";
      const suggestion = classifyTransaction(record.description, direction, learnedRules);

      const date = normalizeDate(record.date);
      const description = String(record.description || "").trim();
      const fingerprint = createTransactionFingerprint({ date, description, amount });
      const duplicate = existing.has(fingerprint) || seenInFile.has(fingerprint);
      seenInFile.add(fingerprint);

      return {
        id: `csv-${index + 1}`,
        rowNumber: index + 2,
        date,
        description,
        amount,
        direction,
        fingerprint,
        duplicate,
        accountCode: suggestion.accountCode,
        counterpartyAccountCode: suggestion.counterpartyAccountCode,
        confidence: suggestion.confidence,
        reason: suggestion.reason
      };
    });

  for (const transaction of transactions) {
    if (!transaction.date) errors.push(`Ligne ${transaction.rowNumber}: date invalide.`);
    if (!transaction.description) errors.push(`Ligne ${transaction.rowNumber}: description manquante.`);
    if (!Number.isFinite(transaction.amount) || transaction.amount === 0) {
      errors.push(`Ligne ${transaction.rowNumber}: montant invalide ou nul.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    transactions
  };
}

export function transactionsToJournalEntries(transactions) {
  return transactions.map((transaction) => {
    const amount = Math.abs(Number(transaction.amount || 0));
    const bankLine = {
      accountCode: transaction.counterpartyAccountCode || "5211",
      label: "Mouvement bancaire",
      debit: transaction.direction === "credit" ? amount : 0,
      credit: transaction.direction === "debit" ? amount : 0
    };
    const counterpartLine = {
      accountCode: transaction.accountCode,
      label: transaction.reason,
      debit: transaction.direction === "debit" ? amount : 0,
      credit: transaction.direction === "credit" ? amount : 0
    };

    return {
      date: transaction.date,
      reference: `BAN-${transaction.date.replaceAll("-", "")}-${transaction.rowNumber}`,
      description: transaction.description,
      source: "bank-csv",
      bankFingerprint: transaction.fingerprint || createTransactionFingerprint(transaction),
      lines: [bankLine, counterpartLine]
    };
  });
}

export function buildLearningCorrections(originalTransactions, editedTransactions) {
  const editedById = new Map(editedTransactions.map((transaction) => [transaction.id, transaction]));

  return originalTransactions
    .map((original) => {
      const edited = editedById.get(original.id);
      if (!edited || edited.accountCode === original.accountCode) return null;

      return {
        matchText: normalizeText(original.description),
        description: original.description,
        direction: original.direction,
        accountCode: edited.accountCode,
        counterpartyAccountCode: edited.counterpartyAccountCode || original.counterpartyAccountCode || "5211",
        reason: "Correction utilisateur",
        confidence: 0.97,
        learnedAt: new Date().toISOString()
      };
    })
    .filter(Boolean);
}

export function sampleBankCsv() {
  return [
    "date,description,amount",
    "2026-02-04,Virement recu client Nimba service,850000",
    "2026-02-07,Paiement loyer bureau Plateau,-300000",
    "2026-02-10,Achat marchandises fournisseur Kone,-420000",
    "2026-02-28,Paiement salaires equipe,-650000"
  ].join("\n");
}

export function journalEntryFingerprints(entries) {
  return entries
    .map((entry) => entry.bankFingerprint)
    .filter(Boolean);
}

function classifyTransaction(description, direction, learnedRules) {
  const normalized = normalizeText(description);
  const learned = learnedRules.find((candidate) =>
    candidate.direction === direction &&
    normalized.includes(candidate.matchText)
  );

  if (learned) {
    return {
      accountCode: learned.accountCode,
      counterpartyAccountCode: learned.counterpartyAccountCode || "5211",
      confidence: learned.confidence || 0.97,
      reason: learned.reason || "Regle apprise"
    };
  }

  const rule = rules.find((candidate) =>
    candidate.direction === direction &&
    candidate.keywords.some((keyword) => normalized.includes(normalizeText(keyword)))
  );

  if (rule) {
    return {
      accountCode: rule.accountCode,
      counterpartyAccountCode: rule.counterpartyAccountCode,
      confidence: rule.confidence,
      reason: rule.label
    };
  }

  return {
    accountCode: direction === "credit" ? "4111" : "4011",
    counterpartyAccountCode: "5211",
    confidence: 0.42,
    reason: direction === "credit" ? "Encaissement a qualifier" : "Decaissement a qualifier"
  };
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < String(csvText || "").length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((candidate) => candidate.some((value) => String(value).trim() !== ""));
}

function normalizeHeader(value) {
  return normalizeText(value).replace(/\s+/g, "_");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function createTransactionFingerprint(transaction) {
  return [
    transaction.date || "",
    normalizeText(transaction.description),
    Number(transaction.amount || 0).toFixed(2)
  ].join("|");
}

function parseAmount(value) {
  const normalized = String(value || "")
    .replace(/\s/g, "")
    .replace("FCFA", "")
    .replace("XOF", "")
    .replace(",", ".");
  return Number(normalized);
}

function normalizeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}
