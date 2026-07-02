import styles from './UI.module.css'

/* ── Section header ──────────────────────────── */
export function SectionHead({ title, sub }) {
  return (
    <div className={styles.sectionHead}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {sub && <p className={styles.sectionSub}>{sub}</p>}
    </div>
  )
}

/* ── Card ────────────────────────────────────── */
export function Card({ children, style, noPad }) {
  return (
    <div className={`${styles.card} ${noPad ? styles.noPad : ''}`} style={style}>
      {children}
    </div>
  )
}

/* ── Card section title ──────────────────────── */
export function CardTitle({ children }) {
  return <h3 className={styles.cardTitle}>{children}</h3>
}

/* ── Form input ──────────────────────────────── */
export function Inp({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div className={styles.field}>
      {label && <label className={styles.label}>{label}</label>}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={styles.input}
      />
    </div>
  )
}

/* ── Numeric cell (inline in table) ─────────── */
export function NumCell({ value, onChange }) {
  return (
    <input
      type="number"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder="0"
      className={styles.numCell}
    />
  )
}

/* ── Primary button ──────────────────────────── */
export function SaveBtn({ onClick, label = '💾  Enregistrer' }) {
  return (
    <button onClick={onClick} className={styles.saveBtn}>
      {label}
    </button>
  )
}

/* ── Ghost button ────────────────────────────── */
export function GhostBtn({ onClick, children }) {
  return (
    <button onClick={onClick} className={styles.ghostBtn}>
      {children}
    </button>
  )
}

/* ── Status pill ─────────────────────────────── */
export function Pill({ ok, label }) {
  return (
    <span className={`${styles.pill} ${ok ? styles.pillOk : styles.pillKo}`}>
      {ok ? '✓' : '✕'} {label}
    </span>
  )
}

/* ── Table header cell ───────────────────────── */
export function TH({ children, right, accent, width }) {
  return (
    <th
      className={`${styles.th} ${right ? styles.thRight : ''} ${accent ? styles.thAccent : ''}`}
      style={width ? { width } : undefined}
    >
      {children}
    </th>
  )
}

/* ── KPI card ────────────────────────────────── */
export function KpiCard({ label, value, color, bg }) {
  return (
    <div className={styles.kpi} style={{ background: bg, borderColor: color + '33' }}>
      <div className={styles.kpiLabel} style={{ color }}>{label}</div>
      <div className={styles.kpiValue} style={{ color }}>{value}</div>
      <div className={styles.kpiUnit} style={{ color }}>FCFA</div>
    </div>
  )
}

/* ── Section band (colored row in table) ─────── */
export function BandRow({ label, color, bg, colSpan = 7 }) {
  return (
    <tr style={{ background: bg }}>
      <td colSpan={colSpan} className={styles.bandCell} style={{ color }}>
        {label}
      </td>
    </tr>
  )
}

/* ── Total row (dark) ────────────────────────── */
export function TotalRow({ label, cells, highlight }) {
  return (
    <tr className={`${styles.totalRow} ${highlight ? styles.totalRowHi : ''}`}>
      <td colSpan={3} className={styles.totalLabel}>{label}</td>
      {cells.map((c, i) => (
        <td key={i} className={styles.totalCell}>{c}</td>
      ))}
    </tr>
  )
}
