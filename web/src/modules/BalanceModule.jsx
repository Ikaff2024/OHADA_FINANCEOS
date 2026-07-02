import { useState, useMemo, useRef } from 'react'
import { SectionHead, Card, SaveBtn, GhostBtn, Pill, NumCell } from '../components/UI.jsx'
import { BALANCE_ACCOUNTS } from '../data/plan_comptable.js'
import { computeSoldeN } from '../utils/compute.js'
import { fmt, p } from '../utils/format.js'

// Colonnes du fichier CSV a importer :
//   Col 0 : N deg Compte  (ex: 101100)
//   Col 1 : Intitule   (repere visuel, ignore a l'import)
//   Col 2 : SD N-1     saisie -> sd_nm1
//   Col 3 : SC N-1     saisie -> sc_nm1
//   Col 4 : Mvt Debit  saisie -> mvt_d
//   Col 5 : Mvt Credit saisie -> mvt_c
// SD N et SC N sont CALCULES automatiquement :
//   SD N = max(0,  sd_nm1 + mvt_d - sc_nm1 - mvt_c)
//   SC N = max(0, sc_nm1 + mvt_c - sd_nm1 - mvt_d)

function downloadTemplate() {
  const header = 'N\u00b0 Compte;Intitul\u00e9;SD N-1;SC N-1;Mvt D\u00e9bit;Mvt Cr\u00e9dit'
  const rows = BALANCE_ACCOUNTS.map(a => a.num + ';' + a.lib + ';0;0;0;0')
  const csv = [header, ...rows].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'authNtic_balance_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

function parseVal(str) {
  if (!str || str.trim() === '' || str.trim() === '-' || str.trim() === '0') return ''
  const n = parseFloat(str.trim().replace(/\s/g, '').replace(/,/g, '.'))
  return isNaN(n) || n === 0 ? '' : String(Math.abs(n))
}

function detectSep(line) {
  return (line.match(/;/g) || []).length >= (line.match(/,/g) || []).length ? ';' : ','
}

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim())
  if (lines.length < 2) throw new Error('Fichier vide ou ne contient pas de donn\u00e9es.')
  const sep = detectSep(lines[0])
  return lines.slice(1).map((line, idx) => {
    const cols = line.split(sep)
    if (cols.length < 2) return null
    return {
      num:    (cols[0] || '').trim().replace(/"/g, ''),
      sd_nm1: parseVal(cols[2]),
      sc_nm1: parseVal(cols[3]),
      mvt_d:  parseVal(cols[4]),
      mvt_c:  parseVal(cols[5]),
      _line:  idx + 2,
    }
  }).filter(Boolean)
}

function mapToBalance(rows, existingBal) {
  const known = new Set(BALANCE_ACCOUNTS.map(a => a.num))
  const result = { ...existingBal }
  const warnings = []
  const imported = []
  rows.forEach(row => {
    if (!row.num) return
    const raw = row.num.replace(/[.\s-]/g, '')
    const num = raw.length < 6 ? raw.padEnd(6, '0') : raw.substring(0, 6)
    if (!known.has(num)) {
      warnings.push('Ligne ' + row._line + ' : compte \u00ab ' + row.num + ' \u00bb absent du plan SYSCOHADA \u2192 ignor\u00e9')
      return
    }
    result[num] = { sd_nm1: row.sd_nm1, sc_nm1: row.sc_nm1, mvt_d: row.mvt_d, mvt_c: row.mvt_c }
    imported.push(num)
  })
  let sd1 = 0, sc1 = 0, md = 0, mc = 0, sdn = 0, scn = 0
  BALANCE_ACCOUNTS.forEach(a => {
    const e = result[a.num] || {}
    sd1 += p(e.sd_nm1); sc1 += p(e.sc_nm1)
    md  += p(e.mvt_d);  mc  += p(e.mvt_c)
    const { sd, sc } = computeSoldeN(result, a.num)
    sdn += sd; scn += sc
  })
  return {
    balance: result, imported, warnings,
    checks: { eqNm1: Math.abs(sd1-sc1)<1, eqMvt: Math.abs(md-mc)<1, eqN: Math.abs(sdn-scn)<1,
      total_sd1: sd1, total_sc1: sc1, total_md: md, total_mc: mc, total_sdn: sdn, total_scn: scn },
  }
}

const TH = ({ children, color }) => (
  <th style={{ padding: '9px 10px', fontSize: 10.5, fontWeight: 700, color: color || '#fff', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'right', whiteSpace: 'nowrap' }}>
    {children}
  </th>
)

export default function BalanceModule({ data, onSave }) {
  const [search, setSearch]               = useState('')
  const [bal, setBal]                     = useState(data.balance)
  const [showImport, setShowImport]       = useState(false)
  const [preview, setPreview]             = useState(null)
  const [importError, setImportError]     = useState(null)
  const [importSuccess, setImportSuccess] = useState(null)
  const fileRef = useRef(null)

  const upd = (num, field, val) =>
    setBal(prev => ({ ...prev, [num]: { ...(prev[num] || {}), [field]: val } }))

  const filtered = useMemo(() => {
    if (!search) return BALANCE_ACCOUNTS
    const q = search.toLowerCase()
    return BALANCE_ACCOUNTS.filter(a => a.num.includes(q) || a.lib.toLowerCase().includes(q))
  }, [search])

  const { totals, eqNm1, eqMvt, eqN } = useMemo(() => {
    let sd1 = 0, sc1 = 0, md = 0, mc = 0, sdn = 0, scn = 0
    BALANCE_ACCOUNTS.forEach(a => {
      const e = bal[a.num] || {}
      sd1 += p(e.sd_nm1); sc1 += p(e.sc_nm1)
      md  += p(e.mvt_d);  mc  += p(e.mvt_c)
      const { sd, sc } = computeSoldeN(bal, a.num)
      sdn += sd; scn += sc
    })
    return {
      totals: { sd1, sc1, md, mc, sdn, scn },
      eqNm1: Math.abs(sd1-sc1)<1, eqMvt: Math.abs(md-mc)<1, eqN: Math.abs(sdn-scn)<1,
    }
  }, [bal])

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null); setPreview(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const rows = parseCSV(ev.target.result)
        if (!rows.length) throw new Error('Aucune ligne de donn\u00e9es trouv\u00e9e.')
        setPreview(mapToBalance(rows, bal))
      } catch (err) { setImportError(err.message) }
    }
    reader.onerror = () => setImportError('Impossible de lire le fichier.')
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  const confirmImport = () => {
    if (!preview) return
    setBal(preview.balance)
    onSave({ ...data, balance: preview.balance })
    setImportSuccess('\u2713 ' + preview.imported.length + ' compte(s) import\u00e9(s) avec succ\u00e8s.')
    setPreview(null); setShowImport(false)
    setTimeout(() => setImportSuccess(null), 5000)
  }

  const cancelImport = () => { setPreview(null); setImportError(null); setShowImport(false) }

  return (
    <div>
      <SectionHead title="Balance G\u00e9n\u00e9rale des Comptes" sub={BALANCE_ACCOUNTS.length + ' comptes \u2014 Exercice N'} />

      {importSuccess && (
        <div style={{ marginBottom:14, padding:'10px 16px', background:'#dcfce7', borderRadius:8, border:'1px solid #bbf7d0', fontSize:13, fontWeight:600, color:'#15803d' }}>
          {importSuccess}
        </div>
      )}

      {showImport && (
        <div style={{ marginBottom:16, padding:'18px 20px', background:'#fffdf5', borderRadius:12, border:'1.5px solid #c9a84c' }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#1e3a5f', marginBottom:4 }}>Import de balance \u2014 CSV</div>
              <div style={{ fontSize:12, color:'#64748b', lineHeight:1.7 }}>
                Format attendu : <strong>6 colonnes</strong>, s\u00e9parateur <code>;</code> ou <code>,</code><br/>
                <code style={{ background:'#f1f5f9', padding:'2px 7px', borderRadius:4, fontSize:11 }}>
                  N\u00b0 Compte ; Intitul\u00e9 ; SD N-1 ; SC N-1 ; Mvt D\u00e9bit ; Mvt Cr\u00e9dit
                </code><br/>
                <span style={{ color:'#7c3aed', fontSize:11 }}>
                  \u2192 SD N et SC N sont calcul\u00e9s automatiquement \u2014 ne pas les inclure dans le fichier.
                </span>
              </div>
            </div>
            <button onClick={cancelImport} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'#94a3b8' }}>&#x2715;</button>
          </div>

          <div style={{ display:'flex', gap:10, marginBottom: preview || importError ? 14 : 0 }}>
            <GhostBtn onClick={downloadTemplate}>\u2193 T\u00e9l\u00e9charger le template CSV</GhostBtn>
            <button onClick={() => fileRef.current?.click()}
              style={{ padding:'7px 18px', background:'#1e3a5f', color:'#fff', border:'none', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
              \u2191 Choisir un fichier CSV
            </button>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display:'none' }} onChange={handleFile} />
          </div>

          {importError && (
            <div style={{ padding:'10px 14px', background:'#fee2e2', borderRadius:8, border:'1px solid #fca5a5', fontSize:12, color:'#dc2626', fontWeight:600 }}>
              &#x2715; {importError}
            </div>
          )}

          {preview && (
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'#1e3a5f', marginBottom:8 }}>Contr\u00f4les d'\u00e9quilibre sur le fichier import\u00e9 :</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
                <Pill ok={preview.checks.eqNm1} label={'Équilibre N-1' + (preview.checks.eqNm1 ? '' : ' (\u00e9cart\u00a0: ' + fmt(Math.abs(preview.checks.total_sd1 - preview.checks.total_sc1)) + ')')} />
                <Pill ok={preview.checks.eqMvt} label={'Équilibre Mvt' + (preview.checks.eqMvt ? '' : ' (\u00e9cart\u00a0: ' + fmt(Math.abs(preview.checks.total_md - preview.checks.total_mc)) + ')')} />
                <Pill ok={preview.checks.eqN}   label={'Équilibre N'   + (preview.checks.eqN   ? '' : ' (\u00e9cart\u00a0: ' + fmt(Math.abs(preview.checks.total_sdn - preview.checks.total_scn)) + ')')} />
                <span style={{ padding:'4px 12px', borderRadius:99, background:'#dbeafe', fontSize:11, fontWeight:700, color:'#1d4ed8' }}>
                  {preview.imported.length} compte(s) renseign\u00e9(s)
                </span>
              </div>

              {preview.warnings.length > 0 && (
                <div style={{ marginBottom:12, padding:'10px 14px', background:'#fef3c7', borderRadius:8, border:'1px solid #fde68a' }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#b45309', marginBottom:5 }}>
                    &#x26A0; {preview.warnings.length} avertissement(s) :
                  </div>
                  <ul style={{ margin:0, padding:'0 0 0 16px', fontSize:11, color:'#92400e', lineHeight:1.8 }}>
                    {preview.warnings.slice(0,8).map((w,i) => <li key={i}>{w}</li>)}
                    {preview.warnings.length > 8 && <li>... et {preview.warnings.length - 8} autre(s)</li>}
                  </ul>
                </div>
              )}

              <div style={{ marginBottom:14, fontSize:12, fontWeight:700, color:'#1e3a5f' }}>
                Aper\u00e7u (5 premiers comptes import\u00e9s) :
              </div>
              <div style={{ overflowX:'auto', borderRadius:8, border:'1px solid #e2e8f0', marginBottom:14 }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                  <thead>
                    <tr style={{ background:'#1e3a5f' }}>
                      {['N\u00b0 Compte','Intitul\u00e9','SD N-1','SC N-1','Mvt D\u00e9bit','Mvt Cr\u00e9dit','SD N \u2605','SC N \u2605'].map((h,i) => (
                        <th key={h} style={{ padding:'7px 10px', color: i>=6 ? '#fde68a' : '#fff', fontSize:10, fontWeight:700, textAlign: i>=2 ? 'right' : 'left', textTransform:'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.imported.slice(0,5).map(num => {
                      const acct = BALANCE_ACCOUNTS.find(a => a.num === num)
                      const e = preview.balance[num] || {}
                      const { sd, sc } = computeSoldeN(preview.balance, num)
                      return (
                        <tr key={num} style={{ borderBottom:'1px solid #f1f5f9' }}>
                          <td style={{ padding:'5px 10px', fontFamily:'var(--font-mono)', fontWeight:600, color:'#1e3a5f', fontSize:11 }}>{num}</td>
                          <td style={{ padding:'5px 10px', color:'#334155', maxWidth:170, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{acct?.lib || '\u2014'}</td>
                          {[e.sd_nm1, e.sc_nm1, e.mvt_d, e.mvt_c].map((v,i) => (
                            <td key={i} style={{ padding:'5px 10px', textAlign:'right', fontFamily:'var(--font-mono)', color:'#334155' }}>{fmt(p(v)) || '\u2014'}</td>
                          ))}
                          <td style={{ padding:'5px 10px', textAlign:'right', fontFamily:'var(--font-mono)', fontWeight:700, color: sd>0 ? '#1e40af' : '#94a3b8' }}>{fmt(sd) || '\u2014'}</td>
                          <td style={{ padding:'5px 10px', textAlign:'right', fontFamily:'var(--font-mono)', fontWeight:700, color: sc>0 ? '#7c3aed' : '#94a3b8' }}>{fmt(sc) || '\u2014'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize:10, color:'#94a3b8', marginBottom:14 }}>
                \u2605 SD N = max(0, SD N\u22121 + Mvt D\u00e9bit \u2212 SC N\u22121 \u2212 Mvt Cr\u00e9dit) \u00a0\u00b7\u00a0 SC N = max(0, SC N\u22121 + Mvt Cr\u00e9dit \u2212 SD N\u22121 \u2212 Mvt D\u00e9bit)
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <GhostBtn onClick={cancelImport}>Annuler</GhostBtn>
                <button onClick={confirmImport}
                  style={{ padding:'8px 22px', background:'#16a34a', color:'#fff', border:'none', borderRadius:7, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
                  \u2713 Confirmer l\u2019import
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display:'flex', gap:10, marginBottom:12, alignItems:'center' }}>
        <input placeholder="Rechercher un compte (num\u00e9ro ou libell\u00e9)\u2026" value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex:1, padding:'8px 13px', borderRadius:8, border:'1.5px solid #e2e8f0', fontSize:13, fontFamily:'inherit', outline:'none' }}/>
        {!showImport && (
          <GhostBtn onClick={() => { setShowImport(true); setPreview(null); setImportError(null) }}>
            \u2191 Importer CSV
          </GhostBtn>
        )}
        <SaveBtn onClick={() => onSave({ ...data, balance: bal })} />
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
        <Pill ok={eqNm1} label="Équilibre N-1" />
        <Pill ok={eqMvt} label="Équilibre Mvt" />
        <Pill ok={eqN}   label="Équilibre N" />
        <span style={{ padding:'4px 12px', borderRadius:99, background:'#dbeafe', fontSize:11, fontWeight:700, color:'#1d4ed8' }}>
          {filtered.length} compte(s) affich\u00e9(s)
        </span>
      </div>

      <Card noPad>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'var(--color-primary)' }}>
                <th style={{ padding:'9px 14px', fontSize:10.5, fontWeight:700, color:'#fff', textAlign:'left', whiteSpace:'nowrap' }}>N\u00b0 Cpte</th>
                <th style={{ padding:'9px 10px', fontSize:10.5, fontWeight:700, color:'#fff', textAlign:'left' }}>Intitul\u00e9</th>
                <TH color="#bfdbfe">SD N-1</TH>
                <TH color="#bfdbfe">SC N-1</TH>
                <TH color="#bbf7d0">Mvt D\u00e9bit</TH>
                <TH color="#bbf7d0">Mvt Cr\u00e9dit</TH>
                <TH color="#fde68a">SD N \u2605</TH>
                <TH color="#fde68a">SC N \u2605</TH>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => {
                const e = bal[a.num] || {}
                const { sd, sc } = computeSoldeN(bal, a.num)
                return (
                  <tr key={a.num} style={{ background: i%2===0 ? '#fff' : '#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                    <td style={{ padding:'3px 14px', fontFamily:'var(--font-mono)', fontWeight:600, color:'var(--color-primary-mid)', fontSize:11 }}>{a.num}</td>
                    <td style={{ padding:'3px 10px', color:'#334155', fontSize:12 }}>{a.lib}</td>
                    {['sd_nm1','sc_nm1','mvt_d','mvt_c'].map(f => (
                      <td key={f} style={{ padding:'2px 6px', textAlign:'right' }}>
                        <NumCell value={e[f]} onChange={v => upd(a.num, f, v)} />
                      </td>
                    ))}
                    <td style={{ padding:'3px 10px', textAlign:'right', fontFamily:'var(--font-mono)', fontWeight: sd>0 ? 700 : 400, color: sd>0 ? '#1e40af' : '#94a3b8', fontSize:12 }}>{fmt(sd)}</td>
                    <td style={{ padding:'3px 10px', textAlign:'right', fontFamily:'var(--font-mono)', fontWeight: sc>0 ? 700 : 400, color: sc>0 ? '#7c3aed' : '#94a3b8', fontSize:12 }}>{fmt(sc)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background:'var(--color-primary)', fontWeight:700 }}>
                <td colSpan={2} style={{ padding:'9px 14px', fontSize:12, color:'#fff' }}>TOTAUX</td>
                {[{v:totals.sd1,c:'#bfdbfe'},{v:totals.sc1,c:'#bfdbfe'},{v:totals.md,c:'#bbf7d0'},{v:totals.mc,c:'#bbf7d0'},{v:totals.sdn,c:'#fde68a'},{v:totals.scn,c:'#fde68a'}].map((t,i) => (
                  <td key={i} style={{ padding:'9px 10px', textAlign:'right', fontFamily:'var(--font-mono)', color:t.c, fontSize:12 }}>{fmt(t.v)}</td>
                ))}
              </tr>
              <tr style={{ background:'var(--color-primary-light)' }}>
                <td colSpan={6} style={{ padding:'5px 14px', fontSize:10, color:'rgba(255,255,255,0.35)', fontStyle:'italic' }}>
                  \u2605 SD N et SC N calcul\u00e9s automatiquement depuis les 4 colonnes saisies
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  )
}
