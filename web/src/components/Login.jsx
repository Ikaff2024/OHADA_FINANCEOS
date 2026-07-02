import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@demo.ohada");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Identifiants invalides.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 24 }}>
      <form
        className="card"
        onSubmit={onSubmit}
        style={{ width: "min(400px, 100%)", display: "grid", gap: 16 }}
      >
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, color: "var(--color-primary)" }}>
            OHADA FinanceOS
          </div>
          <div style={{ color: "var(--color-text-muted)", fontSize: 14, marginTop: 4 }}>
            Connexion au dossier comptable
          </div>
        </div>
        <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
          Email
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
          Mot de passe
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <div style={{ color: "var(--color-danger)", fontSize: 13 }}>{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}
