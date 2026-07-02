import { useState } from 'react'
import { SectionHead, Card, CardTitle, Inp, SaveBtn } from '../components/UI.jsx'

export default function ParamsModule({ data, onSave }) {
  const [form, setForm] = useState(data.params)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div>
      <SectionHead title="Paramètres & Identification" sub="Informations générales de l'entreprise" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <Card>
          <CardTitle>🏢 Identification</CardTitle>
          <Inp label="Dénomination sociale" value={form.denomination} onChange={v => set('denomination', v)} />
          <Inp label="Sigle usuel" value={form.sigle} onChange={v => set('sigle', v)} />
          <Inp label="Adresse géographique" value={form.adresse} onChange={v => set('adresse', v)} />
          <Inp label="Boîte Postale" value={form.bp} onChange={v => set('bp', v)} />
          <Inp label="Pays du siège social" value={form.pays} onChange={v => set('pays', v)} />
        </Card>

        <Card>
          <CardTitle>🔢 Numéros officiels</CardTitle>
          <Inp label="NIF — N° d'identification fiscale" value={form.nif} onChange={v => set('nif', v)} />
          <Inp label="NTD — N° de Télédéclarant" value={form.ntd} onChange={v => set('ntd', v)} />
          <Inp label="N° Registre du Commerce" value={form.rc} onChange={v => set('rc', v)} />
          <Inp label="N° Caisse nationale de prévoyance" value={form.cnps} onChange={v => set('cnps', v)} />
          <Inp label="Forme juridique" value={form.forme_jur} onChange={v => set('forme_jur', v)} placeholder="SA / SARL / SAS…" />
          <Inp label="Code activité principale" value={form.code_act} onChange={v => set('code_act', v)} />
        </Card>

        <Card>
          <CardTitle>📅 Exercice comptable</CardTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Inp label="Date début" value={form.date_debut} onChange={v => set('date_debut', v)} type="date" />
            <Inp label="Date clôture" value={form.date_cloture} onChange={v => set('date_cloture', v)} type="date" />
            <Inp label="Durée (mois)" value={form.duree} onChange={v => set('duree', v)} type="number" />
          </div>
        </Card>

        <Card>
          <CardTitle>👤 Personne à contacter</CardTitle>
          <Inp label="Nom" value={form.contact_nom} onChange={v => set('contact_nom', v)} />
          <Inp label="Téléphone" value={form.contact_tel} onChange={v => set('contact_tel', v)} />
          <Inp label="Email" value={form.contact_email} onChange={v => set('contact_email', v)} />
          <Inp label="Qualité / Fonction" value={form.contact_qualite} onChange={v => set('contact_qualite', v)} />
        </Card>

        <Card style={{ gridColumn: '1 / -1' }}>
          <CardTitle>✍️ Personne ayant établi les états</CardTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Inp label="Nom" value={form.etabli_nom} onChange={v => set('etabli_nom', v)} />
            <Inp label="Téléphone" value={form.etabli_tel} onChange={v => set('etabli_tel', v)} />
            <Inp label="Email" value={form.etabli_email} onChange={v => set('etabli_email', v)} />
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <SaveBtn onClick={() => onSave({ ...data, params: form })} />
      </div>
    </div>
  )
}
