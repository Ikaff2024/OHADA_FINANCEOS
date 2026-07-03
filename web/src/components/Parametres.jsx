import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

const FIELDS = [
  { key: "name", label: "Raison sociale", required: true, ph: "Ex: NEXUX INDUSTRIE" },
  { key: "sigle", label: "Sigle", ph: "Ex: NEX-ID" },
  { key: "nif", label: "NIF (identifiant fiscal)", ph: "Ex: 072584C" },
  { key: "legalForm", label: "Forme juridique", ph: "Ex: SARL" },
  { key: "country", label: "Pays (code)", required: true, ph: "Ex: CI", maxLength: 3 },
  { key: "currency", label: "Devise (code)", required: true, ph: "Ex: XOF", maxLength: 3 },
  { key: "fiscalYearStart", label: "Début d'exercice", type: "date", required: true },
  { key: "fiscalYearEnd", label: "Fin d'exercice", type: "date", required: true }
];

export default function Parametres() {
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/api/company")
      .then((c) =>
        setForm({
          name: c.name || "",
          sigle: c.sigle || "",
          nif: c.nif || "",
          legalForm: c.legalForm || "",
          country: c.country || "",
          currency: c.currency || "",
          fiscalYearStart: c.fiscalYearStart || "",
          fiscalYearEnd: c.fiscalYearEnd || ""
        })
      )
      .catch(() => setForm({ name: "", sigle: "", nif: "", legalForm: "", country: "", currency: "", fiscalYearStart: "", fiscalYearEnd: "" }));
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/company", { method: "PUT", body: form });
      setMessage({ type: "success", text: "Paramètres enregistrés." });
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Paramètres refusés." });
    } finally {
      setBusy(false);
    }
  }

  if (!form) return <div className="card">Chargement…</div>;

  return (
    <form className="card" onSubmit={onSubmit} style={{ display: "grid", gap: 16, maxWidth: 720 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {FIELDS.map((f) => (
          <label key={f.key} style={{ display: "grid", gap: 6, fontSize: 13, gridColumn: f.key === "name" ? "1 / -1" : "auto" }}>
            {f.label}
            {f.required ? " *" : ""}
            <input
              className="input"
              type={f.type || "text"}
              value={form[f.key]}
              maxLength={f.maxLength}
              placeholder={f.ph}
              required={f.required}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  [f.key]:
                    f.maxLength ? e.target.value.toUpperCase() : e.target.value
                }))
              }
            />
          </label>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer les paramètres"}
        </button>
        {message && (
          <span style={{ fontSize: 13, color: message.type === "error" ? "var(--color-danger)" : "var(--color-success)" }}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
