import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";

const money = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

const th = { textAlign: "left", padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border)" };
const td = { padding: "10px 12px", fontSize: 13, borderBottom: "1px solid var(--color-border)" };

export default function Journal() {
  const [entries, setEntries] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/journal-entries")
      .then((rows) => setEntries(Array.isArray(rows) ? rows : []))
      .catch((err) => {
        setError(err.message);
        setEntries([]);
      });
  }, []);

  const filtered = useMemo(() => {
    const list = entries ?? [];
    const q = query.trim().toLowerCase();
    const rows = q
      ? list.filter((e) =>
          [e.reference, e.description, e.source].some((v) => String(v || "").toLowerCase().includes(q))
        )
      : list;
    return [...rows].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [entries, query]);

  const total = (entry) => (entry.lines || []).reduce((acc, l) => acc + (Number(l.debit) || 0), 0);

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: 16, borderBottom: "1px solid var(--color-border)" }}>
        <input
          className="input"
          type="search"
          placeholder="Rechercher référence, libellé, source…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 420 }}
        />
      </div>

      {error && <div style={{ padding: 16, color: "var(--color-danger)", fontSize: 13 }}>{error}</div>}
      {!entries && <div style={{ padding: 24, color: "var(--color-text-muted)" }}>Chargement…</div>}

      {entries && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Référence</th>
                <th style={th}>Libellé</th>
                <th style={th}>Source</th>
                <th style={{ ...th, textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr key={entry.id}>
                  <td style={td}>{entry.date}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{entry.reference}</td>
                  <td style={td}>{entry.description}</td>
                  <td style={td}>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 999,
                        background: "var(--color-bg)",
                        color: "var(--color-text-muted)"
                      }}
                    >
                      {entry.source}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{money(total(entry))}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td style={{ ...td, color: "var(--color-text-muted)" }} colSpan={5}>
                    Aucune écriture.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
