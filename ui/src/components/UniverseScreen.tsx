import { useState, useRef, useEffect, useCallback } from "react";
import clsx from "clsx";
import {
  Send, Bot, Sparkles, RefreshCw, ChevronDown, X,
  TrendingUp, TrendingDown, Database, Filter,
} from "lucide-react";
import { apiFetch, useUniverseStatus, useUniverseSectors } from "../hooks/useApi";
import type { UniverseStock, UniverseFilters, AgentFilterResult } from "../types";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, dec = 2, suffix = "", scale = 1) {
  if (v == null) return <span className="text-muted">—</span>;
  const val = v * scale;
  return <span>{val.toFixed(dec)}{suffix}</span>;
}

function fmtGrowth(v: number | null | undefined) {
  if (v == null) return <span className="text-muted">—</span>;
  const pct = v * 100;
  return (
    <span className={pct >= 0 ? "text-green" : "text-red"}>
      {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function MarketCapBadge({ cap }: { cap: number | null }) {
  if (!cap) return <span className="text-muted text-xs">—</span>;
  if (cap >= 1e12) return <span className="text-xs text-white/70">${(cap / 1e12).toFixed(1)}T</span>;
  if (cap >= 1e9)  return <span className="text-xs text-white/70">${(cap / 1e9).toFixed(1)}B</span>;
  return <span className="text-xs text-white/70">${(cap / 1e6).toFixed(0)}M</span>;
}

function SectorBadge({ sector }: { sector: string | null }) {
  if (!sector) return null;
  const colors: Record<string, string> = {
    "Technology": "bg-blue-500/15 text-blue-400",
    "Healthcare": "bg-green/15 text-green",
    "Financial Services": "bg-yellow-500/15 text-yellow-400",
    "Consumer Cyclical": "bg-orange/15 text-orange",
    "Industrials": "bg-slate-500/15 text-slate-300",
    "Consumer Defensive": "bg-teal-500/15 text-teal-400",
    "Energy": "bg-amber-500/15 text-amber-400",
    "Basic Materials": "bg-stone-500/15 text-stone-300",
    "Real Estate": "bg-pink-500/15 text-pink-400",
    "Communication Services": "bg-purple/15 text-purple-300",
    "Utilities": "bg-cyan-500/15 text-cyan-400",
  };
  const cls = colors[sector] ?? "bg-white/10 text-white/60";
  return (
    <span className={clsx("text-[9px] px-1.5 py-0.5 rounded-full font-medium truncate max-w-[90px]", cls)}>
      {sector}
    </span>
  );
}

// ── Filter pills bar ───────────────────────────────────────────────────────

function FilterPills({ filters, onClear }: { filters: UniverseFilters | null; onClear: () => void }) {
  if (!filters) return null;
  const pills: string[] = [];
  if (filters.sector) pills.push(`Sector: ${filters.sector}`);
  if (filters.max_forward_pe != null) pills.push(`Fwd PE ≤ ${filters.max_forward_pe}`);
  if (filters.max_trailing_pe != null) pills.push(`Trail PE ≤ ${filters.max_trailing_pe}`);
  if (filters.min_revenue_growth != null) pills.push(`Rev growth ≥ ${(filters.min_revenue_growth * 100).toFixed(0)}%`);
  if (filters.min_profit_margin != null) pills.push(`Margin ≥ ${(filters.min_profit_margin * 100).toFixed(0)}%`);
  if (filters.near_52w_low_pct != null) pills.push(`Within ${(filters.near_52w_low_pct * 100).toFixed(0)}% of 52W low`);
  if (filters.min_market_cap != null) pills.push(`Mkt cap ≥ $${(filters.min_market_cap / 1e9).toFixed(1)}B`);
  if (!pills.length) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-2">
      {pills.map((p, i) => (
        <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-green/10 text-green border border-green/20">
          {p}
        </span>
      ))}
      <button onClick={onClear}
        className="text-[10px] text-muted hover:text-white px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-1">
        <X size={9} /> Clear
      </button>
    </div>
  );
}

// ── Status bar ─────────────────────────────────────────────────────────────

function UniverseStatusBar({ onForceRefresh }: { onForceRefresh: () => void }) {
  const status = useUniverseStatus();
  if (!status) return null;

  const pct = status.total > 0 ? Math.round((status.cached / status.total) * 100) : 0;

  return (
    <div className="flex items-center gap-3 text-xs text-muted">
      <Database size={11} className="flex-shrink-0" />
      <span className="text-white/60">{status.cached}/{status.total} stocks cached ({pct}%)</span>
      {status.fetching && (
        <span className="flex items-center gap-1 text-green">
          <RefreshCw size={10} className="animate-spin" />
          Fetching {status.fetched_this_cycle}/{status.cycle_total}
        </span>
      )}
      {!status.fetching && (
        <button onClick={onForceRefresh}
          className="text-muted hover:text-green transition-colors flex items-center gap-1">
          <RefreshCw size={10} /> Refresh
        </button>
      )}
    </div>
  );
}

// ── Manual filter panel ────────────────────────────────────────────────────

interface ManualFilters {
  sector: string;
  max_forward_pe: string;
  min_revenue_growth: string;
  min_profit_margin: string;
  near_52w_low_pct: string;
  min_market_cap_b: string;
  order_by: string;
  limit: string;
}

const DEFAULT_MANUAL: ManualFilters = {
  sector: "",
  max_forward_pe: "",
  min_revenue_growth: "",
  min_profit_margin: "",
  near_52w_low_pct: "",
  min_market_cap_b: "",
  order_by: "market_cap DESC",
  limit: "50",
};

function ManualFilterPanel({
  sectors,
  onApply,
  onClose,
}: {
  sectors: string[];
  onApply: (f: ManualFilters) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<ManualFilters>(DEFAULT_MANUAL);
  const set = (k: keyof ManualFilters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="bg-card2 border border-border/70 rounded-2xl p-4 space-y-3 anim-scale-in">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white flex items-center gap-1.5"><Filter size={12} /> Filters</p>
        <button onClick={onClose} className="text-muted hover:text-white"><X size={13} /></button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Sector */}
        <div>
          <label className="text-[10px] text-muted">Sector</label>
          <select value={f.sector} onChange={set("sector")}
            className="w-full mt-0.5 bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-green/40">
            <option value="">All sectors</option>
            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Order by */}
        <div>
          <label className="text-[10px] text-muted">Sort by</label>
          <select value={f.order_by} onChange={set("order_by")}
            className="w-full mt-0.5 bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-green/40">
            <option value="market_cap DESC">Market Cap ↓</option>
            <option value="revenue_growth DESC">Revenue Growth ↓</option>
            <option value="forward_pe ASC">Fwd PE ↑ (cheapest)</option>
            <option value="profit_margin DESC">Profit Margin ↓</option>
            <option value="distance_to_low_pct ASC">Closest to 52W Low</option>
            <option value="earnings_growth DESC">Earnings Growth ↓</option>
          </select>
        </div>

        {/* Max Fwd PE */}
        <div>
          <label className="text-[10px] text-muted">Max Forward PE</label>
          <input type="number" placeholder="e.g. 25" value={f.max_forward_pe} onChange={set("max_forward_pe")}
            className="w-full mt-0.5 bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-green/40" />
        </div>

        {/* Min Rev Growth */}
        <div>
          <label className="text-[10px] text-muted">Min Revenue Growth %</label>
          <input type="number" placeholder="e.g. 10" value={f.min_revenue_growth} onChange={set("min_revenue_growth")}
            className="w-full mt-0.5 bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-green/40" />
        </div>

        {/* Min Profit Margin */}
        <div>
          <label className="text-[10px] text-muted">Min Profit Margin %</label>
          <input type="number" placeholder="e.g. 5" value={f.min_profit_margin} onChange={set("min_profit_margin")}
            className="w-full mt-0.5 bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-green/40" />
        </div>

        {/* Near 52W Low */}
        <div>
          <label className="text-[10px] text-muted">Within X% of 52W Low</label>
          <input type="number" placeholder="e.g. 20" value={f.near_52w_low_pct} onChange={set("near_52w_low_pct")}
            className="w-full mt-0.5 bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-green/40" />
        </div>

        {/* Min Market Cap */}
        <div>
          <label className="text-[10px] text-muted">Min Market Cap ($B)</label>
          <input type="number" placeholder="e.g. 10" value={f.min_market_cap_b} onChange={set("min_market_cap_b")}
            className="w-full mt-0.5 bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-green/40" />
        </div>

        {/* Limit */}
        <div>
          <label className="text-[10px] text-muted">Max results</label>
          <input type="number" placeholder="50" value={f.limit} onChange={set("limit")}
            className="w-full mt-0.5 bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-green/40" />
        </div>
      </div>

      <button onClick={() => onApply(f)}
        className="w-full bg-green/10 hover:bg-green/20 border border-green/30 text-green rounded-xl py-2 text-xs font-medium transition-colors">
        Apply Filters
      </button>
    </div>
  );
}

// ── Stock row ──────────────────────────────────────────────────────────────

function UniverseStockRow({
  stock,
  rank,
  selected,
  onSelect,
}: {
  stock: UniverseStock;
  rank: number;
  selected: boolean;
  onSelect: (s: string) => void;
}) {
  return (
    <tr
      onClick={() => onSelect(stock.symbol)}
      className={clsx(
        "border-b border-border/40 cursor-pointer transition-colors text-xs",
        selected ? "bg-card2" : "hover:bg-white/[0.02]"
      )}
    >
      <td className="py-2 px-3 text-muted font-mono w-8">{rank}</td>
      <td className="py-2 px-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono font-semibold text-white">{stock.symbol}</span>
          <SectorBadge sector={stock.sector} />
        </div>
      </td>
      <td className="py-2 px-3 text-right font-mono text-white">
        {stock.close_price != null ? `$${stock.close_price.toFixed(2)}` : <span className="text-muted">—</span>}
      </td>
      <td className="py-2 px-3 text-right"><MarketCapBadge cap={stock.market_cap} /></td>
      <td className="py-2 px-3 text-right font-mono text-white/70">{fmt(stock.forward_pe, 1, "x")}</td>
      <td className="py-2 px-3 text-right">{fmtGrowth(stock.revenue_growth)}</td>
      <td className="py-2 px-3 text-right">{fmt(stock.profit_margin, 1, "%", 100)}</td>
      <td className="py-2 px-3 text-right font-mono text-white/50">
        {stock.distance_to_low_pct != null
          ? <span className={stock.distance_to_low_pct < 0.2 ? "text-green" : "text-white/50"}>
              +{(stock.distance_to_low_pct * 100).toFixed(1)}%
            </span>
          : <span className="text-muted">—</span>}
      </td>
    </tr>
  );
}

// ── Agent chat bar ─────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  "Profitable tech stocks under PE 25",
  "Healthcare stocks near 52-week lows",
  "High growth stocks with positive margins",
  "Value stocks in Financial sector",
  "Large cap Consumer Defensive stocks",
  "Energy stocks with revenue growth",
];

// ── Main component ─────────────────────────────────────────────────────────

export default function UniverseScreen({
  onSelectSymbol,
}: {
  onSelectSymbol: (symbol: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<UniverseStock[]>([]);
  const [filters, setFilters] = useState<UniverseFilters | null>(null);
  const [summary, setSummary] = useState("");
  const [totalMatched, setTotalMatched] = useState(0);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [mode, setMode] = useState<"agent" | "manual">("agent");
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sectors = useUniverseSectors();

  const runAgent = useCallback(async (q: string) => {
    if (!q.trim() || loading) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setSummary("");
    setResults([]);
    setFilters(null);

    try {
      const res = await fetch("/api/universe/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(await res.text());

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let accSummary = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "results") {
              setResults(parsed.results ?? []);
              setFilters(parsed.filters ?? null);
              setTotalMatched(parsed.total_matched ?? 0);
            } else if (parsed.token) {
              accSummary += parsed.token;
              setSummary(accSummary);
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setSummary(`Error: ${e.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const runManual = useCallback(async (f: ManualFilters) => {
    setLoading(true);
    setResults([]);
    setFilters(null);
    setSummary("");
    setShowManual(false);

    const body: Record<string, any> = {
      order_by: f.order_by,
      limit: parseInt(f.limit) || 50,
    };
    if (f.sector) body.sector = f.sector;
    if (f.max_forward_pe) body.max_forward_pe = parseFloat(f.max_forward_pe);
    if (f.min_revenue_growth) body.min_revenue_growth = parseFloat(f.min_revenue_growth) / 100;
    if (f.min_profit_margin) body.min_profit_margin = parseFloat(f.min_profit_margin) / 100;
    if (f.near_52w_low_pct) body.near_52w_low_pct = parseFloat(f.near_52w_low_pct) / 100;
    if (f.min_market_cap_b) body.min_market_cap = parseFloat(f.min_market_cap_b) * 1e9;

    try {
      const data = await apiFetch<UniverseStock[]>("/universe/query", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResults(data);
      setTotalMatched(data.length);
      setFilters(body as UniverseFilters);
    } catch (e: any) {
      setSummary(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleForceRefresh = useCallback(async () => {
    try {
      await apiFetch("/universe/status");
    } catch {}
  }, []);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && mode === "agent") {
      e.preventDefault();
      runAgent(query);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 p-3 pt-8 gap-2 anim-fade-in">

      {/* Header bar */}
      <div className="flex items-center justify-between flex-shrink-0 anim-fade-down">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-green" />
            <span className="text-sm font-semibold text-white">Universe Screener</span>
          </div>
          <UniverseStatusBar onForceRefresh={handleForceRefresh} />
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 bg-card2 rounded-lg p-0.5">
          {(["agent", "manual"] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={clsx("px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize",
                mode === m ? "bg-green/15 text-green" : "text-muted hover:text-white")}>
              {m === "agent" ? "AI Filter" : "Manual Filter"}
            </button>
          ))}
        </div>
      </div>

      {/* Agent input or Manual filter panel */}
      <div className="flex-shrink-0 space-y-2">
        {mode === "agent" ? (
          <div className="bg-card rounded-2xl border border-border/60 p-3 anim-scale-in">
            {/* Quick prompts */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <span className="text-[10px] text-muted">Try:</span>
              {QUICK_PROMPTS.map(p => (
                <button key={p} onClick={() => { setQuery(p); runAgent(p); }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-card2 border border-border/60 text-white/60 hover:text-green hover:border-green/30 transition-colors">
                  {p}
                </button>
              ))}
            </div>

            {/* Input row */}
            <div className="flex items-center gap-2 bg-card2 border border-border rounded-xl px-3 py-2 focus-within:border-green/40 transition-colors">
              <Bot size={13} className="text-green flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Describe the stocks you want... e.g. 'profitable healthcare stocks under PE 30'"
                className="flex-1 bg-transparent text-xs text-white placeholder-muted focus:outline-none"
              />
              <button
                onClick={() => runAgent(query)}
                disabled={!query.trim() || loading}
                className="text-muted hover:text-green disabled:opacity-30 transition-colors flex-shrink-0">
                {loading ? <RefreshCw size={13} className="animate-spin text-green" /> : <Send size={13} />}
              </button>
            </div>

            {/* Active filters pills */}
            <FilterPills filters={filters} onClear={() => { setFilters(null); setResults([]); setSummary(""); }} />
          </div>
        ) : (
          <div className="bg-card rounded-2xl border border-border/60 p-3 anim-scale-in">
            <ManualFilterPanel
              sectors={sectors}
              onApply={runManual}
              onClose={() => setMode("agent")}
            />
          </div>
        )}
      </div>

      {/* AI Summary */}
      {summary && (
        <div className="flex-shrink-0 bg-card rounded-2xl border border-border/60 px-4 py-3 anim-fade-up">
          <div className="flex items-center gap-2 mb-1.5">
            <Bot size={12} className="text-green" />
            <span className="text-[10px] text-muted">AI Summary</span>
          </div>
          <p className="text-xs text-white/80 leading-relaxed">{summary}</p>
        </div>
      )}

      {/* Results table */}
      <div className="bg-card rounded-2xl border border-border/50 flex flex-col flex-1 min-h-0 overflow-hidden anim-fade-up">
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-white">Results</span>
            {totalMatched > 0 && (
              <span className="text-[10px] text-muted bg-card2 px-2 py-0.5 rounded-full">
                {results.length} shown{totalMatched > results.length ? ` of ${totalMatched}` : ""}
              </span>
            )}
          </div>
          {loading && (
            <span className="text-[10px] text-green flex items-center gap-1">
              <RefreshCw size={10} className="animate-spin" /> Scanning universe...
            </span>
          )}
          {!loading && results.length === 0 && !summary && (
            <span className="text-[10px] text-muted">Ask the AI or apply filters to screen stocks</span>
          )}
        </div>

        <div className="overflow-y-auto flex-1">
          {results.length > 0 ? (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="text-muted border-b border-border">
                  <th className="text-left py-2 px-3 font-medium w-8">#</th>
                  <th className="text-left py-2 px-3 font-medium">Symbol</th>
                  <th className="text-right py-2 px-3 font-medium">Price</th>
                  <th className="text-right py-2 px-3 font-medium">Mkt Cap</th>
                  <th className="text-right py-2 px-3 font-medium">Fwd PE</th>
                  <th className="text-right py-2 px-3 font-medium">Rev Growth</th>
                  <th className="text-right py-2 px-3 font-medium">Margin</th>
                  <th className="text-right py-2 px-3 font-medium">52W Low+</th>
                </tr>
              </thead>
              <tbody>
                {results.map((s, i) => (
                  <UniverseStockRow
                    key={s.symbol}
                    stock={s}
                    rank={i + 1}
                    selected={selectedSymbol === s.symbol}
                    onSelect={(sym) => {
                      setSelectedSymbol(sym);
                      onSelectSymbol(sym);
                    }}
                  />
                ))}
              </tbody>
            </table>
          ) : loading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="chart-skeleton h-8 rounded-lg" />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
