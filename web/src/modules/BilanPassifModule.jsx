import { useState } from 'react'
import { SectionHead, Card, SaveBtn, NumCell } from '../components/UI.jsx'
import { BILAN_PASSIF_ROWS } from '../data/plan_comptable.js'
import { fmtSigned, p } from '../utils/format.js'

const SECTIONS = [
  { id: 'cp', label: 'CAPITAUX PROPRES ET RESSOURCES ASSIMILÉES', bg: '#dbeafe', color: '#1e40af' },
  { id: 'df', label: 'DETTES FINANCIÈRES ET RESSOURCES ASSIMILÉES', bg: '#f0fdf4', color: '#16a34a' },
  { id: 'pc', label: 'PASSIF CIRCULANT', bg: '#fef3c7', color: '#b45309' },
  { id: 'tp', label: 'TRÉSORERIE — PASSIF', bg: '#fce7f3', color: '#9d174d' },
]

export default function BilanPassifModule({ data, onSave }) {
  const [rows, setRows] = useState(data.bilan_passif)
  const upd = (ref, f, v) => setRows(prev => ({ ...prev, [ref]: { ...(prev[ref] || {}), [f]: v } }))
  const sum = (refs, f) => refs.reduce((a, r) => a + p(rows[r]?.[f]), 0)

  const refsOf = sec => BILAN_PASSIF_ROWS.filter(r => r.section === sec).map(r => r.ref)
  const tcp = { n: sum(refsOf('cp'), 'n'), nm1: sum(refsOf('cp'), 'nm1') }
  const tdf = { n: sum(refsOf('df'), 'n'), nm1: sum(refsOf('df'), 'nm1') }
  const trs = { n: tcp.n + tdf.n, nm1: tcp.nm1 + tdf.nm1 }
  const tpc = { n: sum(refsOf('pc'), 'n'), nm1: sum(refsOf('pc'), 'nm1') }
  const ttp = { n: sum(refsOf('tp'), 'n'), nm1: sum(refsOf('tp'), 'nm1') }
  const tecart = { n: p(rows['DV']?.n), nm1: p(rows['DV']?.nm1) }
  const tgen = { n: trs.n + tpc.n + ttp.n + tecart.n, nm1: trs.nm1 + tpc.nm1 + ttp.nm1 + tecart.nm1 }

  const DataRow = ({ row }) => (
    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
      <td style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700, color: '#7c3aed', fontFamily: 'var(--font-mono)' }}>{row.ref}</td>
      <td style={{ padding: '3px 10px', fontSize: 12, color: '#334155' }}>{row.lib}</td>
      <td style={{ padding: '3px 8px', textAlign: 'right', fontSize: 11, color: '#94a3b8' }}>{row.note}</td>
      <td style={{ padding: '2px 6px', textAlign: 'right' }}><NumCell value={rows[row.ref]?.n}   onChange={v => upd(row.ref, 'n',   v)} /></td>
      <td style={{ padding: '2px 6px', textAlign: 'right' }}><NumCell value={rows[row.ref]?.nm1} onChange={v => upd(row.ref, 'nm1', v)} /></td>
    </tr>
  )

  const SubTotalRow = ({ label, n, nm1, hi, sub }) => (
    <tr style={{ background: hi ? 'var(--color-primary)' : sub ? '#e8eef5' : '#f0f4f8', fontWeight: 700 }}>
      <td colSpan={3} style={{ padding: '8px 14px', fontSize: sub ? 12 : 13, color: hi ? '#fff' : 'var(--color-primary-mid)' }}>{label}</td>
      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: hi ? '#bbf7d0' : '#1e40af', fontSize: 12 }}>{fmtSigned(n)}</td>
      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: hi ? '#bfdbfe' : '#64748b', fontSize: 12 }}>{fmtSigned(nm1)}</td>
    </tr>
  )

  return (
    <div>
      <SectionHead title="Bilan — Passif" sub="Système normal SYSCOHADA révisé" />
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <SaveBtn onClick={() => onSave({ ...data, bilan_passif: rows })} />
      </div>
      <Card noPad>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--color-primary)' }}>
                <th style={{ padding: '9px 8px', color: '#fff', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', width: 42, textAlign: 'left' }}>Réf</th>
                <th style={{ padding: '9px 10px', color: '#fff', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', textAlign: 'left' }}>PASSIF</th>
                <th style={{ padding: '9px 8px', color: '#bfdbfe', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', textAlign: 'right', width: 50 }}>Note</th>
                <th style={{ padding: '9px 10px', color: '#bbf7d0', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', textAlign: 'right', width: 155 }}>Exercice N</th>
                <th style={{ padding: '9px 10px', color: '#bfdbfe', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', textAlign: 'right', width: 155 }}>Exercice N-1</th>
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map(sec => (
                <>
                  <tr key={sec.id} style={{ background: sec.bg }}>
                    <td colSpan={5} style={{ padding: '6px 14px', fontWeight: 700, color: sec.color, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{sec.label}</td>
                  </tr>
                  {BILAN_PASSIF_ROWS.filter(r => r.section === sec.id).map(row => <DataRow key={row.ref} row={row} />)}
                  {sec.id === 'cp' && <SubTotalRow label="CP — Total capitaux propres" n={tcp.n} nm1={tcp.nm1} sub />}
                  {sec.id === 'df' && <>
                    <SubTotalRow label="DD — Total dettes financières" n={tdf.n} nm1={tdf.nm1} sub />
                    <SubTotalRow label="DF — Total ressources stables (CP + DF)" n={trs.n} nm1={trs.nm1} />
                  </>}
                  {sec.id === 'pc' && <SubTotalRow label="DP — Total passif circulant" n={tpc.n} nm1={tpc.nm1} sub />}
                  {sec.id === 'tp' && <SubTotalRow label="DT — Total trésorerie passif" n={ttp.n} nm1={ttp.nm1} sub />}
                </>
              ))}
              <DataRow row={BILAN_PASSIF_ROWS.find(r => r.ref === 'DV')} />
              <SubTotalRow label="DZ — TOTAL GÉNÉRAL" n={tgen.n} nm1={tgen.nm1} hi />
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
