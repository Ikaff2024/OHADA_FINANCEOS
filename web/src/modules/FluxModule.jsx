import { useState } from 'react'
import { SectionHead, Card, KpiCard, SaveBtn, NumCell } from '../components/UI.jsx'
import { computeCAFG } from '../utils/compute.js'
import { fmtSigned, p } from '../utils/format.js'

const FLUX_SECTIONS = [
  {
    id: 'oper', label: "FLUX DES ACTIVITÉS OPÉRATIONNELLES", bg: '#f0fdf4', color: '#15803d',
    rows: [
      { ref: 'FB', label: "− Variation de l'Actif circulant H.A.O.", field: 'FB' },
      { ref: 'FC', label: '− Variation des stocks',                   field: 'FC' },
      { ref: 'FD', label: '− Variation des créances et emplois',      field: 'FD' },
      { ref: 'FE', label: '+ Variation du passif circulant',          field: 'FE' },
    ],
    total: 'ZB', totalLabel: 'ZB — Flux des activités opérationnelles (B)',
  },
  {
    id: 'invest', label: "FLUX DES ACTIVITÉS D'INVESTISSEMENTS", bg: '#fef3c7', color: '#b45309',
    rows: [
      { ref: 'FF', label: '− Acquisitions immo. incorporelles',           field: 'FF' },
      { ref: 'FG', label: '− Acquisitions immo. corporelles',             field: 'FG' },
      { ref: 'FH', label: '− Acquisitions immo. financières',             field: 'FH' },
      { ref: 'FI', label: '+ Cessions immo. incorporelles et corporelles', field: 'FI' },
      { ref: 'FJ', label: '+ Cessions immo. financières',                 field: 'FJ' },
    ],
    total: 'ZC', totalLabel: "ZC — Flux des activités d'investissements (C)",
  },
  {
    id: 'cp', label: 'FLUX DE FINANCEMENT — CAPITAUX PROPRES', bg: '#ede9fe', color: '#6d28d9',
    rows: [
      { ref: 'FK', label: '+ Augmentations de capital', field: 'FK' },
      { ref: 'FL', label: "+ Subventions d'investissement reçues", field: 'FL' },
      { ref: 'FM', label: '− Prélèvements sur le capital', field: 'FM' },
      { ref: 'FN', label: '− Dividendes versés', field: 'FN' },
    ],
    total: 'ZD', totalLabel: 'ZD — Flux des capitaux propres (D)',
  },
  {
    id: 'ce', label: 'FLUX DE FINANCEMENT — CAPITAUX ÉTRANGERS', bg: '#fce7f3', color: '#9d174d',
    rows: [
      { ref: 'FO', label: '+ Emprunts',                          field: 'FO' },
      { ref: 'FP', label: '+ Autres dettes financières',         field: 'FP' },
      { ref: 'FQ', label: '− Remboursements d\'emprunts',        field: 'FQ' },
    ],
    total: 'ZE', totalLabel: 'ZE — Flux des capitaux étrangers (E)',
  },
]

export default function FluxModule({ data, onSave }) {
  const [fl, setFl] = useState(data.flux)
  const set = (k, v) => setFl(prev => ({ ...prev, [k]: v }))

  const cafg = computeCAFG(data.tafire, data.cr)
  const ZA = p(fl.ZA)
  const ZB = cafg + p(fl.FB) + p(fl.FC) + p(fl.FD) + p(fl.FE)
  const ZC = p(fl.FF) + p(fl.FG) + p(fl.FH) + p(fl.FI) + p(fl.FJ)
  const ZD = p(fl.FK) + p(fl.FL) + p(fl.FM) + p(fl.FN)
  const ZE = p(fl.FO) + p(fl.FP) + p(fl.FQ)
  const ZF = ZD + ZE
  const ZG = ZB + ZC + ZF
  const ZH = ZA + ZG
  const totals = { ZB, ZC, ZD, ZE, ZF, ZG, ZH }

  const kpis = [
    { label: 'Tréso début (ZA)',      value: fmtSigned(ZA), color: '#334155', bg: '#f0f4f8' },
    { label: 'Flux opérationnels (ZB)', value: fmtSigned(ZB), color: ZB >= 0 ? '#065f46' : '#dc2626', bg: ZB >= 0 ? '#d1fae5' : '#fee2e2' },
    { label: "Flux investissements (ZC)", value: fmtSigned(ZC), color: ZC >= 0 ? '#065f46' : '#dc2626', bg: ZC >= 0 ? '#d1fae5' : '#fee2e2' },
    { label: 'Tréso fin (ZH)',        value: fmtSigned(ZH), color: '#1e40af', bg: '#dbeafe' },
  ]

  const thS = { padding: '9px 10px', fontSize: 10.5, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'right' }

  const SubtotalRow = ({ label, val, hi }) => (
    <tr style={{ background: hi ? 'var(--color-primary)' : '#e8eef5', fontWeight: 700 }}>
      <td colSpan={2} style={{ padding: '8px 14px', fontSize: 12, color: hi ? '#fff' : 'var(--color-primary-mid)' }}>{label}</td>
      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: hi ? '#bbf7d0' : (val >= 0 ? '#1e40af' : '#dc2626'), fontSize: 12 }}>{fmtSigned(val)}</td>
      <td />
    </tr>
  )

  return (
    <div>
      <SectionHead title="Tableau des Flux de Trésorerie" sub="Opérationnel · Investissement · Financement" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <SaveBtn onClick={() => onSave({ ...data, flux: fl })} />
      </div>

      <Card noPad>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--color-primary)' }}>
                <th style={{ ...thS, textAlign: 'left', width: 45 }}>Réf</th>
                <th style={{ ...thS, textAlign: 'left' }}>LIBELLÉS</th>
                <th style={{ ...thS, color: '#bbf7d0', width: 155 }}>Exercice N</th>
                <th style={{ ...thS, color: '#bfdbfe', width: 155 }}>Exercice N-1</th>
              </tr>
            </thead>
            <tbody>
              {/* ZA — tréso début */}
              <tr style={{ background: '#e8eef5', fontWeight: 700 }}>
                <td style={{ padding: '7px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-primary-mid)' }}>ZA</td>
                <td style={{ padding: '7px 10px', fontSize: 13, color: 'var(--color-primary-mid)' }}>TRÉSORERIE NETTE AU 1er JANVIER (A)</td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}><NumCell value={fl.ZA} onChange={v => set('ZA', v)} /></td>
                <td style={{ padding: '5px 6px', textAlign: 'right' }}><NumCell value={fl.ZA_nm1} onChange={v => set('ZA_nm1', v)} /></td>
              </tr>

              {FLUX_SECTIONS.map(sec => {
                const total = totals[sec.total]
                const isCafgSection = sec.id === 'oper'
                return (
                  <>
                    <tr key={sec.id} style={{ background: sec.bg }}>
                      <td colSpan={4} style={{ padding: '6px 14px', fontWeight: 700, color: sec.color, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{sec.label}</td>
                    </tr>

                    {/* CAFG auto-injecté dans la section opérationnelle */}
                    {isCafgSection && (
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700, color: '#7c3aed', fontFamily: 'var(--font-mono)' }}>FA</td>
                        <td style={{ padding: '3px 10px', fontSize: 12, color: '#334155', fontWeight: 600 }}>CAFG (calculé depuis TAFIRE)</td>
                        <td style={{ padding: '3px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#16a34a', fontSize: 12 }}>{fmtSigned(cafg)}</td>
                        <td />
                      </tr>
                    )}

                    {sec.rows.map(row => (
                      <tr key={row.ref} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700, color: '#7c3aed', fontFamily: 'var(--font-mono)' }}>{row.ref}</td>
                        <td style={{ padding: '3px 10px', fontSize: 12, color: '#334155' }}>{row.label}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'right' }}><NumCell value={fl[row.field]} onChange={v => set(row.field, v)} /></td>
                        <td />
                      </tr>
                    ))}
                    <SubtotalRow label={sec.totalLabel} val={total} />

                    {/* Sous-total ZF après ZE */}
                    {sec.id === 'ce' && <SubtotalRow label="ZF — Flux des activités de financement (F = D + E)" val={ZF} />}
                  </>
                )
              })}

              {/* ZG variation */}
              <tr style={{ background: '#e8eef5', fontWeight: 700 }}>
                <td style={{ padding: '7px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-primary-mid)' }}>ZG</td>
                <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--color-primary-mid)' }}>VARIATION DE LA TRÉSORERIE NETTE (G = B + C + F)</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: ZG >= 0 ? '#1e40af' : '#dc2626', fontSize: 12 }}>{fmtSigned(ZG)}</td>
                <td />
              </tr>

              {/* ZH tréso fin — highlight gold */}
              <tr style={{ background: 'var(--color-primary)', fontWeight: 700 }}>
                <td style={{ padding: '9px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-accent-light)' }}>ZH</td>
                <td style={{ padding: '9px 10px', fontSize: 13, color: '#fff' }}>TRÉSORERIE NETTE AU 31 DÉCEMBRE (H = G + A)</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-accent-light)', fontSize: 14 }}>{fmtSigned(ZH)}</td>
                <td />
              </tr>

              {/* Contrôle */}
              <tr style={{ background: 'var(--color-primary-mid)' }}>
                <td colSpan={2} style={{ padding: '5px 14px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Contrôle : Écart ZH − ZA − ZG (doit être = 0)</td>
                <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: Math.abs(ZH - ZA - ZG) < 1 ? '#bbf7d0' : '#fca5a5' }}>
                  {fmtSigned(ZH - ZA - ZG)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
