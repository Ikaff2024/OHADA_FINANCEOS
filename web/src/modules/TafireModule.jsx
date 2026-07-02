import { useState } from 'react'
import { SectionHead, Card, CardTitle, KpiCard, SaveBtn, NumCell } from '../components/UI.jsx'
import { computeCR, computeCAFG } from '../utils/compute.js'
import { fmtSigned, p } from '../utils/format.js'

const BFE_ROWS = [
  { ref: 'BB',  label: 'Stocks et encours',                field: 'BB_stocks' },
  { ref: 'BG',  label: 'Fournisseurs, avances versées',    field: 'BG_crean'  },
  { ref: 'BH',  label: 'Clients',                          field: 'BH_crean'  },
  { ref: 'BI',  label: 'Autres créances',                  field: 'BI_crean'  },
  { ref: 'BT',  label: 'Ecarts de conversion - Actif',     field: 'BT_eca'    },
  { ref: 'DJ',  label: "Fournisseurs d'exploitation",      field: 'DJ_dettes' },
  { ref: 'DK',  label: 'Dettes fiscales et sociales',      field: 'DK_dettes' },
  { ref: 'DM',  label: 'Autres dettes',                    field: 'DM_dettes' },
  { ref: 'DV',  label: 'Ecarts de conversion - Passif',    field: 'DV_ecp'    },
]

export default function TafireModule({ data, onSave }) {
  const [tf, setTf] = useState(data.tafire)
  const set = (k, v) => setTf(prev => ({ ...prev, [k]: v }))

  const { xD: ebe } = computeCR(data.cr)
  const total_charges = p(tf.SA) + p(tf.SC) + p(tf.SL) + p(tf.SQ) + p(tf.SR)
  const total_produits = ebe + p(tf.TT) + p(tf.UA) + p(tf.UE) + p(tf.UC) + p(tf.UL) + p(tf.UN)
  const cafg = total_produits - total_charges
  const af   = cafg - p(tf.dividendes)
  const bfe  = p(tf.BB_stocks) + p(tf.BG_crean) + p(tf.BH_crean) + p(tf.BI_crean) + p(tf.BT_eca)
             + p(tf.DJ_dettes) + p(tf.DM_dettes) - p(tf.DK_dettes) - p(tf.DV_ecp)
  const ete  = ebe - bfe - p(tf.prod_immo)

  const kpis = [
    { label: 'CAFG',           value: fmtSigned(cafg), color: '#1e40af', bg: '#dbeafe' },
    { label: 'Autofinancement', value: fmtSigned(af),  color: '#065f46', bg: '#d1fae5' },
    { label: 'Variation BFE',  value: fmtSigned(bfe),  color: '#92400e', bg: '#fef3c7' },
    { label: 'ETE',            value: fmtSigned(ete),  color: '#6d28d9', bg: '#ede9fe' },
  ]

  const Row = ({ refLabel, label, field, side }) => (
    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
      <td style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700, color: '#7c3aed', fontFamily: 'var(--font-mono)' }}>{refLabel}</td>
      <td style={{ padding: '3px 10px', fontSize: 12, color: '#334155' }}>{label}</td>
      <td style={{ padding: '2px 6px', textAlign: 'right' }}>{side === 'charges' ? <NumCell value={tf[field]} onChange={v => set(field, v)} /> : '—'}</td>
      <td style={{ padding: '2px 6px', textAlign: 'right' }}>{side === 'produits' ? <NumCell value={tf[field]} onChange={v => set(field, v)} /> : '—'}</td>
    </tr>
  )

  const TR = ({ label, ch, pr, hi }) => (
    <tr style={{ background: hi ? 'var(--color-primary)' : '#e8eef5', fontWeight: 700 }}>
      <td colSpan={2} style={{ padding: '8px 14px', fontSize: 12, color: hi ? '#fff' : 'var(--color-primary-mid)' }}>{label}</td>
      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: hi ? '#fca5a5' : '#1e40af', fontSize: 12 }}>{ch !== undefined ? fmtSigned(ch) : ''}</td>
      <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: hi ? '#bbf7d0' : '#16a34a', fontSize: 12 }}>{pr !== undefined ? fmtSigned(pr) : ''}</td>
    </tr>
  )

  const thStyle = { padding: '9px 10px', fontSize: 10.5, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.4px', textAlign: 'right' }

  return (
    <div>
      <SectionHead title="TAFIRE" sub="Tableau Financier des Ressources et Emplois" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <SaveBtn onClick={() => onSave({ ...data, tafire: tf })} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* CAFG */}
        <Card noPad>
          <div style={{ padding: '11px 16px', background: 'var(--color-primary)', color: '#fff', fontSize: 12, fontWeight: 700 }}>
            CAPACITÉ D'AUTOFINANCEMENT GLOBALE (CAFG)
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--color-primary-mid)' }}>
                <th style={{ ...thStyle, textAlign: 'left', width: 40 }}></th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Élément</th>
                <th style={{ ...thStyle, color: '#fca5a5', width: 120 }}>Charges (I)</th>
                <th style={{ ...thStyle, color: '#bbf7d0', width: 120 }}>Produits (II)</th>
              </tr>
            </thead>
            <tbody>
              <Row refLabel="SA" label="Frais financiers et charges assimilées" field="SA" side="charges" />
              <Row refLabel="SC" label="Pertes de change" field="SC" side="charges" />
              <Row refLabel="SL" label="Charges H.A.O." field="SL" side="charges" />
              <Row refLabel="SQ" label="Participation des travailleurs" field="SQ" side="charges" />
              <Row refLabel="SR" label="Impôts sur le résultat" field="SR" side="charges" />
              <TR label="Total (I) — Charges décaissables" ch={total_charges} />
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                <td /><td style={{ padding: '3px 10px', fontSize: 12, color: '#334155', fontWeight: 600 }}>EBE (calculé depuis CR)</td>
                <td style={{ padding: '3px 10px', textAlign: 'right' }}>—</td>
                <td style={{ padding: '3px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#16a34a', fontSize: 12 }}>{fmtSigned(ebe)}</td>
              </tr>
              <Row refLabel="TT" label="Transferts de charges exploitation" field="TT" side="produits" />
              <Row refLabel="UA" label="Revenus financiers et assimilés" field="UA" side="produits" />
              <Row refLabel="UE" label="Transferts de charges financières" field="UE" side="produits" />
              <Row refLabel="UC" label="Gains de change" field="UC" side="produits" />
              <Row refLabel="UL" label="Produits H.A.O." field="UL" side="produits" />
              <Row refLabel="UN" label="Transferts de charges H.A.O." field="UN" side="produits" />
              <TR label="Total (II) — Produits encaissables" pr={total_produits} />
              <TR label="CAFG = (II) − (I)" ch={cafg} hi />
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td /><td style={{ padding: '3px 10px', fontSize: 12, color: '#334155' }}>− Distributions de dividendes</td>
                <td style={{ padding: '2px 6px', textAlign: 'right' }}><NumCell value={tf.dividendes} onChange={v => set('dividendes', v)} /></td>
                <td />
              </tr>
              <TR label="AF = CAFG − Dividendes" ch={af} />
            </tbody>
          </table>
        </Card>

        {/* BFE + ETE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card noPad>
            <div style={{ padding: '11px 16px', background: 'var(--color-primary)', color: '#fff', fontSize: 12, fontWeight: 700 }}>VARIATION DU BFE</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--color-primary-mid)' }}>
                  <th style={{ ...thStyle, textAlign: 'left', width: 40 }}></th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Élément</th>
                  <th style={{ ...thStyle, color: '#fca5a5', width: 115 }}>Emplois (+)</th>
                  <th style={{ ...thStyle, color: '#bbf7d0', width: 115 }}>Ressources (−)</th>
                </tr>
              </thead>
              <tbody>
                {BFE_ROWS.map(item => (
                  <tr key={item.ref} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '3px 8px', fontSize: 11, fontWeight: 700, color: '#7c3aed', fontFamily: 'var(--font-mono)' }}>{item.ref}</td>
                    <td style={{ padding: '3px 10px', fontSize: 12, color: '#334155' }}>{item.label}</td>
                    <td style={{ padding: '2px 6px', textAlign: 'right' }}><NumCell value={tf[item.field]} onChange={v => set(item.field, v)} /></td>
                    <td />
                  </tr>
                ))}
                <TR label="VARIATION DU BFE" ch={bfe} />
              </tbody>
            </table>
          </Card>

          <Card>
            <CardTitle>EXCÉDENT DE TRÉSORERIE D'EXPLOITATION (ETE)</CardTitle>
            {[
              { label: 'EBE (depuis CR)',    val: fmtSigned(ebe) },
              { label: '− Variation du BFE', val: fmtSigned(bfe) },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                <span style={{ color: '#334155' }}>{r.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#64748b' }}>{r.val}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
              <span style={{ color: '#334155' }}>− Production immobilisée</span>
              <NumCell value={tf.prod_immo} onChange={v => set('prod_immo', v)} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', background: '#f0f4f8', marginTop: 10, borderRadius: 8 }}>
              <span style={{ fontWeight: 700, color: 'var(--color-primary-mid)', fontSize: 13 }}>ETE</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#6d28d9', fontSize: 14 }}>{fmtSigned(ete)}</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
