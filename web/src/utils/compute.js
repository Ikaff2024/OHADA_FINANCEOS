import { p } from './format.js'
import { BILAN_ACTIF_ROWS, BILAN_PASSIF_ROWS } from '../data/plan_comptable.js'

/** Calcule les soldes N d'un compte à partir de la balance */
export function computeSoldeN(balance, num) {
  const e = balance[num] || {}
  const net = p(e.sd_nm1) + p(e.mvt_d) - p(e.sc_nm1) - p(e.mvt_c)
  return { sd: Math.max(0, net), sc: Math.max(0, -net) }
}

/** Calcule tous les SIG du compte de résultat */
export function computeCR(cr) {
  const v = (ref) => p(cr[ref]?.n)
  const xA = v('TA') - v('RA') + v('RB')
  const xB = v('TB') + v('TC') + v('TD') + xA
  const xC = xB + v('TE') + v('TF') + v('TG') + v('TH') + v('TI')
           - v('RC') + v('RD') - v('RE') - v('RF')
           - v('RG') - v('RH') - v('RI') - v('RJ')
  const xD = xC - v('RK')
  const xE = xD + v('TJ') - v('RL')
  const xF = v('TK') + v('TL') + v('TM') - v('RM') - v('RN')
  const xG = xE + xF
  const xH = v('TN') + v('TO') - v('RO') - v('RP')
  const xI = xG + xH - v('RQ') - v('RS')
  return { xA, xB, xC, xD, xE, xF, xG, xH, xI }
}

/** Calcule le total actif net N depuis bilan_actif */
export function computeTotalActifNet(bilan_actif) {
  return BILAN_ACTIF_ROWS.reduce((acc, r) => {
    const row = bilan_actif[r.ref] || {}
    return acc + p(row.brut) - p(row.amort)
  }, 0)
}

/** Calcule le total passif N depuis bilan_passif */
export function computeTotalPassif(bilan_passif) {
  return BILAN_PASSIF_ROWS.reduce((acc, r) => acc + p(bilan_passif[r.ref]?.n), 0)
}

/** Calcule les capitaux propres */
export function computeCP(bilan_passif) {
  const cp_refs = ['CA','CB','CD','CE','CF','CG','CH','CJ','CL','CM']
  return cp_refs.reduce((a, r) => a + p(bilan_passif[r]?.n), 0)
}

/** Calcule la CAFG depuis tafire et CR */
export function computeCAFG(tafire, cr) {
  const { xD: ebe } = computeCR(cr)
  const tf = tafire
  const charges = p(tf.SA) + p(tf.SC) + p(tf.SL) + p(tf.SQ) + p(tf.SR)
  const produits = ebe + p(tf.TT) + p(tf.UA) + p(tf.UE) + p(tf.UC) + p(tf.UL) + p(tf.UN)
  return produits - charges
}
