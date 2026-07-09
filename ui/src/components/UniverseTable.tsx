/**
 * Stock Search Engine — replaces the old buy/watch table on the Analysis tab.
 * Features: AI natural-language filter, manual filter panel, conversation thread,
 * prominent Clear Filters button, default universe list.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import clsx from "clsx";
import { Send, Bot, RefreshCw, X, SlidersHorizontal, Sparkles, Database, User, ChevronDown, ChevronUp, Settings } from "lucide-react";
import { apiFetch, useUniverseStatus, useUniverseSectors, API_BASE, getAuthHeaders, parseApiError } from "../hooks/useApi";
import TickerLogo from "./TickerLogo";
import type { UniverseStock, UniverseFilters } from "../types";

// ── Helpers ────────────────────────────────────────────────────────────────

function CacheStatus() {
  const status = useUniverseStatus();
  if (!status) return null;
  const src = (status as any).universe_source ?? "US listings";
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted"
      title={`${(status.total ?? 0).toLocaleString()} US stocks — ${src} (via Yahoo Finance). ${(status.cached ?? 0).toLocaleString()} with cached metrics.`}>
      <Database size={9} />
      <span>{(status.cached ?? 0).toLocaleString()}/{(status.total ?? 0).toLocaleString()}</span>
      {status.fetching && <RefreshCw size={8} className="animate-spin text-green" />}
    </div>
  );
}

// ── Active filter summary bar ──────────────────────────────────────────────

function ActiveFilterBar({ filters, query, onClear }: {
  filters: UniverseFilters | null; query: string; onClear: () => void;
}) {
  if (!filters && !query) return null;
  const pills: string[] = [];
  if (filters?.symbols?.length) pills.push(filters.symbols.join(", "));
  if (filters?.sector) pills.push(filters.sector);
  if (filters?.max_forward_pe != null) pills.push(`Fwd PE ≤ ${filters.max_forward_pe}`);
  if (filters?.max_trailing_pe != null) pills.push(`Trail PE ≤ ${filters.max_trailing_pe}`);
  if (filters?.min_revenue_growth != null) pills.push(`Rev ≥ ${(filters.min_revenue_growth * 100).toFixed(0)}%`);
  if (filters?.min_profit_margin != null) pills.push(`Margin ≥ ${(filters.min_profit_margin * 100).toFixed(0)}%`);
  if (filters?.near_52w_low_pct != null) pills.push(`Within ${(filters.near_52w_low_pct * 100).toFixed(0)}% of 52W Low`);
  if (filters?.min_market_cap != null) pills.push(`Cap ≥ $${(filters.min_market_cap / 1e9).toFixed(1)}B`);
  if (filters?.max_price != null) pills.push(`Price ≤ $${filters.max_price}`);
  if (filters?.min_price != null) pills.push(`Price ≥ $${filters.min_price}`);

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-green/5 border-b border-green/15 flex-shrink-0">
      <span className="text-[10px] text-green font-medium flex-shrink-0">Active filters:</span>
      <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
        {pills.map((p, i) => (
          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-green/15 text-green border border-green/25 whitespace-nowrap">{p}</span>
        ))}
        {pills.length === 0 && query && (
          <span className="text-[10px] text-white/60 italic truncate">"{query}"</span>
        )}
      </div>
      <button onClick={onClear}
        className="flex items-center gap-1 text-[10px] text-red/80 hover:text-red bg-red/10 hover:bg-red/20 border border-red/20 hover:border-red/40 px-2 py-1 rounded-lg transition-colors flex-shrink-0 font-medium">
        <X size={10} /> Clear Filters
      </button>
    </div>
  );
}

// ── Manual filter panel ────────────────────────────────────────────────────

interface ManualF {
  sector: string; max_forward_pe: string; max_trailing_pe: string;
  min_revenue_growth: string; min_profit_margin: string;
  near_52w_low_pct: string; min_market_cap_b: string; max_price: string; order_by: string;
}
const DFLT: ManualF = {
  sector: "", max_forward_pe: "", max_trailing_pe: "",
  min_revenue_growth: "", min_profit_margin: "",
  near_52w_low_pct: "", min_market_cap_b: "", max_price: "", order_by: "market_cap DESC",
};

function FilterPanel({ sectors, values, onChange, onApply, onClose }: {
  sectors: string[];
  values: ManualF;
  onChange: (k: keyof ManualF, v: string) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const inp = "w-full mt-0.5 bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-green/40 placeholder-muted";
  const lbl = "text-[10px] text-muted block";

  return (
    <div className="border-b border-border/60 bg-card2/60 px-3 py-3 flex-shrink-0 anim-fade-down">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-white flex items-center gap-1.5">
          <SlidersHorizontal size={12} className="text-green" /> Filters
        </span>
        <button onClick={onClose} className="text-muted hover:text-white text-[10px] flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors">
          <ChevronUp size={11} /> Hide
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div>
          <label className={lbl}>Sector</label>
          <select value={values.sector} onChange={e => onChange("sector", e.target.value)} className={inp}>
            <option value="">All sectors</option>
            {sectors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Max Forward PE</label>
          <input type="number" placeholder="e.g. 25" value={values.max_forward_pe}
            onChange={e => onChange("max_forward_pe", e.target.value)} className={inp} />
        </div>
        <div>
          <label className={lbl}>Max Trailing PE</label>
          <input type="number" placeholder="e.g. 40" value={values.max_trailing_pe}
            onChange={e => onChange("max_trailing_pe", e.target.value)} className={inp} />
        </div>
        <div>
          <label className={lbl}>Min Revenue Growth %</label>
          <input type="number" placeholder="e.g. 10" value={values.min_revenue_growth}
            onChange={e => onChange("min_revenue_growth", e.target.value)} className={inp} />
        </div>
        <div>
          <label className={lbl}>Min Profit Margin %</label>
          <input type="number" placeholder="e.g. 5" value={values.min_profit_margin}
            onChange={e => onChange("min_profit_margin", e.target.value)} className={inp} />
        </div>
        <div>
          <label className={lbl}>Within X% of 52W Low</label>
          <input type="number" placeholder="e.g. 20" value={values.near_52w_low_pct}
            onChange={e => onChange("near_52w_low_pct", e.target.value)} className={inp} />
        </div>
        <div>
          <label className={lbl}>Min Market Cap ($B)</label>
          <input type="number" placeholder="e.g. 10" value={values.min_market_cap_b}
            onChange={e => onChange("min_market_cap_b", e.target.value)} className={inp} />
        </div>
        <div>
          <label className={lbl}>Max Share Price ($)</label>
          <input type="number" placeholder="e.g. 100" value={values.max_price}
            onChange={e => onChange("max_price", e.target.value)} className={inp} />
        </div>
        <div>
          <label className={lbl}>Sort by</label>
          <select value={values.order_by} onChange={e => onChange("order_by", e.target.value)} className={inp}>
            <option value="market_cap DESC">Market Cap ↓</option>
            <option value="revenue_growth DESC">Revenue Growth ↓</option>
            <option value="forward_pe ASC">Forward PE ↑ cheapest</option>
            <option value="profit_margin DESC">Profit Margin ↓</option>
            <option value="distance_to_low_pct ASC">Nearest 52W Low</option>
            <option value="earnings_growth DESC">Earnings Growth ↓</option>
            <option value="close_price ASC">Share Price ↑ lowest</option>
          </select>
        </div>
      </div>
      <button onClick={onApply}
        className="bg-green/10 hover:bg-green/20 border border-green/30 text-green rounded-xl px-4 py-1.5 text-xs font-medium transition-colors">
        Apply Filters
      </button>
    </div>
  );
}

// ── Conversation thread ────────────────────────────────────────────────────

interface ChatMsg { role: "user" | "assistant"; content: string; }

function ConversationThread({ messages, replyInput, onReplyChange, onReplySend, loading }: {
  messages: ChatMsg[];
  replyInput: string;
  onReplyChange: (v: string) => void;
  onReplySend: () => void;
  loading: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  if (messages.length === 0) return null;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Messages */}
      <div className="px-3 pt-2 space-y-2 flex-1 overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i} className={clsx("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
            {m.role === "assistant" && (
              <div className="w-5 h-5 rounded-full bg-green/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot size={10} className="text-green" />
              </div>
            )}
            <div className={clsx(
              "rounded-xl px-3 py-2 text-[11px] leading-relaxed max-w-[85%]",
              m.role === "user"
                ? "bg-green/10 border border-green/20 text-white"
                : "bg-card2 border border-border/50 text-white/80"
            )}>
              {m.content || <span className="inline-block w-[2px] h-3 bg-green animate-pulse" />}
            </div>
            {m.role === "user" && (
              <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User size={10} className="text-white/50" />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Reply input */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 bg-card2 border border-border rounded-xl px-3 py-1.5 focus-within:border-green/40 transition-colors">
          <input
            value={replyInput}
            onChange={e => onReplyChange(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onReplySend(); } }}
            placeholder="Follow up on these results..."
            className="flex-1 bg-transparent text-[11px] text-white placeholder-muted focus:outline-none min-w-0"
          />
          <button onClick={onReplySend} disabled={!replyInput.trim() || loading}
            className="text-muted hover:text-green disabled:opacity-30 transition-colors">
            {loading ? <RefreshCw size={11} className="animate-spin text-green" /> : <Send size={11} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stock row ──────────────────────────────────────────────────────────────

function Row({ stock, rank, selected, onSelect }: {
  stock: UniverseStock; rank: number; selected: boolean;
  onSelect: (s: string, m: UniverseStock) => void;
}) {
  const revGrowth = stock.revenue_growth;
  const revColor = revGrowth == null ? "text-muted" : revGrowth >= 0 ? "text-green" : "text-red";
  return (
    <tr onClick={() => onSelect(stock.symbol, stock)}
      className={clsx("border-b border-border/40 cursor-pointer transition-colors text-xs",
        selected ? "bg-green/[0.06]" : "hover:bg-white/[0.04]")}>
      <td className="py-2 px-2 text-muted font-mono text-[10px] w-6 text-center">{rank}</td>
      <td className="py-2 px-2">
        <div className="flex items-center gap-2" title={stock.sector ?? ""}>
          <TickerLogo symbol={stock.symbol} size={18} />
          <span className="font-mono font-semibold text-white text-[11px]">{stock.symbol}</span>
        </div>
      </td>
      <td className="py-2 px-2 text-right font-mono text-white text-[11px]">
        {stock.close_price != null ? `$${stock.close_price.toFixed(2)}` : <span className="text-muted">—</span>}
      </td>
      <td className="py-2 px-2 text-right text-[10px] text-white/60 hidden sm:table-cell">
        {stock.market_cap
          ? stock.market_cap >= 1e12 ? `${(stock.market_cap / 1e12).toFixed(1)}T`
          : stock.market_cap >= 1e9 ? `${(stock.market_cap / 1e9).toFixed(1)}B`
          : `${(stock.market_cap / 1e6).toFixed(0)}M` : "—"}
      </td>
      <td className="py-2 px-2 text-right font-mono text-white/60 text-[10px] hidden sm:table-cell">
        {stock.forward_pe != null ? `${stock.forward_pe.toFixed(1)}x` : "—"}
      </td>
      <td className={clsx("py-2 px-2 text-right text-[10px]", revColor)}>
        {revGrowth != null ? `${revGrowth >= 0 ? "+" : ""}${(revGrowth * 100).toFixed(1)}%` : "—"}
      </td>
      <td className="py-2 px-2 text-right text-[10px] hidden sm:table-cell">
        {stock.distance_to_low_pct != null
          ? <span className={stock.distance_to_low_pct < 0.2 ? "text-green" : "text-white/40"}>
              +{(stock.distance_to_low_pct * 100).toFixed(1)}%
            </span>
          : <span className="text-muted">—</span>}
      </td>
    </tr>
  );
}

const QUICK = [
  "Profitable tech under PE 25",
  "Near 52-week lows with positive margins",
  "High growth stocks",
  "Value stocks in Financial sector",
];

// ── Main export ────────────────────────────────────────────────────────────

export default function UniverseTable({ selected, onSelect, onFirstLoad, onOpenCriteria }: {
  selected: string | null;
  onSelect: (symbol: string, metrics?: UniverseStock | null) => void;
  onFirstLoad?: (symbol: string) => void;
  onOpenCriteria?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [results, setResults] = useState<UniverseStock[]>([]);
  const [defaultResults, setDefaultResults] = useState<UniverseStock[]>([]);
  const [filters, setFilters] = useState<UniverseFilters | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [manualF, setManualF] = useState<ManualF>(DFLT);

  // Conversation thread
  const [conversation, setConversation] = useState<ChatMsg[]>([]);
  const [replyInput, setReplyInput] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);
  const [chatHeight, setChatHeight] = useState(200);

  // Ticker autocomplete — deterministic symbol match alongside the AI search
  const [suggestions, setSuggestions] = useState<UniverseStock[]>([]);
  const [suggestIdx, setSuggestIdx] = useState(-1);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  const abortRef = useRef<AbortController | null>(null);
  const sectors = useUniverseSectors();

  // Close the suggestion dropdown on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSuggestions([]);
        setSuggestIdx(-1);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // As the user types, look up ticker matches for the last word so single
  // stocks are always reachable without going through the AI at all
  function updateQuery(v: string) {
    setQuery(v);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    const token = v.trim().split(/\s+/).pop() ?? "";
    if (!token || token.length > 6 || !/^[A-Za-z.\-]+$/.test(token)) {
      setSuggestions([]);
      setSuggestIdx(-1);
      return;
    }
    suggestTimer.current = setTimeout(async () => {
      try {
        const data = await apiFetch<UniverseStock[]>(`/search?q=${encodeURIComponent(token.toUpperCase())}`);
        setSuggestions(data.slice(0, 6));
        setSuggestIdx(-1);
      } catch {
        setSuggestions([]);
      }
    }, 150);
  }

  async function selectSuggestion(s: UniverseStock) {
    setSuggestions([]);
    setSuggestIdx(-1);
    setQuery(s.symbol);
    setConversation([]);
    // Narrow the results list to just this stock, same as an AI/manual filter
    setFilters({ symbols: [s.symbol], intent_summary: s.symbol });
    setResults([s]);
    // Fetch the full cached row so the detail panel + list row get complete metrics
    try {
      const rows = await apiFetch<UniverseStock[]>("/universe/query", {
        method: "POST",
        body: JSON.stringify({ symbols: [s.symbol], limit: 1 }),
      });
      const full = rows[0] ?? s;
      setResults([full]);
      onSelect(s.symbol, full);
    } catch {
      onSelect(s.symbol, s);
    }
  }

  const loading = agentLoading || manualLoading;
  const displayResults = filters ? results : defaultResults;

  // Load default top-250 by market cap on mount
  useEffect(() => {
    apiFetch<UniverseStock[]>("/universe/query", {
      method: "POST",
      body: JSON.stringify({ order_by: "market_cap DESC", limit: 250 }),
    }).then(d => {
      setDefaultResults(d);
      if (d.length > 0) onFirstLoad?.(d[0].symbol);
    }).catch(() => {});
  }, []);

  // ── Run AI agent query ──
  const runAgent = useCallback(async (q: string, existingConvo: ChatMsg[] = []) => {
    if (!q.trim() || loading) return;
    setSuggestions([]);
    setSuggestIdx(-1);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const isFollowUp = existingConvo.length > 0;

    if (!isFollowUp) {
      setAgentLoading(true);
      setResults([]);
      setFilters(null);
      setConversation([{ role: "user", content: q }, { role: "assistant", content: "" }]);
    } else {
      setReplyLoading(true);
      setConversation(prev => [...prev, { role: "user", content: q }, { role: "assistant", content: "" }]);
    }

    try {
      const res = await fetch(`${API_BASE}/universe/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ query: q }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw await parseApiError(res);

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
            const p = JSON.parse(data);
            if (p.type === "results" && !isFollowUp) {
              setResults(p.results ?? []);
              setFilters(p.filters ?? null);
            } else if (p.token) {
              accSummary += p.token;
              setConversation(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: accSummary };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        const errMsg = e.code === "credits_exhausted" ? e.message : `Error: ${e.message}`;
        setConversation(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: errMsg };
          return updated;
        });
      }
    } finally {
      setAgentLoading(false);
      setReplyLoading(false);
    }
  }, [loading]);

  // ── Run manual filter query ──
  const runManual = useCallback(async () => {
    setManualLoading(true);
    setShowFilters(false);
    setFilters(null);
    setConversation([]);
    const body: Record<string, any> = { order_by: manualF.order_by, limit: 250 };
    if (manualF.sector) body.sector = manualF.sector;
    if (manualF.max_forward_pe) body.max_forward_pe = parseFloat(manualF.max_forward_pe);
    if (manualF.max_trailing_pe) body.max_trailing_pe = parseFloat(manualF.max_trailing_pe);
    if (manualF.min_revenue_growth) body.min_revenue_growth = parseFloat(manualF.min_revenue_growth) / 100;
    if (manualF.min_profit_margin) body.min_profit_margin = parseFloat(manualF.min_profit_margin) / 100;
    if (manualF.near_52w_low_pct) body.near_52w_low_pct = parseFloat(manualF.near_52w_low_pct) / 100;
    if (manualF.min_market_cap_b) body.min_market_cap = parseFloat(manualF.min_market_cap_b) * 1e9;
    if (manualF.max_price) body.max_price = parseFloat(manualF.max_price);
    try {
      const data = await apiFetch<UniverseStock[]>("/universe/query", { method: "POST", body: JSON.stringify(body) });
      setResults(data);
      setFilters(body as UniverseFilters);
    } catch {}
    finally { setManualLoading(false); }
  }, [manualF]);

  function clearFilters() {
    setFilters(null);
    setResults([]);
    setConversation([]);
    setQuery("");
    setManualF(DFLT);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSuggestIdx(i => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSuggestIdx(i => Math.max(i - 1, -1));
        return;
      }
      if (e.key === "Escape") {
        setSuggestions([]);
        setSuggestIdx(-1);
        return;
      }
      if (e.key === "Enter" && suggestIdx >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[suggestIdx]);
        return;
      }
    }
    if (e.key === "Enter") {
      e.preventDefault();
      setSuggestions([]);
      setSuggestIdx(-1);
      runAgent(query);
    }
  }

  function sendReply() {
    if (!replyInput.trim() || replyLoading) return;
    const q = replyInput.trim();
    setReplyInput("");
    runAgent(q, conversation);
  }

  const hasActiveFilter = !!filters || conversation.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={11} className="text-green flex-shrink-0" />
          <span className="text-xs font-semibold text-white">Stock Search Engine</span>
          <CacheStatus />
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {loading && <RefreshCw size={11} className="animate-spin text-green" />}
          <span className="text-[10px] text-muted">
            {hasActiveFilter ? `${displayResults.length} results` : `${displayResults.length} stocks`}
          </span>
          {onOpenCriteria && (
            <button onClick={onOpenCriteria} title="Edit screening criteria"
              className="flex items-center gap-1 text-muted hover:text-green transition-colors p-1 rounded-lg hover:bg-white/5">
              <Settings size={11} />
            </button>
          )}
          <button
            onClick={() => setShowFilters(v => !v)}
            className={clsx(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors border",
              showFilters
                ? "bg-green/15 text-green border-green/30"
                : "bg-white/5 text-white/70 border-border/60 hover:bg-white/10 hover:text-white"
            )}>
            <SlidersHorizontal size={11} />
            Filters
            {showFilters ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        </div>
      </div>

      {/* ── Manual filter panel ── */}
      {showFilters && (
        <FilterPanel
          sectors={sectors}
          values={manualF}
          onChange={(k, v) => setManualF(prev => ({ ...prev, [k]: v }))}
          onApply={runManual}
          onClose={() => setShowFilters(false)}
        />
      )}

      {/* ── Active filter bar ── */}
      <ActiveFilterBar filters={filters} query={query} onClear={clearFilters} />

      {/* ── AI search input + ticker autocomplete + quick prompts ── */}
      <div className="px-3 pt-2 pb-1.5 flex-shrink-0 space-y-1.5">
        <div ref={searchBoxRef} className="relative">
          <div className="flex items-center gap-1.5 bg-card2 border border-border rounded-xl px-3 py-1.5 focus-within:border-green/40 transition-colors">
            <Bot size={11} className="text-green flex-shrink-0" />
            <input
              value={query}
              onChange={e => updateQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder='Type a ticker (SMCI) or ask AI: "profitable tech under PE 25"...'
              className="flex-1 bg-transparent text-[11px] text-white placeholder-muted focus:outline-none min-w-0"
            />
            {(query || hasActiveFilter) && (
              <button onClick={clearFilters} title="Clear all filters"
                className="text-muted hover:text-red transition-colors">
                <X size={11} />
              </button>
            )}
            <button onClick={() => runAgent(query)} disabled={!query.trim() || loading}
              className="text-muted hover:text-green disabled:opacity-30 transition-colors">
              <Send size={11} />
            </button>
          </div>

          {/* Ticker suggestions — click to open the stock directly, no AI */}
          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-card2 border border-border/70 rounded-xl shadow-2xl z-40 py-1 overflow-hidden anim-scale-in">
              <p className="px-3 pt-1 pb-1.5 text-[9px] text-muted uppercase tracking-wider">Matching tickers</p>
              {suggestions.map((s, i) => (
                <button
                  key={s.symbol}
                  onClick={() => selectSuggestion(s)}
                  className={clsx(
                    "w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors",
                    i === suggestIdx ? "bg-green/10" : "hover:bg-white/5"
                  )}>
                  <TickerLogo symbol={s.symbol} size={20} />
                  <span className="font-mono font-semibold text-white text-[11px] flex-shrink-0">{s.symbol}</span>
                  <span className="text-muted text-[10px] truncate flex-1">{s.sector ?? ""}</span>
                  {s.close_price != null && (
                    <span className="font-mono text-white/70 text-[10px]">${s.close_price.toFixed(2)}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[9px] text-muted">Try:</span>
          {QUICK.map(p => (
            <button key={p} onClick={() => { setQuery(p); runAgent(p); }}
              className="text-[9px] px-2 py-0.5 rounded-full bg-card2 border border-border/50 text-white/50 hover:text-green hover:border-green/30 transition-colors whitespace-nowrap">
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── Conversation thread + draggable divider + Results table ── */}
      {conversation.length > 0 ? (
        /* Split layout: chat on top, table on bottom, divider between */
        <div className="flex flex-col flex-1 min-h-0">

          {/* Chat panel — fixed height, user-resizable */}
          <div style={{ height: chatHeight, minHeight: 80, maxHeight: 400 }}
            className="flex-shrink-0 overflow-hidden">
            <ConversationThread
              messages={conversation}
              replyInput={replyInput}
              onReplyChange={setReplyInput}
              onReplySend={sendReply}
              loading={replyLoading}
            />
          </div>

          {/* Drag handle */}
          <div
            className="h-2 flex-shrink-0 cursor-row-resize group flex items-center justify-center bg-transparent hover:bg-green/5 transition-colors"
            onMouseDown={e => {
              e.preventDefault();
              const startY = e.clientY;
              const startH = chatHeight;
              function onMove(ev: MouseEvent) {
                const next = Math.min(400, Math.max(80, startH + (ev.clientY - startY)));
                setChatHeight(next);
              }
              function onUp() {
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              }
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}>
            <div className="w-10 h-0.5 rounded-full bg-border group-hover:bg-green/50 transition-colors" />
          </div>

          {/* Results table — takes remaining space */}
          <div className="overflow-y-auto flex-1">
            {displayResults.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="text-muted border-b border-border text-[10px]">
                    <th className="text-center py-1.5 px-2 font-medium w-6">#</th>
                    <th className="text-left py-1.5 px-2 font-medium">Symbol</th>
                    <th className="text-right py-1.5 px-2 font-medium">Price</th>
                    <th className="text-right py-1.5 px-2 font-medium hidden sm:table-cell">Cap</th>
                    <th className="text-right py-1.5 px-2 font-medium hidden sm:table-cell">Fwd PE</th>
                    <th className="text-right py-1.5 px-2 font-medium">Rev Growth</th>
                    <th className="text-right py-1.5 px-2 font-medium hidden sm:table-cell">52W Low+</th>
                  </tr>
                </thead>
                <tbody>
                  {displayResults.map((s, i) => (
                    <Row key={s.symbol} stock={s} rank={i + 1}
                      selected={selected === s.symbol} onSelect={(sym, m) => onSelect(sym, m)} />
                  ))}
                </tbody>
              </table>
            ) : loading ? (
              <div className="space-y-1.5 p-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="chart-skeleton h-7 rounded" />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-16 text-muted text-xs">No results</div>
            )}
          </div>
        </div>
      ) : (
        /* No conversation — table takes full remaining space */
        <div className="overflow-y-auto flex-1">
          {displayResults.length > 0 ? (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="text-muted border-b border-border text-[10px]">
                  <th className="text-center py-1.5 px-2 font-medium w-6">#</th>
                  <th className="text-left py-1.5 px-2 font-medium">Symbol</th>
                  <th className="text-right py-1.5 px-2 font-medium">Price</th>
                  <th className="text-right py-1.5 px-2 font-medium hidden sm:table-cell">Cap</th>
                  <th className="text-right py-1.5 px-2 font-medium hidden sm:table-cell">Fwd PE</th>
                  <th className="text-right py-1.5 px-2 font-medium">Rev Growth</th>
                  <th className="text-right py-1.5 px-2 font-medium hidden sm:table-cell">52W Low+</th>
                </tr>
              </thead>
              <tbody>
                {displayResults.map((s, i) => (
                  <Row key={s.symbol} stock={s} rank={i + 1}
                    selected={selected === s.symbol} onSelect={(sym, m) => onSelect(sym, m)} />
                ))}
              </tbody>
            </table>
          ) : loading ? (
            <div className="space-y-1.5 p-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="chart-skeleton h-7 rounded" />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-24 text-muted text-xs">
              {defaultResults.length === 0 ? "Loading stock data..." : "No results match those filters"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
