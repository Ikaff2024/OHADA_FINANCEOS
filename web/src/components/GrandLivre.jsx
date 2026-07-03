import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";

const money = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

const th = { textAlign: "left", padding: "9px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border)" };
const td = { padding: "8px 12px", fontSize: 13, borderBottom: "1px solid var(--color-border)" };

export default function GrandLivre() {
  const [rows, setRows] = useState(null);
  const [account, setAccount] = useState("");

  useEffect(() => {
    api("/api/reports/general-ledger")
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => setRows([]));
  }, []);

  const accountsUsed = useMemo(() => {
    const map = new Map();
    (rows ?? []).forEach((r) => map.set(r.accountCode, `${r.accountCode} — ${r.accountLabel || ""}`));
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr", { numeric: true }));
  }, [rows]);

  const filtered = useMemo(() => {
    const list = rows ?? [];
    return account ? list.filter((r) => r.accountCode === account) : list;
  }, [rows, account]);

  const totals = filtered.reduce(
    (t, r) => ({ debit: t.debit + (Number(r.debit) || 0), credit: t.credit + (Number(r.credit) || 0) }),
    { debit: 0, credit: 0 }
  );

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: 16, borderBottom: "1px solid var(--color-border)" }}>
        <select className="input" value={account} onChange={(e) => setAccount(e.target.value)} style={{ maxWidth: 460 }}>
          <option value="">Tous les comptes</option>
          {accountsUsed.map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {!rows && <div style={{ padding: 24, color: "var(--color-text-muted)" }}>Chargement…</div>}
      {rows && (
        <div style={{ maxHeight: "68vh", overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Compte</th>
                <th style={th}>Référence</th>
                <th style={th}>Libellé</th>
                <th style={{ ...th, textAlign: "right" }}>Débit</th>
                <th style={{ ...th, textAlign: "right" }}>Crédit</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={`${r.entryId}-${i}`}>
                  <td style={td}>{r.date}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{r.accountCode}</td>
                  <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{r.reference}</td>
                  <td style={td}>{r.label || r.description}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}>{r.debit ? money(r.debit) : ""}</td>
                  <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}>{r.credit ? money(r.credit) : ""}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ ...td, fontWeight: 700 }} colSpan={4}>Total</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{money(totals.debit)}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{money(totals.credit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
