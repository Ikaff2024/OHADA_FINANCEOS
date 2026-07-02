import styles from './Layout.module.css'

const NAV_ITEMS = [
  { id: 'menu',         icon: '⊞',  label: 'Tableau de bord' },
  { id: 'params',       icon: '◈',  label: 'Paramètres' },
  { id: 'balance',      icon: '≡',  label: 'Balance' },
  { id: 'bilan_actif',  icon: '▲',  label: 'Bilan Actif' },
  { id: 'bilan_passif', icon: '▼',  label: 'Bilan Passif' },
  { id: 'cr',           icon: '◉',  label: 'Compte de Résultat' },
  { id: 'tafire',       icon: '⟳',  label: 'TAFIRE' },
  { id: 'flux',         icon: '~',  label: 'Flux de Trésorerie' },
  { id: 'notes',        icon: '✦',  label: 'Notes Annexes' },
  { id: 'fird',         icon: '⬡',  label: 'FIRD' },
  { id: 'controles',    icon: '✓',  label: 'Contrôles' },
]

export default function Layout({ module, setModule, params, children }) {
  return (
    <div className={styles.root}>
      <aside className={styles.sidebar}>
        {/* Brand */}
        <div className={styles.brand}>
          <div className={styles.brandName}>OHADA FinanceOS</div>
          <div className={styles.brandSub}>Liasse Fiscale</div>
          <div className={styles.brandTag}>SYSCOHADA · Système Normal</div>
        </div>

        {/* Nav */}
        <nav className={styles.nav}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`${styles.navItem} ${module === item.id ? styles.active : ''}`}
              onClick={() => setModule(item.id)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className={styles.sidebarFooter}>
          <div className={styles.footerCompany}>
            {params?.sigle || params?.denomination || 'Non configuré'}
          </div>
          <div className={styles.footerDate}>
            {params?.date_cloture || '—'}
          </div>
        </div>
      </aside>

      <main className={styles.main}>
        {children}
      </main>
    </div>
  )
}
