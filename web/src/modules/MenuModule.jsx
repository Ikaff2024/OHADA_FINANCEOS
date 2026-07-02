import { KpiCard } from '../components/UI.jsx'
import { computeCR, computeTotalActifNet, computeCAFG } from '../utils/compute.js'
import { fmtSigned } from '../utils/format.js'

const NAV_CARDS = [
  { id:'params',       icon:'◈',  title:'Paramètres',          desc:"Identification de l'entreprise, exercice" },
  { id:'balance',      icon:'≡',  title:'Balance',             desc:'Saisie des comptes — SD, SC, Mouvements' },
  { id:'bilan_actif',  icon:'▲',  title:'Bilan Actif',         desc:'Brut, Amort/Dépréc, Net N et N-1' },
  { id:'bilan_passif', icon:'▼',  title:'Bilan Passif',        desc:'Capitaux, Dettes, Passif circulant' },
  { id:'cr',           icon:'◉',  title:'Compte de Résultat',  desc:'SIG : CA, VA, EBE, RE, RF, RN' },
  { id:'tafire',       icon:'⟳',  title:'TAFIRE',              desc:'CAFG, Autofinancement, BFE, ETE' },
  { id:'flux',         icon:'~',  title:'Flux de Trésorerie',  desc:'Opérationnel, Investissement, Financement' },
  { id:'notes',        icon:'✦',  title:'Notes Annexes',       desc:'N01, N03A, N27B, N28, N34 — Ratios' },
  { id:'fird',         icon:'⬡',  title:'FIRD',                desc:"Fiche d'Identification — DGI" },
  { id:'controles',    icon:'✓',  title:'Contrôles',           desc:'Vérification automatique des équilibres' },
]

export default function MenuModule({ data, setModule }) {
  const pr = data.params
  const { xB, xD, xI } = computeCR(data.cr)
  const totalActifNet = computeTotalActifNet(data.bilan_actif)
  const cafg = computeCAFG(data.tafire, data.cr)

  const kpis = [
    { label: 'Total Actif Net',    value: fmtSigned(totalActifNet), color: '#1e40af', bg: '#dbeafe' },
    { label: "Chiffre d'affaires", value: fmtSigned(xB),            color: '#065f46', bg: '#d1fae5' },
    { label: 'EBE',                value: fmtSigned(xD),            color: '#92400e', bg: '#fef3c7' },
    { label: 'CAFG',               value: fmtSigned(cafg),          color: '#6d28d9', bg: '#ede9fe' },
    { label: 'Résultat Net',       value: fmtSigned(xI),            color: xI >= 0 ? '#16a34a' : '#dc2626', bg: xI >= 0 ? '#dcfce7' : '#fee2e2' },
  ]

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1e3a5f', letterSpacing: '-0.5px' }}>
          Auth'NTIC — Liasse Fiscale SYSCOHADA
        </h1>
        <p style={{ margin: '5px 0 0', fontSize: 13, color: '#64748b' }}>
          {pr.denomination || 'Entreprise non configurée'} · {pr.date_cloture || 'Exercice non défini'} · Système Normal OHADA
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {kpis.map(k => <KpiCard key={k.label} {...k} />)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {NAV_CARDS.map(c => (
          <button key={c.id} onClick={() => setModule(c.id)}
            style={{ display:'block', width:'100%', padding:'16px', background:'#fff', border:'1.5px solid #e2e8f0', borderRadius:12, cursor:'pointer', textAlign:'left', fontFamily:'inherit', transition:'all 0.15s' }}
            onMouseOver={e => { e.currentTarget.style.borderColor='#c9a84c'; e.currentTarget.style.background='#fffdf5' }}
            onMouseOut={e =>  { e.currentTarget.style.borderColor='#e2e8f0'; e.currentTarget.style.background='#fff' }}>
            <div style={{ fontSize:20, marginBottom:8, color:'#1e3a5f' }}>{c.icon}</div>
            <div style={{ fontSize:13, fontWeight:700, color:'#1e3a5f', marginBottom:3 }}>{c.title}</div>
            <div style={{ fontSize:11, color:'#64748b', lineHeight:1.4 }}>{c.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
