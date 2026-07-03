import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";

const th = { textAlign: "left", padding: "9px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, background: "var(--color-surface)" };
const td = { padding: "8px 12px", fontSize: 13, borderBottom: "1px solid var(--color-border)" };

export default function PlanComptable() {
  const [accounts, setAccounts] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api("/api/accounts")
      .then((rows) => setAccounts(Array.isArray(rows) ? rows : []))
      .catch(() => setAccounts([]));
  }, []);

  const filtered = useMemo(() => {
    const list = accounts ?? [];
    const q = query.trim().toLowerCase();
    const rows = q
      ? list.filter((a) =>
          [a.code, a.label, a.classLabel].some((v) => String(v || "").toLowerCase().includes(q))
        )
      : list;
    return [...rows].sort((a, b) => String(a.code).localeCompare(String(b.code), "fr", { numeric: true }));
  }, [accounts, query]);

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: 16, borderBottom: "1px solid var(--color-border)" }}>
        <input
          className="input"
          type="search"
          placeholder="Rechercher un compte, un libellé, une classe…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 460 }}
        />
      </div>
      {!accounts && <div style={{ padding: 24, color: "var(--color-text-muted)" }}>Chargement…</div>}
      {accounts && (
        <div style={{ maxHeight: "70vh", overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Compte</th>
                <th style={th}>Libellé</th>
                <th style={th}>Classe</th>
                <th style={th}>Type</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.code}>
                  <td style={{ ...td, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{a.code}</td>
                  <td style={td}>{a.label}</td>
                  <td style={{ ...td, color: "var(--color-text-muted)" }}>{a.classLabel || a.classCode}</td>
                  <td style={{ ...td, color: "var(--color-text-faint)" }}>{a.reportType || a.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
