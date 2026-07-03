import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

const money = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

const th = { textAlign: "right", padding: "9px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border)" };
const thL = { ...th, textAlign: "left" };
const td = { padding: "8px 12px", fontSize: 13, borderBottom: "1px solid var(--color-border)", textAlign: "right", fontFamily: "var(--font-mono)" };
const tdL = { ...td, textAlign: "left", fontFamily: "inherit" };

const COLS = [
  { key: "current", label: "Courant" },
  { key: "b30", label: "0-30 j" },
  { key: "b60", label: "31-60 j" },
  { key: "b90", label: "61-90 j" },
  { key: "b90plus", label: "> 90 j" },
  { key: "total", label: "Total" }
];

export default function BalanceAgee() {
  const [tab, setTab] = useState("clients");
  const [data, setData] = useState({ clients: null, suppliers: null });

  useEffect(() => {
    api("/api/reports/aged-balance/clients").then((r) => setData((d) => ({ ...d, clients: r || [] }))).catch(() => setData((d) => ({ ...d, clients: [] })));
    api("/api/reports/aged-balance/suppliers").then((r) => setData((d) => ({ ...d, suppliers: r || [] }))).catch(() => setData((d) => ({ ...d, suppliers: [] })));
  }, []);

  const rows = tab === "clients" ? data.clients : data.suppliers;

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: 12, borderBottom: "1px solid var(--color-border)", display: "flex", gap: 8 }}>
        {[["clients", "Clients"], ["suppliers", "Fournisseurs"]].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className="btn"
            style={tab === key ? { background: "var(--color-primary)", color: "#fff", borderColor: "var(--color-primary)" } : {}}
          >
            {label}
          </button>
        ))}
      </div>
      {!rows && <div style={{ padding: 24, color: "var(--color-text-muted)" }}>Chargement…</div>}
      {rows && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thL}>Tiers</th>
                {COLS.map((c) => (
                  <th key={c.key} style={th}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code}>
                  <td style={tdL}>
                    <div style={{ fontWeight: 600 }}>{r.label}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-faint)" }}>{r.code}</div>
                  </td>
                  {COLS.map((c) => (
                    <td key={c.key} style={{ ...td, fontWeight: c.key === "total" ? 700 : 400 }}>{money(r[c.key])}</td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td style={{ ...tdL, color: "var(--color-text-muted)" }} colSpan={COLS.length + 1}>Aucun solde.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
