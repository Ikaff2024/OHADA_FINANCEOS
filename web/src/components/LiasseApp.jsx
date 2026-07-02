import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStorage } from '../hooks/useStorage.js'
import Layout from '../components/Layout.jsx'

// Modules
import MenuModule       from '../modules/MenuModule.jsx'
import ParamsModule     from '../modules/ParamsModule.jsx'
import BalanceModule    from '../modules/BalanceModule.jsx'
import BilanActifModule from '../modules/BilanActifModule.jsx'
import BilanPassifModule from '../modules/BilanPassifModule.jsx'
import CRModule         from '../modules/CRModule.jsx'
import TafireModule     from '../modules/TafireModule.jsx'
import FluxModule       from '../modules/FluxModule.jsx'
import NotesModule      from '../modules/NotesModule.jsx'
import FIRDModule       from '../modules/FIRDModule.jsx'
import ControlesModule  from '../modules/ControlesModule.jsx'

export default function LiasseApp() {
  // La liasse est scopée par organisation côté serveur (API OHADA).
  const { data, save, reset, loading } = useStorage()
  const [module, setModule] = useState('menu')
  const navigate = useNavigate()

  if (loading || !data) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#f0f4f8', fontFamily:'DM Sans, system-ui, sans-serif' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>◈</div>
          <div style={{ fontSize:15, fontWeight:600, color:'#1e3a5f' }}>Auth'NTIC</div>
          <div style={{ fontSize:13, color:'#64748b', marginTop:4 }}>Chargement du dossier…</div>
        </div>
      </div>
    )
  }

  const modules = {
    menu:         <MenuModule        data={data} setModule={setModule} />,
    params:       <ParamsModule      data={data} onSave={save} />,
    balance:      <BalanceModule     data={data} onSave={save} />,
    bilan_actif:  <BilanActifModule  data={data} onSave={save} />,
    bilan_passif: <BilanPassifModule data={data} onSave={save} />,
    cr:           <CRModule          data={data} onSave={save} />,
    tafire:       <TafireModule      data={data} onSave={save} />,
    flux:         <FluxModule        data={data} onSave={save} />,
    notes:        <NotesModule       data={data} onSave={save} />,
    fird:         <FIRDModule        data={data} />,
    controles:    <ControlesModule   data={data} onReset={reset} />,
  }

  return (
    <Layout module={module} setModule={setModule} params={data.params}>
      {/* On peut ajouter ici un bouton Retour rapide au Dashboard */}
      <div style={{ padding: '10px 20px', background: '#e2e8f0', display: 'flex', justifyContent: 'flex-start' }}>
        <button 
          onClick={() => navigate('/dashboard')}
          style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}
        >
          ← Retour au tableau de bord
        </button>
      </div>
      {modules[module]}
    </Layout>
  )
}
