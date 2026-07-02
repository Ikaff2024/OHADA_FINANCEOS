/** Format un nombre en FCFA (séparateurs FR, sans zéro) */
export const fmt = (n) => {
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '—'
  const v = Number(n)
  if (v === 0) return '—'
  return new Intl.NumberFormat('fr-FR').format(Math.round(Math.abs(v)))
}

/** Format signé : valeurs négatives entre parenthèses */
export const fmtSigned = (n) => {
  const v = Number(n)
  if (!v || isNaN(v)) return '—'
  const abs = new Intl.NumberFormat('fr-FR').format(Math.round(Math.abs(v)))
  return v < 0 ? `(${abs})` : abs
}

/** Parse une chaîne en nombre flottant */
export const p = (s) => {
  if (!s) return 0
  return parseFloat(String(s).replace(/\s/g, '').replace(',', '.')) || 0
}

/** Format pourcentage */
export const fmtPct = (num, den) => {
  if (!den || isNaN(Number(den)) || Number(den) === 0) return '—'
  return (Number(num) / Number(den) * 100).toFixed(1) + '%'
}
