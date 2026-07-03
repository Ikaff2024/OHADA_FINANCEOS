import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "../lib/api.js";

const th = { textAlign: "left", padding: "9px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.4px", color: "var(--color-text-muted)", borderBottom: "1px solid var(--color-border)" };
const td = { padding: "8px 12px", fontSize: 13, borderBottom: "1px solid var(--color-border)", verticalAlign: "top" };

export default function Audit() {
  const [events, setEvents] = useState(null);
  const [integrity, setIntegrity] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    api("/api/audit-events")
      .then((rows) => setEvents(Array.isArray(rows) ? rows : []))
      .catch(() => setEvents([]));
  }, []);

  async function verify() {
    setChecking(true);
    setIntegrity(null);
    try {
      setIntegrity(await api("/api/audit-events/verify"));
    } catch {
      setIntegrity({ ok: false, reason: "erreur" });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          Journal d'audit infalsifiable (chaîne de hachage). Vérifiez que rien n'a été altéré.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {integrity && (
            <span style={{ fontWeight: 600, fontSize: 13, color: integrity.ok ? "var(--color-success)" : "var(--color-danger)" }}>
              {integrity.ok ? `✓ Intègre (${integrity.count} événements)` : "⚠ Chaîne altérée"}
            </span>
          )}
          <button type="button" className="btn" onClick={verify} disabled={checking}>
            <ShieldCheck size={16} /> {checking ? "Vérification…" : "Vérifier l'intégrité"}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {!events && <div style={{ padding: 24, color: "var(--color-text-muted)" }}>Chargement…</div>}
        {events && (
          <div style={{ maxHeight: "66vh", overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Date</th>
                  <th style={th}>Acteur</th>
                  <th style={th}>Action</th>
                  <th style={th}>Résumé</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td style={{ ...td, whiteSpace: "nowrap", color: "var(--color-text-muted)" }}>
                      {String(e.createdAt).replace("T", " ").slice(0, 16)}
                    </td>
                    <td style={td}>{e.actor}</td>
                    <td style={{ ...td, fontFamily: "var(--font-mono)", fontSize: 12 }}>{e.action}</td>
                    <td style={td}>{e.summary}</td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr>
                    <td style={{ ...td, color: "var(--color-text-muted)" }} colSpan={4}>Aucun événement.</td>
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
