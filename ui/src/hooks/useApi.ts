import { useCallback, useEffect, useRef, useState } from "react";

const BASE = "/api";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
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

  useEffect(() => { load(); }, [load]);

  const addHolding = useCallback(async (symbol: string, buy_date: string, buy_price?: number, notes?: string) => {
    await apiFetch("/portfolio", {
      method: "POST",
      body: JSON.stringify({ symbol, buy_date, buy_price, notes }),
    });
    await load();
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

export { apiFetch };
