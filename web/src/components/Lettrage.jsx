import { useEffect, useMemo, useState } from "react";
import { Wand2 } from "lucide-react";
import { api } from "../lib/api.js";

const money = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

const th = { textAlign: "left", padding: "8px 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border)" };
const td = { padding: "7px 10px", fontSize: 13, borderBottom: "1px solid var(--color-border)" };

export default function Lettrage() {
  const [accountCode, setAccountCode] = useState("411");
  const [state, setState] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load(code = accountCode) {
    setState(null);
    setSelected(new Set());
    try {
      setState(await api(`/api/lettering?accountCode=${encodeURIComponent(code.trim())}`));
    } catch {
      setState({ rows: [], groups: [] });
    }
  }

  useEffect(() => {
    load("411");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const letteredRefs = useMemo(() => {
    const set = new Set();
    (state?.groups || []).forEach((g) => (g.lineRefs || []).forEach((r) => set.add(r)));
    return set;
  }, [state]);

  const codeByRef = useMemo(() => {
    const map = new Map();
    (state?.groups || []).forEach((g) => (g.lineRefs || []).forEach((r) => map.set(r, g.code)));
    return map;
  }, [state]);

  function toggle(ref) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ref)) next.delete(ref);
      else next.add(ref);
      return next;
    });
  }

  async function act(kind) {
    setBusy(true);
    setMessage(null);
    try {
      if (kind === "manual") {
        await api("/api/lettering/manual", { method: "POST", body: { accountCode: accountCode.trim(), lineRefs: [...selected] } });
      } else {
        await api("/api/lettering/auto", { method: "POST", body: { accountCode: accountCode.trim() } });
      }
      setMessage({ type: "success", text: kind === "manual" ? "Lignes lettrées." : "Lettrage automatique effectué." });
      await load();
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Lettrage refusé." });
    } finally {
      setBusy(false);
    }
  }

  const rows = state?.rows || [];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: 5, fontSize: 12 }}>
          Compte (ex: 411 clients, 401 fournisseurs)
          <input className="input" value={accountCode} onChange={(e) => setAccountCode(e.target.value)} style={{ width: 220 }} />
        </label>
        <button type="button" className="btn" onClick={() => load()}>Afficher</button>
        <button type="button" className="btn" onClick={() => act("auto")} disabled={busy}>
          <Wand2 size={15} /> Lettrage automatique
        </button>
        <button type="button" className="btn btn-primary" onClick={() => act("manual")} disabled={busy || selected.size < 2}>
          Lettrer la sélection ({selected.size})
        </button>
      </div>

      {message && (
        <div className="card" style={{ fontSize: 13, color: message.type === "error" ? "var(--color-danger)" : "var(--color-success)" }}>
          {message.text}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {!state && <div style={{ padding: 24, color: "var(--color-text-muted)" }}>Chargement…</div>}
        {state && (
          <div style={{ maxHeight: "62vh", overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th} />
                  <th style={th}>Date</th>
                  <th style={th}>Référence</th>
                  <th style={th}>Libellé</th>
                  <th style={{ ...th, textAlign: "right" }}>Débit</th>
                  <th style={{ ...th, textAlign: "right" }}>Crédit</th>
                  <th style={th}>Lettrage</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const lettered = letteredRefs.has(r.lineRef);
                  return (
                    <tr key={r.lineRef} style={{ background: lettered ? "var(--color-bg)" : "transparent" }}>
                      <td style={td}>
                        {!lettered && (
                          <input type="checkbox" checked={selected.has(r.lineRef)} onChange={() => toggle(r.lineRef)} />
                        )}
                      </td>
                      <td style={td}>{r.date}</td>
                      <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{r.reference}</td>
                      <td style={td}>{r.label || r.description}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}>{r.debit ? money(r.debit) : ""}</td>
                      <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}>{r.credit ? money(r.credit) : ""}</td>
                      <td style={{ ...td, fontWeight: 700, color: "var(--color-accent)" }}>{codeByRef.get(r.lineRef) || ""}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td style={{ ...td, color: "var(--color-text-muted)" }} colSpan={7}>Aucune ligne pour ce compte.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
