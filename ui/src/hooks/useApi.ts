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

/** Auth headers for raw fetch calls (SSE streams) that bypass apiFetch. */
export function getAuthHeaders(): Record<string, string> {
  return _cachedToken ? { Authorization: `Bearer ${_cachedToken}` } : {};
}

export interface ApiError extends Error {
  code?: string;
  status?: number;
}

export const CREDITS_EXHAUSTED_MESSAGE =
  "You've used all your free AI credits for this month. Add your own Anthropic API key in Settings → AI Credits to keep using AI features.";

/** Parse a non-ok response body into a friendly Error with .code/.status set. */
export async function parseApiError(res: Response): Promise<ApiError> {
  const raw = await res.text();
  let message = raw || res.statusText;
  let code: string | undefined;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.detail) message = parsed.detail;
    if (parsed?.code) code = parsed.code;
  } catch { /* not JSON — use raw text */ }
  const err = new Error(message) as ApiError;
  err.code = code;
  err.status = res.status;
  return err;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_cachedToken) headers["Authorization"] = `Bearer ${_cachedToken}`;

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers ?? {}) },
  });
  if (!res.ok) throw await parseApiError(res);
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
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Ensure we have a fresh token before loading
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.access_token) {
      setAuthToken(sessionData.session.access_token);
    }
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

  const addHolding = useCallback(async (symbol: string, buy_date: string, buy_price?: number, shares?: number, notes?: string) => {
    setAddError(null);
    // Always refresh token before a mutating call
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.access_token) {
      setAuthToken(sessionData.session.access_token);
    }
    try {
      await apiFetch("/portfolio", {
        method: "POST",
        body: JSON.stringify({ symbol, buy_date, buy_price, shares: shares ?? 1, notes }),
      });
      await load();
    } catch (e: any) {
      setAddError(e.message ?? "Failed to add holding");
      throw e;
    }
  }, [load]);

  const removeHolding = useCallback(async (symbol: string) => {
    await apiFetch(`/portfolio/${encodeURIComponent(symbol)}`, { method: "DELETE" });
    // Optimistically remove from local state immediately, then reload in background
    setData(prev => prev.filter((h: any) => h.symbol !== symbol));
    load(); // background refresh (don't await — don't block UI)
  }, [load]);

  const removeHoldings = useCallback(async (symbols: string[]) => {
    if (!symbols.length) return;
    // Optimistically remove all from local state immediately
    setData(prev => prev.filter((h: any) => !symbols.includes(h.symbol)));
    // Fire all deletes in parallel
    await Promise.allSettled(
      symbols.map(s => apiFetch(`/portfolio/${encodeURIComponent(s)}`, { method: "DELETE" }))
    );
    load(); // background refresh
  }, [load]);

  const sellHolding = useCallback(async (symbol: string, sellPrice: number, sellDate?: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.access_token) {
      setAuthToken(sessionData.session.access_token);
    }
    await apiFetch(`/portfolio/${encodeURIComponent(symbol)}/sell`, {
      method: "POST",
      body: JSON.stringify({
        sell_price: sellPrice,
        sell_date: sellDate ?? new Date().toISOString().slice(0, 10),
      }),
    });
    // Immediately remove from active holdings in local state
    setData(prev => prev.filter((h: any) => h.symbol !== symbol));
    // Notify sold positions listeners to refresh
    window.dispatchEvent(new CustomEvent("stockwiz:sold"));
    load();
  }, [load]);

  return { data, loading, refresh: load, addHolding, removeHolding, removeHoldings, sellHolding, addError };
}

export function useAnalysis(symbol: string | null, action: string | null, gainPct?: number | null) {
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const prevRef = useRef<string>("");

  useEffect(() => {
    if (!symbol || !action) return;
    const key = `${symbol}:${action}:${gainPct ?? ""}`;
    if (prevRef.current === key) return;
    prevRef.current = key;
    setLoading(true);
    setData(null);
    setError(null);
    // gain_pct lets the backend evaluate position-dependent rules (e.g.
    // "gained more than 40%") identically to the portfolio sell signals
    const gainParam = gainPct != null ? `&gain_pct=${gainPct}` : "";
    const timer = setTimeout(() => {
      apiFetch<any>(`/analyze/${symbol}?action=${action}${gainParam}`)
        .then(d => { setData(d); setLoading(false); })
        .catch(e => { setError(e.message); setLoading(false); });
    }, 300);
    return () => {
      clearTimeout(timer);
      // Reset so re-entry always fetches
      prevRef.current = "";
    };
  }, [symbol, action, gainPct]);

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

export interface CreditsStatus {
  has_own_key: boolean;
  unlimited: boolean;
  metered: boolean;
  tokens_used: number;
  token_limit: number;
  remaining: number;
  pct_used: number;
  warning: boolean;
  exhausted: boolean;
  period: string;
}

export function useCredits() {
  const [data, setData] = useState<CreditsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<CreditsStatus>("/credits");
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const setKey = useCallback(async (apiKey: string) => {
    setKeyError(null);
    setSavingKey(true);
    try {
      const result = await apiFetch<CreditsStatus>("/credits/key", {
        method: "POST",
        body: JSON.stringify({ api_key: apiKey }),
      });
      setData(result);
      return true;
    } catch (e: any) {
      setKeyError(e.message ?? "Failed to save key");
      return false;
    } finally {
      setSavingKey(false);
    }
  }, []);

  const removeKey = useCallback(async () => {
    const result = await apiFetch<CreditsStatus>("/credits/key", { method: "DELETE" });
    setData(result);
  }, []);

  return { data, loading, refresh, setKey, removeKey, keyError, savingKey };
}

export function useSoldPositions() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.access_token) {
      setAuthToken(sessionData.session.access_token);
    }
    apiFetch<any[]>("/portfolio/sold")
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setData([]); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Re-fetch whenever a sell completes in usePortfolio
  useEffect(() => {
    window.addEventListener("stockwiz:sold", load);
    return () => window.removeEventListener("stockwiz:sold", load);
  }, [load]);

  return { data, loading, refresh: load };
}
