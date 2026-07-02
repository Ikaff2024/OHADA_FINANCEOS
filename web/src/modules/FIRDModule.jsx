import { SectionHead, Card, CardTitle } from '../components/UI.jsx'
import { computeCR, computeTotalActifNet, computeCP } from '../utils/compute.js'
import { fmtSigned } from '../utils/format.js'

export default function FIRDModule({ data }) {
  const pr = data.params
  const { xB, xI } = computeCR(data.cr)
  const totalActifNet = computeTotalActifNet(data.bilan_actif)
  const cp = computeCP(data.bilan_passif)

  const Field = ({ label, value }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ width: 290, fontSize: 12, color: '#64748b', fontWeight: 500, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 13, color: value ? '#1e293b' : '#cbd5e1', fontStyle: value ? 'normal' : 'italic', fontWeight: value ? 500 : 400 }}>
        {value || 'Non renseigné'}
      </div>
    </div>
  )

  const NumField = ({ label, value }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ width: 290, fontSize: 12, color: '#64748b', fontWeight: 500, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 14, color: '#1e40af', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
        {value !== '—' && value ? value + ' FCFA' : '—'}
      </div>
    </div>
  )

  return (
    <div>
      <SectionHead title="FIRD" sub="Fiche d'Identification et Renseignements Divers — DGI" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* Colonne gauche */}
        <Card>
          <CardTitle>1. Identification de l'entreprise</CardTitle>
          <Field label="Dénomination sociale" value={pr.denomination} />
          <Field label="Sigle usuel" value={pr.sigle} />
          <Field label="Forme juridique" value={pr.forme_jur} />
          <Field label="N° d'Identification Fiscale (NIF)" value={pr.nif} />
          <Field label="N° de Télédéclarant (NTD)" value={pr.ntd} />
          <Field label="Code activité (APE/NAF)" value={pr.code_act} />
          <Field label="Adresse (siège social)" value={pr.adresse} />
          <Field label="Boîte Postale" value={pr.bp} />
          <Field label="Ville / Pays" value={pr.pays} />
          <Field label="Téléphone" value={pr.contact_tel} />
          <Field label="Email" value={pr.contact_email} />
        </Card>

        {/* Colonne droite */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <CardTitle>2. Renseignements sur l'exercice</CardTitle>
            <Field label="Date d'ouverture de l'exercice" value={pr.date_debut} />
            <Field label="Date de clôture de l'exercice" value={pr.date_cloture} />
            <Field label="Durée de l'exercice (mois)" value={pr.duree} />
          </Card>

          <Card>
            <CardTitle>3. Chiffres clés de l'exercice</CardTitle>
            <NumField label="Chiffre d'affaires" value={fmtSigned(xB)} />
            <NumField label="Résultat net" value={fmtSigned(xI)} />
            <NumField label="Total Bilan (Actif Net)" value={fmtSigned(totalActifNet)} />
            <NumField label="Capitaux propres" value={fmtSigned(cp)} />
          </Card>

          <Card>
            <CardTitle>4. Documents déposés</CardTitle>
            {[
              "Fiche d'identification et renseignements divers",
              'Bilan',
              'Compte de résultat',
              'Tableau des flux de trésorerie',
              'Notes annexes',
            ].map(doc => (
              <div key={doc} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--color-success)', fontWeight: 700 }}>✓</span>
                <span style={{ color: '#334155' }}>{doc}</span>
              </div>
            ))}
            <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 12, color: '#64748b' }}>
              <span>Nombre d'exemplaires déposés : <strong style={{ color: '#1e293b' }}>5</strong></span>
              <span>Nombre de pages : <strong style={{ color: '#1e293b' }}>61</strong></span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
