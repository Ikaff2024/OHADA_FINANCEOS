import { useState } from 'react'
import { SectionHead, Card, CardTitle, Inp, SaveBtn, GhostBtn, NumCell } from '../components/UI.jsx'
import { computeCR, computeTotalActifNet, computeTotalPassif, computeCP } from '../utils/compute.js'
import { fmtSigned, fmtPct, p } from '../utils/format.js'

const TABS = [
  { id: 'n01',  label: 'N01 — Dettes garanties' },
  { id: 'n03a', label: 'N03A — Immobilisations' },
  { id: 'n27b', label: 'N27B — Effectifs' },
  { id: 'n28',  label: 'N28 — Provisions' },
  { id: 'n34',  label: 'N34 — Indicateurs' },
]

export default function NotesModule({ data, onSave }) {
  const [tab, setTab]     = useState('n01')
  const [notes, setNotes] = useState(data.notes)
  const upd = (key, val) => setNotes(prev => ({ ...prev, [key]: val }))

  // Ratios N34
  const { xB, xC, xD, xE, xI } = computeCR(data.cr)
  const totalActif = computeTotalActifNet(data.bilan_actif)
  const totalPassif = computeTotalPassif(data.bilan_passif)
  const cp = computeCP(data.bilan_passif)
  const tres = ['BK','BQ','BR'].reduce((a,r) => { const row = data.bilan_actif[r]||{}; return a + p(row.brut) - p(row.amort) }, 0)
  const tresDette = ['DQ','DR'].reduce((a,r) => a + p(data.bilan_passif[r]?.n), 0)

  const ratios = [
    { label: "Taux de valeur ajoutée",           formula: 'VA / CA',            val: fmtPct(xC, xB) },
    { label: "Taux de marge brute (EBE / CA)",   formula: 'EBE / CA',           val: fmtPct(xD, xB) },
    { label: "Taux de profitabilité nette",       formula: 'RN / CA',            val: fmtPct(xI, xB) },
    { label: "Rentabilité des capitaux propres",  formula: 'RN / CP',            val: fmtPct(xI, cp) },
    { label: "Autonomie financière",              formula: 'CP / Total Passif',  val: fmtPct(cp, totalPassif) },
    { label: "Trésorerie nette / Total Bilan",   formula: 'Tréso nette / Bilan', val: fmtPct(tres - tresDette, totalActif) },
    { label: "Chiffre d'affaires",               formula: 'CA',                 val: fmtSigned(xB) + ' FCFA' },
    { label: "Résultat Net",                      formula: 'RN',                 val: fmtSigned(xI) + ' FCFA' },
    { label: "Total Bilan",                       formula: 'Total Actif Net',    val: fmtSigned(totalActif) + ' FCFA' },
    { label: "Capitaux propres",                  formula: 'CP',                 val: fmtSigned(cp) + ' FCFA' },
  ]

  // N01 helpers
  const n01  = notes.n01  || []
  const n03a = notes.n03a || []
  const n28  = notes.n28  || []
  const n27b = notes.n27b || {}

  const thStyle = { padding: '9px 12px', fontSize: 10.5, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'right' }
  const thL = { ...thStyle, textAlign: 'left' }

  return (
    <div>
      <SectionHead title="Notes Annexes" sub="Notes explicatives aux états financiers" />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid', borderColor: tab === t.id ? 'var(--color-primary-mid)' : '#e2e8f0', background: tab === t.id ? 'var(--color-primary-mid)' : '#fff', color: tab === t.id ? '#fff' : '#334155', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* N34 — Ratios auto */}
      {tab === 'n34' && (
        <Card>
          <CardTitle>Note 34 — Indicateurs financiers de synthèse (calculés automatiquement)</CardTitle>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {['Indicateur','Formule','Valeur N'].map((h, i) => (
                  <th key={h} style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: i === 2 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ratios.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 500, color: '#1e293b' }}>{r.label}</td>
                  <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: '#64748b' }}>{r.formula}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#1e40af' }}>{r.val}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* N27B — Effectifs */}
      {tab === 'n27b' && (
        <Card>
          <CardTitle>Note 27B — Effectifs, masse salariale et personnel extérieur</CardTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { label: 'Effectif moyen N',          key: 'effectifs_n' },
              { label: 'Effectif moyen N-1',         key: 'effectifs_nm1' },
              { label: 'Masse salariale N (FCFA)',   key: 'masse_sal_n' },
              { label: 'Masse salariale N-1 (FCFA)', key: 'masse_sal_nm1' },
              { label: 'Personnel extérieur N',      key: 'personnel_ext_n' },
              { label: 'Personnel extérieur N-1',    key: 'personnel_ext_nm1' },
            ].map(f => (
              <Inp key={f.key} label={f.label} value={n27b[f.key] || ''} onChange={v => upd('n27b', { ...n27b, [f.key]: v })} type="number" />
            ))}
          </div>
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <SaveBtn onClick={() => onSave({ ...data, notes })} />
          </div>
        </Card>
      )}

      {/* N01 — Dettes garanties */}
      {tab === 'n01' && (
        <Card noPad>
          <div style={{ padding: '12px 16px', background: 'var(--color-primary)', color: '#fff', fontSize: 12, fontWeight: 700 }}>Note 1 — Dettes garanties par des sûretés réelles</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--color-primary-mid)' }}>
                  <th style={{ ...thL }}>Nature de la dette</th>
                  <th style={{ ...thStyle, width: 140 }}>Montant N</th>
                  <th style={{ ...thStyle, width: 140 }}>Montant N-1</th>
                  <th style={{ ...thL, width: 180 }}>Nature de la sûreté</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {n01.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '4px 10px' }}>
                      <input value={r.nature||''} onChange={e => { const a=[...n01]; a[i]={...a[i],nature:e.target.value}; upd('n01',a) }}
                        style={{ width:'100%', border:'none', background:'transparent', fontSize:12, fontFamily:'inherit', outline:'none', color:'#334155' }} />
                    </td>
                    <td style={{ padding: '2px 6px', textAlign:'right' }}>
                      <NumCell value={r.montant_n} onChange={v => { const a=[...n01]; a[i]={...a[i],montant_n:v}; upd('n01',a) }} />
                    </td>
                    <td style={{ padding: '2px 6px', textAlign:'right' }}>
                      <NumCell value={r.montant_nm1} onChange={v => { const a=[...n01]; a[i]={...a[i],montant_nm1:v}; upd('n01',a) }} />
                    </td>
                    <td style={{ padding: '4px 10px' }}>
                      <input value={r.surete||''} onChange={e => { const a=[...n01]; a[i]={...a[i],surete:e.target.value}; upd('n01',a) }}
                        style={{ width:'100%', border:'none', background:'transparent', fontSize:12, fontFamily:'inherit', outline:'none', color:'#334155' }} />
                    </td>
                    <td style={{ padding:'4px 6px', textAlign:'center' }}>
                      <button onClick={() => upd('n01', n01.filter((_,j)=>j!==i))} style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626', fontSize:14 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding:'12px 16px', display:'flex', gap:10, justifyContent:'flex-end' }}>
            <GhostBtn onClick={() => upd('n01', [...n01, { nature:'', montant_n:'', montant_nm1:'', surete:'' }])}>+ Ligne</GhostBtn>
            <SaveBtn onClick={() => onSave({ ...data, notes })} />
          </div>
        </Card>
      )}

      {/* N03A — Immobilisations */}
      {tab === 'n03a' && (
        <Card noPad>
          <div style={{ padding: '12px 16px', background: 'var(--color-primary)', color: '#fff', fontSize: 12, fontWeight: 700 }}>Note 3A — Tableau des immobilisations (mouvements bruts)</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--color-primary-mid)' }}>
                  <th style={{ ...thL }}>Catégorie</th>
                  <th style={{ ...thStyle, width: 130 }}>Brut début</th>
                  <th style={{ ...thStyle, width: 130 }}>Acquisitions</th>
                  <th style={{ ...thStyle, width: 130 }}>Cessions / Sorties</th>
                  <th style={{ ...thStyle, width: 130 }}>Brut fin</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {n03a.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding:'4px 10px' }}>
                      <input value={r.categorie||''} onChange={e=>{const a=[...n03a];a[i]={...a[i],categorie:e.target.value};upd('n03a',a)}}
                        style={{width:'100%',border:'none',background:'transparent',fontSize:12,fontFamily:'inherit',outline:'none',color:'#334155'}}/>
                    </td>
                    {['debut','acquisitions','cessions'].map(f=>(
                      <td key={f} style={{padding:'2px 6px',textAlign:'right'}}>
                        <NumCell value={r[f]} onChange={v=>{const a=[...n03a];a[i]={...a[i],[f]:v};upd('n03a',a)}}/>
                      </td>
                    ))}
                    <td style={{padding:'3px 10px',textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:600,color:'#1e40af',fontSize:12}}>
                      {fmtSigned(p(r.debut)+p(r.acquisitions)-p(r.cessions))}
                    </td>
                    <td style={{padding:'4px 6px',textAlign:'center'}}>
                      <button onClick={()=>upd('n03a',n03a.filter((_,j)=>j!==i))} style={{background:'none',border:'none',cursor:'pointer',color:'#dc2626',fontSize:14}}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{padding:'12px 16px',display:'flex',gap:10,justifyContent:'flex-end'}}>
            <GhostBtn onClick={()=>upd('n03a',[...n03a,{categorie:'',debut:'',acquisitions:'',cessions:''}])}>+ Ligne</GhostBtn>
            <SaveBtn onClick={()=>onSave({...data,notes})}/>
          </div>
        </Card>
      )}

      {/* N28 — Provisions */}
      {tab === 'n28' && (
        <Card noPad>
          <div style={{padding:'12px 16px',background:'var(--color-primary)',color:'#fff',fontSize:12,fontWeight:700}}>Note 28 — Provisions pour risques et charges</div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{background:'var(--color-primary-mid)'}}>
                  <th style={{...thL}}>Nature de la provision</th>
                  <th style={{...thStyle,width:130}}>Solde début</th>
                  <th style={{...thStyle,width:130}}>Dotations</th>
                  <th style={{...thStyle,width:130}}>Reprises</th>
                  <th style={{...thStyle,width:130}}>Solde fin</th>
                  <th style={{width:40}}></th>
                </tr>
              </thead>
              <tbody>
                {n28.map((r,i)=>(
                  <tr key={i} style={{borderBottom:'1px solid #f1f5f9'}}>
                    <td style={{padding:'4px 10px'}}>
                      <input value={r.nature||''} onChange={e=>{const a=[...n28];a[i]={...a[i],nature:e.target.value};upd('n28',a)}}
                        style={{width:'100%',border:'none',background:'transparent',fontSize:12,fontFamily:'inherit',outline:'none',color:'#334155'}}/>
                    </td>
                    {['debut','dotations','reprises'].map(f=>(
                      <td key={f} style={{padding:'2px 6px',textAlign:'right'}}>
                        <NumCell value={r[f]} onChange={v=>{const a=[...n28];a[i]={...a[i],[f]:v};upd('n28',a)}}/>
                      </td>
                    ))}
                    <td style={{padding:'3px 10px',textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:600,color:'#1e40af',fontSize:12}}>
                      {fmtSigned(p(r.debut)+p(r.dotations)-p(r.reprises))}
                    </td>
                    <td style={{padding:'4px 6px',textAlign:'center'}}>
                      <button onClick={()=>upd('n28',n28.filter((_,j)=>j!==i))} style={{background:'none',border:'none',cursor:'pointer',color:'#dc2626',fontSize:14}}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{padding:'12px 16px',display:'flex',gap:10,justifyContent:'flex-end'}}>
            <GhostBtn onClick={()=>upd('n28',[...n28,{nature:'',debut:'',dotations:'',reprises:''}])}>+ Ligne</GhostBtn>
            <SaveBtn onClick={()=>onSave({...data,notes})}/>
          </div>
        </Card>
      )}
    </div>
  )
}
