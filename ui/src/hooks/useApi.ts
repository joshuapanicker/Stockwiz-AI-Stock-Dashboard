import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

// In production, API calls go to the deployed backend URL.
// In development, Vite proxies /api to localhost:8000.
const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : "/api";

export const API_BASE = BASE;

// Token is set by AuthContext via setAuthToken() when session is established
let _cachedToken: string | null = null;

export function setAuthToken(token: string | null) {
  _cachedToken = token;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_cachedToken) headers["Authorization"] = `Bearer ${_cachedToken}`;

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  return res.json() as Promise<T>;
}

export function useScreener() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<any[]>("/screen");
      setData(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { run(); }, [run]);

  return { data, loading, error, refresh: run };
}

export function usePriceHistory(symbol: string | null, period = "1y") {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    apiFetch<any[]>(`/history/${symbol}?period=${period}`)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [symbol, period]);

  return { data, loading };
}

export function usePortfolio() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<any[]>("/portfolio");
      setData(result);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addHolding = useCallback(async (symbol: string, buy_date: string, buy_price?: number, notes?: string) => {
    // Retry once if we get 401 — token may still be initializing
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await apiFetch("/portfolio", {
          method: "POST",
          body: JSON.stringify({ symbol, buy_date, buy_price, notes }),
        });
        await load();
        return;
      } catch (e: any) {
        if (attempt === 0 && e.message?.includes("401")) {
          // Token wasn't ready — wait 600ms and get a fresh one
          await new Promise(r => setTimeout(r, 600));
          const { data } = await supabase.auth.getSession();
          setAuthToken(data.session?.access_token ?? null);
        } else {
          throw e;
        }
      }
    }
  }, [load]);

  const removeHolding = useCallback(async (symbol: string) => {
    await apiFetch(`/portfolio/${symbol}`, { method: "DELETE" });
    await load();
  }, [load]);

  return { data, loading, refresh: load, addHolding, removeHolding };
}

export function useAnalysis(symbol: string | null, action: string | null) {
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const prevRef = useRef<string>("");

  useEffect(() => {
    if (!symbol || !action) return;
    const key = `${symbol}:${action}`;
    if (prevRef.current === key) return;
    prevRef.current = key;
    setLoading(true);
    setData(null);
    setError(null);
    const timer = setTimeout(() => {
      apiFetch<any>(`/analyze/${symbol}?action=${action}`)
        .then(d => { setData(d); setLoading(false); })
        .catch(e => { setError(e.message); setLoading(false); });
    }, 300);
    return () => {
      clearTimeout(timer);
      // Reset so re-entry always fetches
      prevRef.current = "";
    };
  }, [symbol, action]);

  return { data, error, loading };
}

export function useMarket() {
  const [data, setData] = useState<any | null>(null);

  useEffect(() => {
    apiFetch<any>("/market").then(setData).catch(() => {});
  }, []);

  return data;
}

export function useProfile() {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    apiFetch<any>("/profile")
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(async (profile: any) => {
    const updated = await apiFetch<any>("/profile", {
      method: "PUT",
      body: JSON.stringify(profile),
    });
    setData(updated);
    return updated;
  }, []);

  return { data, loading, refresh, save };
}

export function useNewsData(symbol: string | null) {
  const [data, setData] = useState<{ headlines: any[]; earnings: any | null } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setData(null);
    apiFetch<any>(`/news/${symbol}`)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [symbol]);

  return { data, loading };
}

export function useAlerts() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    apiFetch<any[]>("/alerts")
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const createAlert = useCallback(async (symbol: string, alert_type: string, threshold?: number) => {
    await apiFetch("/alerts", { method: "POST", body: JSON.stringify({ symbol, alert_type, threshold }) });
    await load();
  }, [load]);

  const deleteAlert = useCallback(async (id: string) => {
    await apiFetch(`/alerts/${id}`, { method: "DELETE" });
    await load();
  }, [load]);

  const toggleAlert = useCallback(async (id: string, enabled: boolean) => {
    await apiFetch(`/alerts/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
    await load();
  }, [load]);

  const checkAlerts = useCallback(async () => {
    return apiFetch<any[]>("/alerts/check", { method: "POST" });
  }, []);

  return { data, loading, refresh: load, createAlert, deleteAlert, toggleAlert, checkAlerts };
}

export function useUniverseSignals() {  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    apiFetch<any[]>("/universe/signals?limit=60")
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, refresh };
}

export function useUniverseStatus() {  const [data, setData] = useState<any | null>(null);

  const refresh = useCallback(() => {
    apiFetch<any>("/universe/status").then(setData).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return data;
}

export function useUniverseSectors() {
  const [data, setData] = useState<string[]>([]);

  useEffect(() => {
    apiFetch<string[]>("/universe/sectors").then(setData).catch(() => {});
  }, []);

  return data;
}

export { apiFetch };
