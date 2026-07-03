import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login.jsx";
import Dashboard from "./components/Dashboard.jsx";
import Saisie from "./components/Saisie.jsx";
import Journal from "./components/Journal.jsx";
import GrandLivre from "./components/GrandLivre.jsx";
import PlanComptable from "./components/PlanComptable.jsx";
import Parametres from "./components/Parametres.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AppShell from "./components/AppShell.jsx";
import LiasseApp from "./components/LiasseApp.jsx";

function Shielded({ title, children }) {
  return (
    <ProtectedRoute>
      <AppShell title={title}>{children}</AppShell>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Shielded title="Tableau de bord"><Dashboard /></Shielded>} />
      <Route path="/saisie" element={<Shielded title="Saisie d'écritures"><Saisie /></Shielded>} />
      <Route path="/journal" element={<Shielded title="Journal des écritures"><Journal /></Shielded>} />
      <Route path="/grand-livre" element={<Shielded title="Grand livre"><GrandLivre /></Shielded>} />
      <Route path="/plan-comptable" element={<Shielded title="Plan comptable SYSCOHADA"><PlanComptable /></Shielded>} />
      <Route path="/parametres" element={<Shielded title="Paramètres de l'entreprise"><Parametres /></Shielded>} />
      <Route
        path="/liasse"
        element={
          <ProtectedRoute>
            <LiasseApp />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
