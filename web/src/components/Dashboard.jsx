import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, LogOut, FileSpreadsheet, ArrowRight } from "lucide-react";
import { useAuth } from "../hooks/useAuth.jsx";
import { api } from "../lib/api.js";

export default function Dashboard() {
  const { user, organization, logout } = useAuth();
  const navigate = useNavigate();
  const [company, setCompany] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/company")
      .then(setCompany)
      .catch((err) => setError(err.message));
  }, []);

  async function onLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: 32, display: "grid", gap: 20 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, color: "var(--color-primary)" }}>
            OHADA FinanceOS
          </div>
          <div style={{ color: "var(--color-text-muted)", fontSize: 14 }}>
            {user?.name || user?.email} · {organization?.name || "—"}
          </div>
        </div>
        <button className="btn" type="button" onClick={onLogout}>
          <LogOut size={16} /> Déconnexion
        </button>
      </header>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CheckCircle2 color="var(--color-success)" size={22} />
          <strong>Socle React + Vite opérationnel</strong>
        </div>
        <p style={{ color: "var(--color-text-muted)", fontSize: 14, lineHeight: 1.6 }}>
          Le nouveau frontend est connecté à l'API OHADA existante (authentification
          par jeton, contexte organisation). Prochaine étape : intégrer les modules
          d'états SYSCOHADA et porter les vues métier.
        </p>
        {error && <div style={{ color: "var(--color-danger)", fontSize: 13 }}>API : {error}</div>}
        {company && (
          <div style={{ fontSize: 14 }}>
            Société : <strong>{company.name}</strong> — {company.country} · {company.currency} ·
            Exercice {String(company.fiscalYearStart).slice(0, 4)}
          </div>
        )}
      </div>

      <button
        className="card"
        type="button"
        onClick={() => navigate("/liasse")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          textAlign: "left",
          cursor: "pointer",
          border: "1px solid var(--color-border)"
        }}
      >
        <FileSpreadsheet size={28} color="var(--color-primary)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Liasse fiscale SYSCOHADA</div>
          <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
            Bilan, compte de résultat, TAFIRE, flux, notes, contrôles.
          </div>
        </div>
        <ArrowRight size={20} color="var(--color-text-muted)" />
      </button>
    </div>
  );
}
