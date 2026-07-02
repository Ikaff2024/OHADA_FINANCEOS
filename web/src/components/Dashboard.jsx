import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileSpreadsheet, ArrowRight, LogOut, Landmark } from "lucide-react";
import { useAuth } from "../hooks/useAuth.jsx";
import { api } from "../lib/api.js";

const money = (n) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
    .format(Math.round(Number(n) || 0))
    .replace(/ | /g, " ");

function sumByClass(rows, prefix, natural) {
  return rows
    .filter((r) => String(r.code).startsWith(prefix))
    .reduce((acc, r) => acc + (natural === "credit" ? r.credit - r.debit : r.debit - r.credit), 0);
}

export default function Dashboard() {
  const { user, organization, logout } = useAuth();
  const navigate = useNavigate();
  const [kpis, setKpis] = useState(null);

  useEffect(() => {
    api("/api/reports/trial-balance")
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setKpis({
          cash: sumByClass(list, "5", "debit"),
          revenue: sumByClass(list, "7", "credit"),
          expenses: sumByClass(list, "6", "debit")
        });
      })
      .catch(() => setKpis({ cash: 0, revenue: 0, expenses: 0 }));
  }, []);

  async function onLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 32, display: "grid", gap: 20 }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {[
          { label: "Trésorerie", value: kpis?.cash, hint: "Comptes de classe 5" },
          { label: "Chiffre d'affaires", value: kpis?.revenue, hint: "Comptes de classe 7" },
          { label: "Charges", value: kpis?.expenses, hint: "Comptes de classe 6" }
        ].map((kpi) => (
          <div key={kpi.label} className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 600 }}>
              {kpi.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6, color: "var(--color-primary)" }}>
              {kpis ? `${money(kpi.value)} ` : "…"}
              <span style={{ fontSize: 13, color: "var(--color-text-faint)" }}>
                {organization?.currency || "XOF"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-faint)", marginTop: 2 }}>
              {kpi.hint}
            </div>
          </div>
        ))}
      </div>

      <button
        className="card"
        type="button"
        onClick={() => navigate("/liasse")}
        style={{ display: "flex", alignItems: "center", gap: 16, textAlign: "left", cursor: "pointer" }}
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

      <a
        className="card"
        href="/"
        style={{ display: "flex", alignItems: "center", gap: 16, textAlign: "left" }}
      >
        <Landmark size={28} color="var(--color-accent)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>Comptabilité complète</div>
          <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
            Saisie d'écritures, journal, imports bancaires, lettrage, assistant IA.
            (En cours de portage vers cette nouvelle interface.)
          </div>
        </div>
        <ArrowRight size={20} color="var(--color-text-muted)" />
      </a>
    </div>
  );
}
