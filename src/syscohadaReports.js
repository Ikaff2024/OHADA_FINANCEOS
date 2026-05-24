import { buildTrialBalance } from "./accounting.js";

function balanceForAccounts(rows, prefixes, side = 'debit') {
  let sum = 0;
  for (const row of rows) {
    if (prefixes.some(prefix => row.code.startsWith(prefix))) {
      sum += (side === 'debit' ? (row.debit - row.credit) : (row.credit - row.debit));
    }
  }
  return sum;
}

export function buildSyscohadaBalanceSheet(entries, accountCatalog) {
  const trialBalance = buildTrialBalance(entries, accountCatalog);
  
  // ACTIF (Debit side balances)
  const actifImmobilise = balanceForAccounts(trialBalance, ["2"], "debit");
  const actifCirculantStock = balanceForAccounts(trialBalance, ["3"], "debit");
  const actifCirculantCreances = balanceForAccounts(trialBalance, ["41", "42", "43", "441", "443", "448", "45", "461", "47"], "debit");
  const tresorerieActif = balanceForAccounts(trialBalance, ["52", "53", "54", "55", "57", "58"], "debit");
  
  const totalActif = actifImmobilise + actifCirculantStock + actifCirculantCreances + tresorerieActif;

  // PASSIF (Credit side balances)
  const capitauxPropres = balanceForAccounts(trialBalance, ["10", "11", "12", "13", "14", "15"], "credit");
  const dettesFinancieres = balanceForAccounts(trialBalance, ["16", "17", "18", "19"], "credit");
  const passifCirculant = balanceForAccounts(trialBalance, ["40", "42", "43", "442", "444", "445", "449", "462", "48"], "credit");
  const tresoreriePassif = balanceForAccounts(trialBalance, ["56"], "credit");

  // Income statement gives retained earnings for the period
  const incomeStatement = buildSyscohadaIncomeStatement(entries, accountCatalog);
  const resultatNet = incomeStatement.resultatNet;

  const totalPassif = capitauxPropres + resultatNet + dettesFinancieres + passifCirculant + tresoreriePassif;
  const difference = totalActif - totalPassif;

  return {
    actif: {
      actifImmobilise,
      actifCirculantStock,
      actifCirculantCreances,
      tresorerieActif,
      totalActif
    },
    passif: {
      capitauxPropres,
      resultatNet,
      dettesFinancieres,
      passifCirculant,
      tresoreriePassif,
      totalPassif
    },
    difference,
    rows: trialBalance.filter(r => r.code.startsWith("1") || r.code.startsWith("2") || r.code.startsWith("3") || r.code.startsWith("4") || r.code.startsWith("5"))
  };
}

export function buildSyscohadaIncomeStatement(entries, accountCatalog) {
  const trialBalance = buildTrialBalance(entries, accountCatalog);

  const ventes = balanceForAccounts(trialBalance, ["70"], "credit");
  const achats = balanceForAccounts(trialBalance, ["60"], "debit");
  const margeBrute = ventes - achats;

  const autresProduits = balanceForAccounts(trialBalance, ["71", "72", "73", "74", "75"], "credit");
  const servicesExterieurs = balanceForAccounts(trialBalance, ["61", "62", "63"], "debit");
  const impotsTaxes = balanceForAccounts(trialBalance, ["64"], "debit");
  const autresCharges = balanceForAccounts(trialBalance, ["65"], "debit");

  const valeurAjoutee = margeBrute + autresProduits - servicesExterieurs - impotsTaxes - autresCharges;

  const chargesPersonnel = balanceForAccounts(trialBalance, ["66"], "debit");
  const ebe = valeurAjoutee - chargesPersonnel; // Excédent Brut d'Exploitation

  const dotations = balanceForAccounts(trialBalance, ["681"], "debit");
  const reprises = balanceForAccounts(trialBalance, ["781"], "credit");
  const resultatExploitation = ebe - dotations + reprises;

  const produitsFinanciers = balanceForAccounts(trialBalance, ["77"], "credit");
  const chargesFinancieres = balanceForAccounts(trialBalance, ["67"], "debit");
  const resultatFinancier = produitsFinanciers - chargesFinancieres;

  const produitsHao = balanceForAccounts(trialBalance, ["81", "83", "85", "87"], "credit");
  const chargesHao = balanceForAccounts(trialBalance, ["82", "84", "86", "88"], "debit");
  const resultatHao = produitsHao - chargesHao;

  const impotResultat = balanceForAccounts(trialBalance, ["89"], "debit");

  const resultatNet = resultatExploitation + resultatFinancier + resultatHao - impotResultat;

  return {
    margeBrute,
    valeurAjoutee,
    ebe,
    resultatExploitation,
    resultatFinancier,
    resultatHao,
    resultatNet,
    details: {
      ventes, achats, autresProduits, servicesExterieurs, impotsTaxes, autresCharges,
      chargesPersonnel, dotations, reprises, produitsFinanciers, chargesFinancieres,
      produitsHao, chargesHao, impotResultat
    },
    rows: trialBalance.filter(r => ["6", "7", "8"].some(prefix => r.code.startsWith(prefix)))
  };
}

export function buildVatDeclaration(entries, accountCatalog) {
  const trialBalance = buildTrialBalance(entries, accountCatalog);
  
  // Note: TVA is usually credit for collectée and debit for déductible
  const tvaCollectee = balanceForAccounts(trialBalance, ["443"], "credit");
  const tvaDeductible = balanceForAccounts(trialBalance, ["445"], "debit");
  
  const caHt = balanceForAccounts(trialBalance, ["70"], "credit");
  const achatsHt = balanceForAccounts(trialBalance, ["60", "61", "62"], "debit");

  const tvaNette = tvaCollectee - tvaDeductible;

  return {
    caHt,
    tvaCollectee,
    achatsHt,
    tvaDeductible,
    tvaNette,
    tvaAPayer: Math.max(tvaNette, 0),
    creditTva: Math.max(-tvaNette, 0)
  };
}
