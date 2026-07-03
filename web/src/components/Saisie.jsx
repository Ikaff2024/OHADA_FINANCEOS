import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";

const money = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));

const emptyLine = () => ({ accountCode: "", label: "", debit: "", credit: "" });
const today = () => new Date().toISOString().slice(0, 10);

export default function Saisie() {
  const [accounts, setAccounts] = useState([]);
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState([emptyLine(), emptyLine()]);
  const [message, setMessage] = useState(null); // { type, text }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/accounts")
      .then((rows) => setAccounts((rows || []).filter((a) => a.isPostable !== false)))
      .catch(() => setAccounts([]));
  }, []);

  const accountLabel = useMemo(() => {
    const map = new Map(accounts.map((a) => [a.code, a.label]));
    return (code) => map.get(code) || "";
  }, [accounts]);

  const totals = lines.reduce(
    (t, l) => ({ debit: t.debit + (Number(l.debit) || 0), credit: t.credit + (Number(l.credit) || 0) }),
    { debit: 0, credit: 0 }
  );
  const balanced = totals.debit === totals.credit && totals.debit > 0;

  function updateLine(index, field, value) {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, [field]: value };
        if (field === "accountCode") next.label = accountLabel(value) || next.label;
        return next;
      })
    );
  }

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const payload = {
      date,
      reference,
      description,
      source: "manual",
      lines: lines
        .filter((l) => l.accountCode && (Number(l.debit) || Number(l.credit)))
        .map((l) => ({
          accountCode: l.accountCode.trim(),
          label: l.label || description,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0
        }))
    };
    try {
      await api("/api/journal-entries", { method: "POST", body: payload });
      setMessage({ type: "success", text: "Écriture enregistrée." });
      setLines([emptyLine(), emptyLine()]);
      setReference("");
      setDescription("");
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Écriture refusée." });
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = { padding: "8px 10px", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 13, width: "100%" };
  const numStyle = { ...inputStyle, textAlign: "right", fontFamily: "var(--font-mono)" };

  return (
    <form className="card" onSubmit={onSubmit} style={{ display: "grid", gap: 18 }}>
      <datalist id="accounts-list">
        {accounts.map((a) => (
          <option key={a.code} value={a.code}>
            {a.code} — {a.label}
          </option>
        ))}
      </datalist>

      <div style={{ display: "grid", gridTemplateColumns: "160px 200px 1fr", gap: 12 }}>
        <label style={{ display: "grid", gap: 5, fontSize: 12 }}>
          Date
          <input style={inputStyle} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 12 }}>
          Référence
          <input style={inputStyle} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ex: VTE-001" required />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 12 }}>
          Libellé
          <input style={inputStyle} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description de l'opération" required />
        </label>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 130px 130px 36px", gap: 8, fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.4px" }}>
          <span>Compte</span><span>Libellé ligne</span><span style={{ textAlign: "right" }}>Débit</span><span style={{ textAlign: "right" }}>Crédit</span><span />
        </div>
        {lines.map((line, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr 130px 130px 36px", gap: 8, alignItems: "center" }}>
            <input style={inputStyle} list="accounts-list" value={line.accountCode} onChange={(e) => updateLine(i, "accountCode", e.target.value)} placeholder="Compte" />
            <input style={inputStyle} value={line.label} onChange={(e) => updateLine(i, "label", e.target.value)} placeholder={accountLabel(line.accountCode) || "Libellé"} />
            <input style={numStyle} type="number" min="0" value={line.debit} onChange={(e) => updateLine(i, "debit", e.target.value)} placeholder="0" />
            <input style={numStyle} type="number" min="0" value={line.credit} onChange={(e) => updateLine(i, "credit", e.target.value)} placeholder="0" />
            <button type="button" onClick={() => setLines((p) => (p.length > 2 ? p.filter((_, j) => j !== i) : p))} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-text-faint)" }} title="Supprimer">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setLines((p) => [...p, emptyLine()])} style={{ justifySelf: "start" }}>
          <Plus size={15} /> Ajouter une ligne
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--color-border)", paddingTop: 14 }}>
        <div style={{ fontSize: 13 }}>
          Total débit <strong style={{ fontFamily: "var(--font-mono)" }}>{money(totals.debit)}</strong> ·{" "}
          Total crédit <strong style={{ fontFamily: "var(--font-mono)" }}>{money(totals.credit)}</strong>{" "}
          <span style={{ marginLeft: 8, color: balanced ? "var(--color-success)" : "var(--color-danger)", fontWeight: 600 }}>
            {balanced ? "✓ équilibrée" : `écart ${money(totals.debit - totals.credit)}`}
          </span>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy || !balanced}>
          {busy ? "Enregistrement…" : "Enregistrer l'écriture"}
        </button>
      </div>

      {message && (
        <div style={{ fontSize: 13, color: message.type === "error" ? "var(--color-danger)" : "var(--color-success)" }}>
          {message.text}
        </div>
      )}
    </form>
  );
}
