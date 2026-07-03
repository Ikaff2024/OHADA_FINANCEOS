import { useState } from "react";
import { Upload, FileDown, CheckCircle2 } from "lucide-react";
import { api, apiText } from "../lib/api.js";

const money = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

const th = { textAlign: "left", padding: "8px 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border)" };
const td = { padding: "8px 10px", fontSize: 13, borderBottom: "1px solid var(--color-border)" };

export default function Imports() {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function loadSample() {
    try {
      setCsv(await apiText("/api/bank-imports/sample"));
      setPreview(null);
      setMessage(null);
    } catch {
      setMessage({ type: "error", text: "Impossible de charger l'exemple." });
    }
  }

  function onFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result || ""));
      setPreview(null);
    };
    reader.readAsText(file);
  }

  async function runPreview() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api("/api/bank-imports/preview", { method: "POST", body: { csv } });
      setPreview(result);
    } catch (err) {
      setPreview(err.payload || { ok: false, errors: [err.message], transactions: [] });
    } finally {
      setBusy(false);
    }
  }

  function editAccount(id, accountCode) {
    setPreview((p) => ({
      ...p,
      transactions: p.transactions.map((t) => (t.id === id ? { ...t, accountCode } : t))
    }));
  }

  async function commit() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api("/api/bank-imports/commit", {
        method: "POST",
        body: { csv, transactions: preview.transactions }
      });
      setMessage({ type: "success", text: `Import validé : ${result.importedCount ?? ""} écriture(s) créée(s).` });
      setPreview(null);
      setCsv("");
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Import refusé." });
    } finally {
      setBusy(false);
    }
  }

  const importable = (preview?.transactions || []).filter((t) => !t.duplicate).length;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" className="btn" onClick={loadSample}>
            <FileDown size={15} /> Charger un exemple
          </button>
          <label className="btn" style={{ cursor: "pointer" }}>
            <Upload size={15} /> Choisir un fichier CSV
            <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} />
          </label>
        </div>
        <textarea
          className="input"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder="date,description,amount&#10;2026-02-04,Virement recu client,850000"
          style={{ minHeight: 120, fontFamily: "var(--font-mono)", fontSize: 12 }}
        />
        <button type="button" className="btn btn-primary" onClick={runPreview} disabled={busy || !csv.trim()} style={{ justifySelf: "start" }}>
          {busy ? "Analyse…" : "Analyser le relevé"}
        </button>
      </div>

      {preview && !preview.ok && (
        <div className="card" style={{ color: "var(--color-danger)", fontSize: 13 }}>
          {(preview.errors || []).map((e, i) => (
            <div key={i}>• {e}</div>
          ))}
        </div>
      )}

      {preview && preview.ok && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Libellé</th>
                  <th style={{ ...th, textAlign: "right" }}>Montant</th>
                  <th style={th}>Sens</th>
                  <th style={th}>Compte suggéré</th>
                  <th style={th}>État</th>
                </tr>
              </thead>
              <tbody>
                {preview.transactions.map((t) => (
                  <tr key={t.id} style={{ opacity: t.duplicate ? 0.5 : 1 }}>
                    <td style={td}>{t.date}</td>
                    <td style={td}>{t.description}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: "var(--font-mono)" }}>{money(t.amount)}</td>
                    <td style={td}>{t.direction === "credit" ? "Encaissement" : "Décaissement"}</td>
                    <td style={td}>
                      <input
                        value={t.accountCode}
                        onChange={(e) => editAccount(t.id, e.target.value)}
                        style={{ width: 90, padding: "4px 6px", border: "1px solid var(--color-border)", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 12 }}
                      />
                    </td>
                    <td style={td}>
                      {t.duplicate ? (
                        <span style={{ color: "var(--color-warning)", fontSize: 12 }}>Doublon</span>
                      ) : (
                        <span style={{ color: "var(--color-success)", fontSize: 12 }}>À importer</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 14, borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{importable} écriture(s) à importer</span>
            <button type="button" className="btn btn-primary" onClick={commit} disabled={busy || importable === 0}>
              <CheckCircle2 size={16} /> Valider l'import
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="card" style={{ fontSize: 13, color: message.type === "error" ? "var(--color-danger)" : "var(--color-success)" }}>
          {message.text}
        </div>
      )}
    </div>
  );
}
