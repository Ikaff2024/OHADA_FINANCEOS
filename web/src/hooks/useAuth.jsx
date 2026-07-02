import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setAuth, clearAuth, getToken } from "../lib/api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [availableOrganizations, setAvailableOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Restore the session on load if a token is present.
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const me = await api("/api/auth/me");
        if (cancelled) return;
        setUser(me.user);
        setOrganization(me.organization);
        setAvailableOrganizations(me.availableOrganizations ?? []);
      } catch {
        clearAuth();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const result = await api("/api/auth/login", { method: "POST", body: { email, password } });
    setAuth(result.token, result.organization?.id);
    setUser(result.user);
    setOrganization(result.organization);
    setAvailableOrganizations(result.availableOrganizations ?? []);
    return result;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    clearAuth();
    setUser(null);
    setOrganization(null);
    setAvailableOrganizations([]);
  }, []);

  const value = { user, organization, availableOrganizations, loading, login, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
