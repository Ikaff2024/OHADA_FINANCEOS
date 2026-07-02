import { useState } from 'react'
import { SectionHead, Card, SaveBtn, NumCell } from '../components/UI.jsx'
import { BILAN_ACTIF_ROWS } from '../data/plan_comptable.js'
import { fmt, fmtSigned, p } from '../utils/format.js'

const IMMO_SECTIONS = [
  { ids: ['immo_inc'],  label: 'Immobilisations incorporelles' },
  { ids: ['immo_corp'], label: 'Immobilisations corporelles' },
  { ids: ['immo_fin'],  label: 'Immobilisations financières' },
]
const SECTION_COLORS = {
  immo: { bg: '#dbeafe', color: '#1e40af' },
  circ: { bg: '#dcfce7', color: '#16a34a' },
  tres: { bg: '#fef9c3', color: '#a16207' },
}

const TH = ({ children, color, width }) => (
  <th style={{ padding: '9px 12px', fontSize: 10.5, fontWeight: 700, color: color || '#fff', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'right', width }}>
    {children}
  </th>
)

export default function BilanActifModule({ data, onSave }) {
  const [rows, setRows] = useState(data.bilan_actif)
  const upd = (ref, f, v) => setRows(prev => ({ ...prev, [ref]: { ...(prev[ref] || {}), [f]: v } }))
  const net = ref => p(rows[ref]?.brut) - p(rows[ref]?.amort)

  const sumSecs = (secs, field) => BILAN_ACTIF_ROWS
    .filter(r => secs.includes(r.section))
    .reduce((a, r) => a + (field === 'net' ? net(r.ref) : p(rows[r.ref]?.[field])), 0)

  const taz = {
    brut: sumSecs(['immo_inc','immo_corp','immo_fin'], 'brut'),
    amort: sumSecs(['immo_inc','immo_corp','immo_fin'], 'amort'),
    net: sumSecs(['immo_inc','immo_corp','immo_fin'], 'net'),
    nm1: sumSecs(['immo_inc','immo_corp','immo_fin'], 'net_nm1'),
  }
  const tcirc = {
    brut: sumSecs(['circ'], 'brut'), amort: sumSecs(['circ'], 'amort'),
    net: sumSecs(['circ'], 'net'),   nm1: sumSecs(['circ'], 'net_nm1'),
  }
  const ttres = { brut: 0, amort: 0, net: sumSecs(['tres'], 'net'), nm1: sumSecs(['tres'], 'net_nm1') }
  const ecart_net = net('BT')
  const ecart_nm1 = p(rows['BT']?.net_nm1)
  const tgen = { net: taz.net + tcirc.net + ttres.net + ecart_net, nm1: taz.nm1 + tcirc.nm1 + ttres.nm1 + ecart_nm1 }

  const DataRow = ({ row }) => (
    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
      <td style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700, color: '#7c3aed', fontFamily: 'var(--font-mono)' }}>{row.ref}</td>
      <td style={{ padding: '3px 10px', fontSize: 12, color: '#334155' }}>{row.lib}</td>
      <td style={{ padding: '3px 8px', textAlign: 'right', fontSize: 11, color: '#94a3b8' }}>{row.note}</td>
      <td style={{ padding: '2px 6px', textAlign: 'right' }}><NumCell value={rows[row.ref]?.brut} onChange={v => upd(row.ref, 'brut', v)} /></td>
      <td style={{ padding: '2px 6px', textAlign: 'right' }}><NumCell value={rows[row.ref]?.amort} onChange={v => upd(row.ref, 'amort', v)} /></td>
      <td style={{ padding: '3px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#1e40af', fontSize: 12 }}>{fmtSigned(net(row.ref))}</td>
      <td style={{ padding: '2px 6px', textAlign: 'right' }}><NumCell value={rows[row.ref]?.net_nm1} onChange={v => upd(row.ref, 'net_nm1', v)} /></td>
    </tr>
  )

  const TotalRow = ({ label, vals, hi }) => (
    <tr style={{ background: hi ? 'var(--color-primary)' : '#e8eef5', fontWeight: 700 }}>
      <td colSpan={3} style={{ padding: '8px 14px', fontSize: hi ? 13 : 12, color: hi ? '#fff' : 'var(--color-primary-mid)' }}>{label}</td>
      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: hi ? '#fde68a' : 'var(--color-primary-mid)', fontSize: 12 }}>{fmt(vals.brut)}</td>
      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: hi ? '#fca5a5' : '#7c3aed', fontSize: 12 }}>{fmt(vals.amort)}</td>
      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: hi ? '#bbf7d0' : '#1e40af', fontSize: 12, fontWeight: 700 }}>{fmtSigned(vals.net)}</td>
      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: hi ? '#bfdbfe' : '#64748b', fontSize: 12 }}>{fmt(vals.nm1)}</td>
    </tr>
  )

  const BandRow = ({ label, ...colors }) => (
    <tr style={{ background: colors.bg }}>
      <td colSpan={7} style={{ padding: '6px 14px', fontWeight: 700, color: colors.color, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</td>
    </tr>
  )

  return (
    <div>
      <SectionHead title="Bilan — Actif" sub="Système normal SYSCOHADA révisé" />
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <SaveBtn onClick={() => onSave({ ...data, bilan_actif: rows })} />
      </div>
      <Card noPad>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--color-primary)' }}>
                <th style={{ padding: '9px 8px', color: '#fff', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', width: 42, textAlign: 'left' }}>Réf</th>
                <th style={{ padding: '9px 10px', color: '#fff', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', textAlign: 'left' }}>ACTIF</th>
                <TH color="#bfdbfe" width={48}>Note</TH>
                <TH color="#fde68a" width={130}>Brut</TH>
                <TH color="#fca5a5" width={130}>Amort/Dépréc.</TH>
                <TH color="#bbf7d0" width={130}>Net N</TH>
                <TH color="#bfdbfe" width={130}>Net N-1</TH>
              </tr>
            </thead>
            <tbody>
              <BandRow label="ACTIF IMMOBILISÉ" {...SECTION_COLORS.immo} />
              {IMMO_SECTIONS.map(sec => (
                <>
                  <tr key={sec.ids[0]} style={{ background: '#f8fafc' }}>
                    <td colSpan={7} style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, color: '#475569' }}>{sec.label}</td>
                  </tr>
                  {BILAN_ACTIF_ROWS.filter(r => sec.ids.includes(r.section)).map(row => <DataRow key={row.ref} row={row} />)}
                </>
              ))}
              <TotalRow label="AZ — Total actif immobilisé" vals={taz} />

              <BandRow label="ACTIF CIRCULANT" {...SECTION_COLORS.circ} />
              {BILAN_ACTIF_ROWS.filter(r => r.section === 'circ').map(row => <DataRow key={row.ref} row={row} />)}
              <TotalRow label="BJ — Total actif circulant" vals={tcirc} />

              <BandRow label="TRÉSORERIE — ACTIF" {...SECTION_COLORS.tres} />
              {BILAN_ACTIF_ROWS.filter(r => r.section === 'tres').map(row => <DataRow key={row.ref} row={row} />)}
              <TotalRow label="BS — Total trésorerie actif" vals={ttres} />

              {BILAN_ACTIF_ROWS.filter(r => r.ref === 'BT').map(row => <DataRow key={row.ref} row={row} />)}
              <TotalRow label="BU — TOTAL GÉNÉRAL" vals={{ ...tgen, brut: 0, amort: 0 }} hi />
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
