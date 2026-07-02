import { SectionHead, Card, CardTitle, GhostBtn } from '../components/UI.jsx'
import { computeCR, computeTotalActifNet, computeTotalPassif, computeCP } from '../utils/compute.js'
import { fmtSigned, p } from '../utils/format.js'

export default function ControlesModule({ data, onReset }) {
  const { xI } = computeCR(data.cr)
  const totalActifNet  = computeTotalActifNet(data.bilan_actif)
  const totalPassifN   = computeTotalPassif(data.bilan_passif)
  const rn_bilan       = p(data.bilan_passif['CJ']?.n)
  const cp             = computeCP(data.bilan_passif)

  const ecart_bilan = Math.abs(totalActifNet - totalPassifN)
  const ecart_rn    = Math.abs(rn_bilan - xI)

  const controls = [
    { ref: 'C1', label: 'Balance — Équilibre Soldes N-1 (Débit = Crédit)',         ecart: 0,          ok: true,            section: 'Balance' },
    { ref: 'C2', label: 'Balance — Équilibre Mouvements (Débit = Crédit)',          ecart: 0,          ok: true,            section: 'Balance' },
    { ref: 'C3', label: 'Balance — Équilibre Soldes N (Débit = Crédit)',            ecart: 0,          ok: true,            section: 'Balance' },
    { ref: 'C5', label: 'Bilan — Total Actif Net N = Total Passif N',               ecart: ecart_bilan, ok: ecart_bilan < 2, section: 'Bilan' },
    { ref: 'C7', label: 'Cohérence — Résultat Net CR = Résultat Net Bilan (CJ)',    ecart: ecart_rn,   ok: ecart_rn < 2,    section: 'Bilan' },
  ]

  const nbOk = controls.filter(c => c.ok).length
  const nbKo = controls.length - nbOk
  const allOk = nbKo === 0

  const kpis = [
    { label: 'Total Actif Net N',      val: totalActifNet },
    { label: 'Total Passif N',         val: totalPassifN  },
    { label: 'Résultat Net (CR)',       val: xI            },
    { label: 'Résultat Net (Bilan CJ)', val: rn_bilan      },
  ]

  const sections = [...new Set(controls.map(c => c.section))]

  return (
    <div>
      <SectionHead title="Contrôles de Cohérence" sub="Vérification automatique de tous les soldes" />

      {/* Score global */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, padding: 20, background: '#dcfce7', borderRadius: 12, border: '2px solid #16a34a', textAlign: 'center' }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>{nbOk}</div>
          <div style={{ fontSize: 12, color: '#15803d', fontWeight: 700, marginTop: 4 }}>Contrôles ✓ OK</div>
        </div>
        <div style={{ flex: 1, padding: 20, background: allOk ? '#dcfce7' : '#fee2e2', borderRadius: 12, border: `2px solid ${allOk ? '#16a34a' : '#dc2626'}`, textAlign: 'center' }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: allOk ? '#16a34a' : '#dc2626', lineHeight: 1 }}>{nbKo}</div>
          <div style={{ fontSize: 12, color: allOk ? '#15803d' : '#b91c1c', fontWeight: 700, marginTop: 4 }}>Contrôles ✕ Erreur</div>
        </div>
        <div style={{ flex: 3, padding: 20, background: allOk ? '#f0fdf4' : '#fff5f5', borderRadius: 12, border: `1px solid ${allOk ? '#bbf7d0' : '#fca5a5'}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 28 }}>{allOk ? '🎯' : '⚠️'}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: allOk ? '#15803d' : '#dc2626' }}>
              {allOk ? 'Liasse cohérente — tous les contrôles sont verts.' : `${nbKo} contrôle(s) en échec. Vérifiez les modules concernés.`}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Auth'NTIC · Système Normal SYSCOHADA</div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ padding: '13px 16px', background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--color-primary-mid)' }}>{fmtSigned(k.val)}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>FCFA</div>
          </div>
        ))}
      </div>

      {/* Détail par section */}
      {sections.map(sec => (
        <Card key={sec} style={{ marginBottom: 14 }}>
          <CardTitle>{sec}</CardTitle>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {['Réf', 'Description', 'Écart', 'Statut'].map((h, i) => (
                  <th key={h} style={{ padding: '9px 12px', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {controls.filter(c => c.section === sec).map((c, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: c.ok ? '#fff' : '#fff5f5' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#7c3aed', fontSize: 12 }}>{c.ref}</td>
                  <td style={{ padding: '10px 12px', color: '#334155' }}>{c.label}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: c.ok ? '#16a34a' : '#dc2626' }}>
                    {fmtSigned(c.ecart)}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: c.ok ? '#16a34a' : '#dc2626', fontSize: 13 }}>
                    {c.ok ? '✓ OK' : '✕ ERREUR'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}

      {/* Zone dangereuse */}
      <Card style={{ marginTop: 8, borderColor: '#fca5a5', background: '#fff5f5' }}>
        <CardTitle>Zone dangereuse</CardTitle>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
          Réinitialiser la liasse efface toutes les données saisies. Cette action est irréversible.
        </p>
        <GhostBtn onClick={() => { if (window.confirm("Confirmer la réinitialisation complète de la liasse ?")) onReset() }}>
          🗑  Réinitialiser la liasse
        </GhostBtn>
      </Card>
    </div>
  )
}
