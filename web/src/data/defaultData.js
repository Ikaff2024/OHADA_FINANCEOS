import { BALANCE_ACCOUNTS, BILAN_ACTIF_ROWS, BILAN_PASSIF_ROWS, CR_ROWS } from './plan_comptable.js'

export function getDefaultData() {
  const balance = {}
  BALANCE_ACCOUNTS.forEach(a => {
    balance[a.num] = { sd_nm1: '', sc_nm1: '', mvt_d: '', mvt_c: '' }
  })

  const bilan_actif = {}
  BILAN_ACTIF_ROWS.forEach(r => {
    bilan_actif[r.ref] = { brut: '', amort: '', net_nm1: '' }
  })

  const bilan_passif = {}
  BILAN_PASSIF_ROWS.forEach(r => {
    bilan_passif[r.ref] = { n: '', nm1: '' }
  })

  const cr = {}
  CR_ROWS.forEach(r => {
    cr[r.ref] = { n: '', nm1: '' }
  })

  return {
    params: {
      denomination: '', sigle: '', adresse: '', bp: '',
      nif: '', ntd: '', rc: '', cnps: '',
      forme_jur: '', code_act: '', pays: 'Côte d\'Ivoire',
      date_debut: '', date_cloture: '', duree: '12',
      contact_nom: '', contact_tel: '', contact_email: '', contact_qualite: '',
      etabli_nom: '', etabli_tel: '', etabli_email: '',
    },
    balance,
    bilan_actif,
    bilan_passif,
    cr,
    tafire: {
      SA: '', SC: '', SL: '', SQ: '', SR: '',
      TT: '', UA: '', UE: '', UC: '', UL: '', UN: '',
      dividendes: '',
      BB_stocks: '', BG_crean: '', BH_crean: '', BI_crean: '', BT_eca: '',
      DJ_dettes: '', DK_dettes: '', DM_dettes: '', DV_ecp: '',
      prod_immo: '',
    },
    flux: {
      ZA: '', FA_auto: true,
      FB: '', FC: '', FD: '', FE: '',
      FF: '', FG: '', FH: '', FI: '', FJ: '',
      FK: '', FL: '', FM: '', FN: '',
      FO: '', FP: '', FQ: '',
      ZA_nm1: '',
    },
    notes: {
      n01: [],
      n03a: [],
      n27b: {
        effectifs_n: '', effectifs_nm1: '',
        masse_sal_n: '', masse_sal_nm1: '',
        personnel_ext_n: '', personnel_ext_nm1: '',
      },
      n28: [],
    },
    fird: {
      centre_depot: '',
      nb_exemplaires: '5',
      nb_pages: '61',
    },
  }
}
