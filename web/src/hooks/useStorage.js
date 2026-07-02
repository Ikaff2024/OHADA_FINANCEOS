import { useState, useEffect, useCallback } from "react";
import { getDefaultData } from "../data/defaultData.js";
import { api } from "../lib/api.js";

/**
 * Persistance de la liasse via l'API OHADA (`/api/liasse`), scoping par
 * organisation géré côté serveur (en-tête x-organization-id). Remplace la
 * version Supabase d'AuthNTIC — même signature, les modules ne changent pas.
 */
export function useStorage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await api("/api/liasse");
        const defaults = getDefaultData();
        if (!cancelled) setData(result?.data ? { ...defaults, ...result.data } : defaults);
      } catch (error) {
        console.error("[OHADA] Erreur chargement liasse:", error);
        if (!cancelled) setData(getDefaultData());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (newData) => {
    setData(newData);
    try {
      await api("/api/liasse", { method: "PUT", body: { data: newData } });
    } catch (error) {
      console.error("[OHADA] Erreur sauvegarde liasse:", error);
    }
  }, []);

  const reset = useCallback(async () => {
    const fresh = getDefaultData();
    setData(fresh);
    try {
      await api("/api/liasse", { method: "PUT", body: { data: fresh } });
    } catch (error) {
      console.error("[OHADA] Erreur reset liasse:", error);
    }
  }, []);

  return { data, save, reset, loading };
}
