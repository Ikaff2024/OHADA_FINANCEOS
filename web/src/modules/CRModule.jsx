import { useState } from 'react'
import { SectionHead, Card, KpiCard, SaveBtn, NumCell } from '../components/UI.jsx'
import { CR_ROWS } from '../data/plan_comptable.js'
import { computeCR } from '../utils/compute.js'
import { fmtSigned, p } from '../utils/format.js'

export default function CRModule({ data, onSave }) {
  const [cr, setCr] = useState(data.cr)
  const upd = (ref, f, v) => setCr(prev => ({ ...prev, [ref]: { ...(prev[ref] || {}), [f]: v } }))

  const { xA, xB, xC, xD, xE, xF, xG, xH, xI } = computeCR(cr)
  const computed = { XA: xA, XB: xB, XC: xC, XD: xD, XE: xE, XF: xF, XG: xG, XH: xH, XI: xI }

  const kpis = [
    { label: "Chiffre d'affaires", value: fmtSigned(xB), color: '#1e40af', bg: '#dbeafe' },
    { label: 'Valeur Ajoutée',     value: fmtSigned(xC), color: '#065f46', bg: '#d1fae5' },
    { label: 'EBE',                value: fmtSigned(xD), color: '#92400e', bg: '#fef3c7' },
    { label: "Résultat d'exploitation", value: fmtSigned(xE), color: '#6d28d9', bg: '#ede9fe' },
    { label: 'Résultat Net',       value: fmtSigned(xI), color: xI >= 0 ? '#16a34a' : '#dc2626', bg: xI >= 0 ? '#dcfce7' : '#fee2e2' },
  ]

  return (
    <div>
      <SectionHead title="Compte de Résultat" sub="Soldes intermédiaires de gestion — SYSCOHADA" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 18 }}>
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <SaveBtn onClick={() => onSave({ ...data, cr })} />
      </div>

      <Card noPad>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--color-primary)' }}>
                <th style={{ padding: '9px 8px', color: '#fff', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', width: 42, textAlign: 'left' }}>Réf</th>
                <th style={{ padding: '9px 10px', color: '#fff', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', textAlign: 'left' }}>LIBELLÉS</th>
                <th style={{ padding: '9px 8px', color: '#bfdbfe', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', textAlign: 'right', width: 50 }}>Note</th>
                <th style={{ padding: '9px 10px', color: '#bbf7d0', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', textAlign: 'right', width: 155 }}>Exercice N</th>
                <th style={{ padding: '9px 10px', color: '#bfdbfe', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', textAlign: 'right', width: 155 }}>Exercice N-1</th>
              </tr>
            </thead>
            <tbody>
              {CR_ROWS.map((row, i) => {
                if (row.total) {
                  const val = computed[row.ref]
                  return (
                    <tr key={row.ref} style={{ background: row.highlight ? 'var(--color-primary)' : '#e8eef5', fontWeight: 700 }}>
                      <td style={{ padding: '7px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, color: row.highlight ? '#fde68a' : 'var(--color-primary-mid)' }}>{row.ref}</td>
                      <td style={{ padding: '7px 10px', fontSize: 13, color: row.highlight ? '#fff' : 'var(--color-primary-mid)' }}>{row.lib}</td>
                      <td />
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: row.highlight ? (val >= 0 ? '#bbf7d0' : '#fca5a5') : (val >= 0 ? '#1e40af' : '#dc2626') }}>
                        {fmtSigned(val)}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#94a3b8', fontSize: 12 }}>
                        {fmtSigned(p(cr[row.ref]?.nm1))}
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={row.ref} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700, color: '#7c3aed', fontFamily: 'var(--font-mono)' }}>{row.ref}</td>
                    <td style={{ padding: '3px 10px', fontSize: 12, color: '#334155' }}>{row.lib}</td>
                    <td style={{ padding: '3px 8px', textAlign: 'right', fontSize: 11, color: '#94a3b8' }}>{row.note}</td>
                    <td style={{ padding: '2px 6px', textAlign: 'right' }}><NumCell value={cr[row.ref]?.n}   onChange={v => upd(row.ref, 'n',   v)} /></td>
                    <td style={{ padding: '2px 6px', textAlign: 'right' }}><NumCell value={cr[row.ref]?.nm1} onChange={v => upd(row.ref, 'nm1', v)} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
