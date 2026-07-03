import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FilePlus,
  BookOpen,
  ListTree,
  Library,
  FileSpreadsheet,
  Settings,
  Landmark,
  LogOut
} from "lucide-react";
import { useAuth } from "../hooks/useAuth.jsx";
import ChatWidget from "./ChatWidget.jsx";

const NAV = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/saisie", label: "Saisie d'écritures", icon: FilePlus },
  { to: "/journal", label: "Journal", icon: BookOpen },
  { to: "/grand-livre", label: "Grand livre", icon: Library },
  { to: "/plan-comptable", label: "Plan comptable", icon: ListTree },
  { to: "/liasse", label: "Liasse fiscale", icon: FileSpreadsheet },
  { to: "/parametres", label: "Paramètres", icon: Settings }
];

export default function AppShell({ title, children }) {
  const { user, organization, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "248px 1fr", minHeight: "100vh" }}>
      <aside
        style={{
          background: "var(--color-primary)",
          color: "#fff",
          padding: "22px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 4
        }}
      >
        <div style={{ padding: "0 10px 18px" }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>OHADA FinanceOS</div>
          <div style={{ fontSize: 11, color: "var(--color-accent-light)", letterSpacing: "0.5px" }}>
            COMPTABILITÉ SYSCOHADA
          </div>
        </div>

        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                background: isActive ? "rgba(255,255,255,0.14)" : "transparent"
              })}
            >
              <Icon size={17} /> {item.label}
            </NavLink>
          );
        })}

        <a
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            borderRadius: "var(--radius-md)",
            color: "var(--color-accent-light)",
            fontSize: 13,
            fontWeight: 600,
            marginTop: 4
          }}
        >
          <Landmark size={16} /> Comptabilité complète
        </a>

        <div style={{ marginTop: "auto", padding: "12px 10px 0", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{user?.name || user?.email}</div>
          <div style={{ fontSize: 11, color: "var(--color-accent-light)" }}>
            {organization?.name || "—"}
          </div>
          <button
            className="btn"
            type="button"
            onClick={onLogout}
            style={{ marginTop: 10, width: "100%", background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,0.25)" }}
          >
            <LogOut size={15} /> Déconnexion
          </button>
        </div>
      </aside>

      <main style={{ padding: "26px 32px", maxWidth: 1100 }}>
        {title && (
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--color-primary)", marginBottom: 20 }}>
            {title}
          </h1>
        )}
        {children}
      </main>
      <ChatWidget />
    </div>
  );
}
