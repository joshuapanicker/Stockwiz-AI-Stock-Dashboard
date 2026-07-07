import { useState, useMemo } from "react";
import clsx from "clsx";
import { Plus, Trash2, TrendingUp, TrendingDown, Package, ChevronDown, ChevronUp, RefreshCw, Search, Building2, DollarSign, History } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import PortfolioChart from "./PortfolioChart";
import SymbolSearch from "./SymbolSearch";
import PlaidConnect from "./PlaidConnect";
import { useAnalysis, useUniverseSignals, useSoldPositions } from "../hooks/useApi";
import type { HoldingWithMetrics } from "../types";

interface Props {
  holdings: HoldingWithMetrics[];
  loading: boolean;
  onAdd: (symbol: string, buyDate: string, buyPrice?: number, shares?: number, notes?: string) => Promise<void>;
  onRemove: (symbol: string) => void;
  onRemoveMultiple?: (symbols: string[]) => Promise<void>;
  onSell?: (symbol: string, sellPrice: number, sellDate?: string) => Promise<void>;
  onPortfolioRefresh?: () => void;
}

// Combined portfolio value chart — merges all holdings' history by date
function buildCombinedHistory(holdings: HoldingWithMetrics[]) {
  const map: Record<string, number> = {};
  for (const h of holdings) {
    if (!h.history?.length) continue;
    for (const pt of h.history) {
      map[pt.date] = (map[pt.date] ?? 0) + pt.close;
    }
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value: parseFloat(value.toFixed(2)) }));
}

const DONUT_COLORS = ["#00e676", "#7c3aed", "#ff6d00", "#00bcd4", "#ff1744", "#ffd600"];

function DonutTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card2 border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-white font-mono">{payload[0].name}</p>
      <p className="text-muted">{payload[0].value.toFixed(1)}%</p>
    </div>
  );
}

function CombinedChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card2 border border-border rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-muted mb-1">{label}</p>
      <p className="text-white font-mono font-semibold">${payload[0]?.value?.toFixed(2)}</p>
    </div>
  );
}

function HoldingRow({
  h, onRemove, onSell, selected, onToggleSelect, deleting,
}: {
  h: HoldingWithMetrics;
  onRemove: (s: string) => void;
  onSell?: (s: string, price: number, date?: string) => Promise<void>;
  selected: boolean;
  onToggleSelect: (s: string) => void;
  deleting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellPrice, setSellPrice] = useState(h.current_price?.toFixed(2) ?? "");
  const [sellDate, setSellDate] = useState(new Date().toISOString().slice(0, 10));
  const [selling, setSelling] = useState(false);
  const { data: analysis, loading: analysisLoading } = useAnalysis(expanded ? h.symbol : null, "sell");
  const sellResult = h.sell_result;
  const shouldSell = sellResult?.passed ?? false;
  const gainUp = (h.gain_pct ?? 0) >= 0;

  const brokerageSource = useMemo(() => {
    if (!h.notes) return null;
    const m = h.notes.match(/^Synced from (.+)$/i);
    return m ? m[1] : null;
  }, [h.notes]);

  const estimatedProceeds = sellPrice
    ? (parseFloat(sellPrice) * (h.shares ?? 1)).toFixed(2)
    : null;
  const estimatedGain = (sellPrice && h.buy_price != null)
    ? ((parseFloat(sellPrice) - h.buy_price) * (h.shares ?? 1)).toFixed(2)
    : null;

  async function handleSell() {
    if (!onSell || !sellPrice) return;
    setSelling(true);
    try {
      await onSell(h.symbol, parseFloat(sellPrice), sellDate);
      setShowSellModal(false);
    } finally {
      setSelling(false);
    }
  }

  return (
    <>
    <div className={clsx(
      "rounded-2xl border overflow-hidden transition-all",
      deleting ? "opacity-40 pointer-events-none" : "",
      selected ? "border-green/40 bg-green/[0.04]" : shouldSell ? "border-red/20 bg-red/5" : "border-border/40 bg-white/[0.02]"
    )}>
      <div className="flex items-center gap-3 px-4 py-4">
        <button
          onClick={e => { e.stopPropagation(); onToggleSelect(h.symbol); }}
          className={clsx(
            "w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors",
            selected ? "bg-green/20 border-green/50 text-green" : "border-border/50 text-transparent hover:border-green/30"
          )}
        >
          {selected && <span className="text-[10px] font-bold leading-none">✓</span>}
        </button>

        <div className="flex flex-1 items-center gap-4 cursor-pointer hover:bg-white/[0.02] rounded-xl transition-colors -mx-1 px-1"
          onClick={() => setExpanded(v => !v)}>
          <div className={clsx(
            "w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold flex-shrink-0",
            shouldSell ? "bg-gradient-to-br from-red/30 to-red/10 text-red" : "bg-gradient-to-br from-green/20 to-purple-500/10 text-green"
          )}>
            {h.symbol.slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-white font-semibold text-sm">{h.symbol}</p>
              <span className={clsx("text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide", shouldSell ? "bg-red/15 text-red" : "bg-green/10 text-green")}>
                {shouldSell ? "SELL" : "HOLD"}
              </span>
              {brokerageSource && (
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Building2 size={9} />{brokerageSource}
                </span>
              )}
            </div>
            <p className="text-muted text-xs mt-0.5">Since {h.buy_date} · {h.shares ?? 1} shares @ ${h.buy_price?.toFixed(2) ?? "—"}</p>
          </div>
          <div className="text-right">
            <p className="text-white font-mono font-semibold">${h.current_price?.toFixed(2) ?? "—"}</p>
            <p className={clsx("text-xs font-mono flex items-center justify-end gap-0.5", gainUp ? "text-green" : "text-red")}>
              {gainUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {h.gain_pct != null ? `${gainUp ? "+" : ""}${(h.gain_pct * 100).toFixed(2)}%` : "—"}
            </p>
          </div>
          <div className="text-right w-28">
            <p className={clsx("font-mono text-sm font-semibold", gainUp ? "text-green" : "text-red")}>
              {h.gain_abs != null ? `${gainUp ? "+" : ""}$${Math.abs(h.gain_abs).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}
            </p>
            <p className="text-muted text-[10px]">unrealized P&L</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={e => { e.stopPropagation(); onRemove(h.symbol); }}
              disabled={deleting}
              className="text-muted hover:text-red transition-colors p-1.5 rounded-lg hover:bg-red/10"
              title="Delete position">
              {deleting ? <RefreshCw size={13} className="animate-spin text-red/50" /> : <Trash2 size={13} />}
            </button>
            {expanded ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
          </div>
        </div>

        {/* Sell button — prominently outside the expand area, always visible */}
        <div className="flex items-center gap-2 px-4 pb-3">
          {onSell && (
            <button
              onClick={e => { e.stopPropagation(); setSellPrice(h.current_price?.toFixed(2) ?? ""); setShowSellModal(true); }}
              className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 px-3 py-1.5 rounded-xl transition-colors"
            >
              <DollarSign size={12} />
              Record Sale
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/30 px-5 pb-5 pt-4 space-y-4">
          {h.history?.length > 0 && <PortfolioChart data={h.history} buyPrice={h.buy_price} height={200} />}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Buy Price", value: h.buy_price != null ? `$${h.buy_price.toFixed(2)}` : "—" },
              { label: "Shares", value: h.shares != null ? String(h.shares) : "1" },
              { label: "Total Value", value: h.total_value != null ? `$${h.total_value.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—" },
              { label: "P&L (%)", value: h.gain_pct != null ? `${h.gain_pct >= 0 ? "+" : ""}${(h.gain_pct * 100).toFixed(2)}%` : "—" },
              { label: "Cost Basis", value: (h.buy_price != null && h.shares != null) ? `$${(h.buy_price * h.shares).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—" },
              { label: "Current Price", value: h.current_price != null ? `$${h.current_price.toFixed(2)}` : "—" },
              { label: "P&L ($)", value: h.gain_abs != null ? `${h.gain_abs >= 0 ? "+" : ""}$${Math.abs(h.gain_abs).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—" },
              { label: "Gain/Share", value: (h.gain_pct != null && h.buy_price != null) ? `${h.gain_pct >= 0 ? "+" : ""}$${(h.gain_pct * h.buy_price).toFixed(2)}` : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/[0.03] rounded-xl px-3 py-3 border border-border/30">
                <p className="text-muted text-[10px]">{label}</p>
                <p className="text-white font-mono text-sm mt-1">{value}</p>
              </div>
            ))}
          </div>
          {sellResult && (
            <div className="bg-white/[0.02] rounded-xl p-4 border border-border/30">
              <p className="text-xs text-muted mb-2">Sell conditions — {sellResult.rules_met}/{sellResult.rules_total} triggered (need {sellResult.min_required})</p>
              <div className="space-y-1.5">
                {sellResult.details.map(r => (
                  <div key={r.id} className="flex items-center gap-2 text-xs">
                    <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", r.passed ? "bg-red" : "bg-white/15")} />
                    <span className={r.passed ? "text-red/90" : "text-muted"}>{r.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs text-muted mb-2">AI Sell Analysis</p>
            {analysisLoading ? (
              <div className="bg-white/[0.02] rounded-xl p-4 text-xs text-muted animate-pulse border border-border/30">Analyzing...</div>
            ) : analysis?.analysis_text ? (
              <div className="bg-white/[0.02] rounded-xl p-4 text-xs text-white leading-relaxed space-y-1 border border-border/30">
                {analysis.analysis_text.split("\n").filter(Boolean).map((line: string, i: number) => (
                  <p key={i} className={line.startsWith("-") ? "pl-2 text-white/70" : ""}>{line}</p>
                ))}
              </div>
            ) : (
              <div className="bg-white/[0.02] rounded-xl p-4 text-xs text-muted border border-border/30">Expand to load analysis</div>
            )}
          </div>
        </div>
      )}
    </div>

    {/* Sell modal */}
    {showSellModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowSellModal(false)}>
        <div className="bg-card2 border border-border rounded-2xl p-6 w-full max-w-sm mx-4 space-y-4" onClick={e => e.stopPropagation()}>
          <div>
            <p className="text-white font-semibold text-base">Record Sale — {h.symbol}</p>
            <p className="text-muted text-xs mt-1">{h.shares} shares · bought @ ${h.buy_price?.toFixed(2) ?? "—"}</p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted">Sell Price per Share</label>
              <input type="number" step="0.01" value={sellPrice} onChange={e => setSellPrice(e.target.value)}
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-white mt-1 focus:outline-none focus:border-amber-400/50" />
            </div>
            <div>
              <label className="text-xs text-muted">Sell Date</label>
              <input type="date" value={sellDate} onChange={e => setSellDate(e.target.value)}
                className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-white mt-1 focus:outline-none focus:border-amber-400/50" />
            </div>
            {estimatedProceeds && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-white/[0.03] rounded-xl px-3 py-2 border border-border/30">
                  <p className="text-muted text-[10px]">Proceeds</p>
                  <p className="text-white font-mono text-sm">${parseFloat(estimatedProceeds).toLocaleString("en-US", { maximumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-white/[0.03] rounded-xl px-3 py-2 border border-border/30">
                  <p className="text-muted text-[10px]">Realized P&L</p>
                  <p className={clsx("font-mono text-sm", estimatedGain && parseFloat(estimatedGain) >= 0 ? "text-green" : "text-red")}>
                    {estimatedGain ? `${parseFloat(estimatedGain) >= 0 ? "+" : ""}$${Math.abs(parseFloat(estimatedGain)).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleSell} disabled={selling || !sellPrice}
              className="flex-1 bg-amber-400/15 hover:bg-amber-400/25 disabled:opacity-50 text-amber-400 border border-amber-400/30 rounded-xl py-2.5 text-sm font-medium transition-colors">
              {selling ? "Recording…" : "Confirm Sale"}
            </button>
            <button onClick={() => setShowSellModal(false)} className="flex-1 bg-white/5 hover:bg-white/10 text-muted rounded-xl py-2.5 text-sm transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

  return (
    <div className={clsx(
      "rounded-2xl border overflow-hidden transition-all",
      deleting ? "opacity-40 pointer-events-none" : "",
      selected ? "border-green/40 bg-green/[0.04]" : shouldSell ? "border-red/20 bg-red/5" : "border-border/40 bg-white/[0.02]"
    )}>
      <div className="flex items-center gap-3 px-4 py-4">
        {/* Checkbox */}
        <button
          onClick={e => { e.stopPropagation(); onToggleSelect(h.symbol); }}
          className={clsx(
            "w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors",
            selected ? "bg-green/20 border-green/50 text-green" : "border-border/50 text-transparent hover:border-green/30"
          )}
        >
          {selected && <span className="text-[10px] font-bold leading-none">✓</span>}
        </button>

        {/* Rest of row — clickable to expand */}
        <div className="flex flex-1 items-center gap-4 cursor-pointer hover:bg-white/[0.02] rounded-xl transition-colors -mx-1 px-1"
          onClick={() => setExpanded(v => !v)}>

          {/* Avatar */}
          <div className={clsx(
            "w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold flex-shrink-0",
            shouldSell
              ? "bg-gradient-to-br from-red/30 to-red/10 text-red"
              : "bg-gradient-to-br from-green/20 to-purple-500/10 text-green"
          )}>
            {h.symbol.slice(0, 2)}
          </div>

          {/* Symbol + date */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-white font-semibold text-sm">{h.symbol}</p>
              <span className={clsx(
                "text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide",
                shouldSell ? "bg-red/15 text-red" : "bg-green/10 text-green"
              )}>
                {shouldSell ? "SELL" : "HOLD"}
              </span>
              {brokerageSource && (
                <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Building2 size={9} />{brokerageSource}
                </span>
              )}
            </div>
            <p className="text-muted text-xs mt-0.5">Since {h.buy_date} · {h.shares ?? 1} shares @ ${h.buy_price?.toFixed(2) ?? "—"}</p>
          </div>

          {/* Price + gain */}
          <div className="text-right">
            <p className="text-white font-mono font-semibold">${h.current_price?.toFixed(2) ?? "—"}</p>
            <p className={clsx("text-xs font-mono flex items-center justify-end gap-0.5", gainUp ? "text-green" : "text-red")}>
              {gainUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {h.gain_pct != null ? `${gainUp ? "+" : ""}${(h.gain_pct * 100).toFixed(2)}%` : "—"}
            </p>
          </div>

          {/* P&L */}
          <div className="text-right w-28">
            <p className={clsx("font-mono text-sm font-semibold", gainUp ? "text-green" : "text-red")}>
              {h.gain_abs != null ? `${gainUp ? "+" : ""}$${Math.abs(h.gain_abs).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}
            </p>
            <p className="text-muted text-[10px]">unrealized P&L</p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={e => { e.stopPropagation(); onRemove(h.symbol); }}
              disabled={deleting}
              className="text-muted hover:text-red transition-colors p-1.5 rounded-lg hover:bg-red/10">
              {deleting
                ? <RefreshCw size={13} className="animate-spin text-red/50" />
                : <Trash2 size={13} />}
            </button>
            {expanded ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/30 px-5 pb-5 pt-4 space-y-4">
          {h.history?.length > 0 && (
            <PortfolioChart data={h.history} buyPrice={h.buy_price} height={200} />
          )}

          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Buy Price", value: h.buy_price != null ? `$${h.buy_price.toFixed(2)}` : "—" },
              { label: "Shares", value: h.shares != null ? String(h.shares) : "1" },
              { label: "Total Value", value: h.total_value != null ? `$${h.total_value.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—" },
              { label: "P&L (%)", value: h.gain_pct != null ? `${h.gain_pct >= 0 ? "+" : ""}${(h.gain_pct * 100).toFixed(2)}%` : "—" },
              { label: "Cost Basis", value: (h.buy_price != null && h.shares != null) ? `$${(h.buy_price * h.shares).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—" },
              { label: "Current Price", value: h.current_price != null ? `$${h.current_price.toFixed(2)}` : "—" },
              { label: "P&L ($)", value: h.gain_abs != null ? `${h.gain_abs >= 0 ? "+" : ""}$${Math.abs(h.gain_abs).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—" },
              { label: "Gain/Share", value: (h.gain_pct != null && h.buy_price != null) ? `${h.gain_pct >= 0 ? "+" : ""}$${(h.gain_pct * h.buy_price).toFixed(2)}` : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/[0.03] rounded-xl px-3 py-3 border border-border/30">
                <p className="text-muted text-[10px]">{label}</p>
                <p className="text-white font-mono text-sm mt-1">{value}</p>
              </div>
            ))}
          </div>

          {sellResult && (
            <div className="bg-white/[0.02] rounded-xl p-4 border border-border/30">
              <p className="text-xs text-muted mb-2">
                Sell conditions — {sellResult.rules_met}/{sellResult.rules_total} triggered (need {sellResult.min_required})
              </p>
              <div className="space-y-1.5">
                {sellResult.details.map(r => (
                  <div key={r.id} className="flex items-center gap-2 text-xs">
                    <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", r.passed ? "bg-red" : "bg-white/15")} />
                    <span className={r.passed ? "text-red/90" : "text-muted"}>{r.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs text-muted mb-2">AI Sell Analysis</p>
            {analysisLoading ? (
              <div className="bg-white/[0.02] rounded-xl p-4 text-xs text-muted animate-pulse border border-border/30">Analyzing...</div>
            ) : analysis?.analysis_text ? (
              <div className="bg-white/[0.02] rounded-xl p-4 text-xs text-white leading-relaxed space-y-1 border border-border/30">
                {analysis.analysis_text.split("\n").filter(Boolean).map((line: string, i: number) => (
                  <p key={i} className={line.startsWith("-") ? "pl-2 text-white/70" : ""}>{line}</p>
                ))}
              </div>
            ) : (
              <div className="bg-white/[0.02] rounded-xl p-4 text-xs text-muted border border-border/30">Expand to load analysis</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PortfolioTab({ holdings, loading, onAdd, onRemove, onRemoveMultiple, onSell, onPortfolioRefresh }: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [buyDate, setBuyDate] = useState(new Date().toISOString().slice(0, 10));
  const [buyPrice, setBuyPrice] = useState("");
  const [shares, setShares] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [optimisticSymbol, setOptimisticSymbol] = useState<string | null>(null);
  const [showBrokerage, setShowBrokerage] = useState(false);
  const [positionSearch, setPositionSearch] = useState("");
  // Multi-select state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletingSymbols, setDeletingSymbols] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const netEarnings = holdings.reduce((s, h) => s + (h.gain_abs ?? 0), 0);
  const avgGain = holdings.length
    ? holdings.reduce((s, h) => s + (h.gain_pct ?? 0), 0) / holdings.length : 0;
  const sellCount = holdings.filter(h => h.sell_result?.passed).length;
  const hasData = holdings.some(h => h.gain_abs != null);
  const combinedHistory = useMemo(() => buildCombinedHistory(holdings), [holdings]);

  // Sold positions history
  const { data: soldPositions, loading: soldLoading, refresh: refreshSold } = useSoldPositions();
  const totalRealized = soldPositions.reduce((s: number, p: any) => s + (p.realized_gain ?? 0), 0);

  // Universe signals
  const { data: signals, loading: signalsLoading, refresh: refreshSignals } = useUniverseSignals();
  const buySignals = signals.filter((s: any) => s.classification === "buy");
  const watchSignals = signals.filter((s: any) => s.classification === "watch");

  // Filtered holdings for position search
  const filteredHoldings = useMemo(() => {
    const q = positionSearch.trim().toUpperCase();
    if (!q) return holdings;
    return holdings.filter(h =>
      h.symbol.includes(q) ||
      (h.notes?.toUpperCase().includes(q))
    );
  }, [holdings, positionSearch]);

  // Allocation data for donut
  const allocationData = useMemo(() => {
    const total = holdings.reduce((s, h) => s + (h.current_price ?? 0), 0);
    if (!total) return [];
    return holdings.map(h => ({
      name: h.symbol,
      value: parseFloat((((h.current_price ?? 0) / total) * 100).toFixed(1)),
    }));
  }, [holdings]);

  function handleAdd() {
    if (!symbol.trim()) return;
    setSaving(true);
    setSaveError(null);
    const sym = symbol.trim().toUpperCase();
    setOptimisticSymbol(sym); // show placeholder immediately
    setShowAddForm(false);    // close form right away for responsiveness
    setSymbol(""); setBuyDate(new Date().toISOString().slice(0, 10));
    setBuyPrice(""); setShares("1"); setNotes("");
    onAdd(sym, buyDate, buyPrice ? parseFloat(buyPrice) : undefined, parseFloat(shares) || 1, notes)
      .then(() => { setOptimisticSymbol(null); })
      .catch((e: any) => {
        setOptimisticSymbol(null);
        setSaveError(e?.message ?? "Failed to save");
        setShowAddForm(true); // reopen form on error
      })
      .finally(() => setSaving(false));
  }

  function toggleSelect(symbol: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol); else next.add(symbol);
      return next;
    });
  }

  function toggleSelectAll() {
    const visible = filteredHoldings.map(h => h.symbol);
    const allSelected = visible.every(s => selected.has(s));
    setSelected(allSelected ? new Set() : new Set(visible));
  }

  async function handleSingleRemove(symbol: string) {
    setDeletingSymbols(prev => new Set(prev).add(symbol));
    try {
      await onRemove(symbol);
    } finally {
      setDeletingSymbols(prev => { const n = new Set(prev); n.delete(symbol); return n; });
      setSelected(prev => { const n = new Set(prev); n.delete(symbol); return n; });
    }
  }

  async function handleBulkDelete() {
    if (!selected.size || !onRemoveMultiple) return;
    const symbols = [...selected];
    setBulkDeleting(true);
    setDeletingSymbols(new Set(symbols));
    try {
      await onRemoveMultiple(symbols);
      setSelected(new Set());
    } finally {
      setBulkDeleting(false);
      setDeletingSymbols(new Set());
    }
  }



  const gainUp = netEarnings >= 0;

  return (
    <div className="h-full flex flex-col bg-bg relative overflow-hidden">
      {/* Portfolio gradient — full screen diagonal purple wash */}
      <div className="fixed inset-0 pointer-events-none z-0 gradient-reveal"
        style={{ background: "radial-gradient(ellipse 120% 80% at 0% 0%, rgba(124,58,237,0.12) 0%, transparent 60%), radial-gradient(ellipse 120% 80% at 100% 100%, rgba(109,40,217,0.10) 0%, transparent 60%)" }}
      />

      {/* ── Hero section ── */}
      <div className="relative z-10 overflow-hidden px-8 pt-10 pb-8 anim-fade-down">

        <div className="flex items-start justify-between">
          <div>
            <p className="text-muted text-sm mb-1">Total Portfolio Value</p>
            <div className="flex items-end gap-4">
              <h1 className={clsx(
                "text-5xl font-bold font-mono tracking-tight",
                !hasData ? "text-white" : gainUp ? "text-green" : "text-red"
              )}>
                {hasData ? `${gainUp ? "+" : ""}$${Math.abs(netEarnings).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}
              </h1>
              {hasData && (
                <div className={clsx(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold mb-2",
                  gainUp ? "bg-green/10 text-green" : "bg-red/10 text-red"
                )}>
                  {gainUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {gainUp ? "+" : ""}{(avgGain * 100).toFixed(2)}% avg
                </div>
              )}
            </div>
            <p className="text-muted text-sm mt-1">
              {holdings.length} position{holdings.length !== 1 ? "s" : ""} ·
              {sellCount > 0
                ? <span className="text-red ml-1">{sellCount} sell signal{sellCount !== 1 ? "s" : ""}</span>
                : <span className="text-green ml-1"> all clear</span>}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setShowAddForm(v => !v)}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-border/60 text-white rounded-2xl px-5 py-2.5 text-sm font-medium transition-all hover:border-green/30">
              <Plus size={15} />
              Add Stock
            </button>
          </div>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="relative mt-6 bg-card2 rounded-2xl p-5 border border-border/50 space-y-3">
            <p className="text-sm font-semibold text-white">Add Stock</p>
            <SymbolSearch
              value={symbol}
              onChange={setSymbol}
              onSelect={setSymbol}
              placeholder="Search ticker (e.g. AAPL, NVDA)..."
              autoFocus
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted">Buy Date</label>
                <input type="date" value={buyDate} onChange={e => setBuyDate(e.target.value)}
                  className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-white mt-1 focus:outline-none focus:border-green/50" />
              </div>
              <div>
                <label className="text-xs text-muted">Shares</label>
                <input type="number" min="0.001" step="any" placeholder="1" value={shares}
                  onChange={e => setShares(e.target.value)}
                  className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-white mt-1 focus:outline-none focus:border-green/50" />
              </div>
              <div>
                <label className="text-xs text-muted">Buy Price (auto-lookup if blank)</label>
                <input type="number" placeholder="Auto" value={buyPrice} onChange={e => setBuyPrice(e.target.value)}
                  className="w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-white mt-1 focus:outline-none focus:border-green/50" />
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={handleAdd} disabled={saving}
                className="flex-1 bg-green/15 hover:bg-green/25 disabled:opacity-50 text-green border border-green/30 rounded-xl py-2.5 text-sm font-medium transition-colors">
                {saving ? "Saving..." : "Add Stock"}
              </button>
              <button onClick={() => { setShowAddForm(false); setSaveError(null); }}
                className="flex-1 bg-white/5 hover:bg-white/10 text-muted rounded-xl py-2.5 text-sm transition-colors">
                Cancel
              </button>
            </div>
            {saveError && (
              <p className="text-red text-xs mt-1">{saveError}</p>
            )}
          </div>
        )}

        {/* Brokerage connection panel */}
        <div className="relative mt-4">
          <button onClick={() => setShowBrokerage(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 bg-card2/60 hover:bg-card2 border border-border/40 rounded-2xl text-sm transition-colors text-left">
            <div className="flex items-center gap-2">
              <RefreshCw size={13} className="text-green flex-shrink-0" />
              <span className="text-white font-medium">Brokerage Connection</span>
              <span className="text-muted text-xs hidden sm:inline">· connect &amp; sync your real holdings</span>
            </div>
            {showBrokerage ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
          </button>
          {showBrokerage && (
            <div className="mt-2 bg-card2 border border-border/40 rounded-2xl p-5">
              <PlaidConnect
                onHoldingsSynced={() => onPortfolioRefresh?.()}
                onHoldingsRemoved={() => onPortfolioRefresh?.()}
              />
            </div>
          )}
        </div>

      </div>

      {/* ── Two-column split — always shown ── */}
      <div className="relative z-10 flex min-h-0 flex-1 gap-0 px-4 pb-6">

        {/* ── LEFT: charts + stats + holdings ── */}
        <div className="flex-1 min-w-0 overflow-y-auto pr-3 space-y-5">

          {holdings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-border/50 flex items-center justify-center">
                <Package size={24} className="text-muted" />
              </div>
              <p className="text-white font-semibold">No positions yet</p>
              <p className="text-muted text-sm">Add stocks you've purchased to start tracking</p>
            </div>
          ) : (
            <>
            {/* Charts row */}
            <div className="grid grid-cols-3 gap-4 anim-fade-up" style={{ animationDelay: "80ms" }}>
              <div className="col-span-2 bg-card2 rounded-2xl border border-border/40 p-5 flex flex-col">
                <div className="mb-4 flex-shrink-0">
                  <p className="text-white font-semibold text-sm">Portfolio Performance</p>
                  <p className="text-muted text-xs mt-0.5">Combined value over time</p>
                </div>
                <div className="flex-1 min-h-0" style={{ minHeight: 160 }}>
                {combinedHistory.length > 1 ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={combinedHistory} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="combGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false}
                        tickFormatter={v => v.slice(5)} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false}
                        tickFormatter={v => `$${v.toFixed(0)}`} domain={["auto", "auto"]} />
                      <Tooltip content={<CombinedChartTooltip />} />
                      <Area type="monotone" dataKey="value" stroke="#7c3aed" strokeWidth={2}
                        fill="url(#combGrad)" dot={false}
                        activeDot={{ r: 4, fill: "#7c3aed", stroke: "#131318", strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="chart-skeleton h-[160px]" />
                )}
                </div>{/* end flex-1 */}
              </div>

              <div className="bg-card2 rounded-2xl border border-border/40 p-5 flex flex-col" style={{ minHeight: 0 }}>
                <p className="text-white font-semibold text-sm mb-1">Allocation</p>
                <p className="text-muted text-xs mb-3">By current value</p>
                {allocationData.length > 0 ? (
                  <>
                    <div className="flex items-center justify-center flex-shrink-0">
                      <PieChart width={120} height={120}>
                        <Pie data={allocationData} cx={55} cy={55} innerRadius={34} outerRadius={55}
                          paddingAngle={3} dataKey="value">
                          {allocationData.map((_, i) => (
                            <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<DonutTooltip />} />
                      </PieChart>
                    </div>
                    <div className="space-y-1 mt-2 overflow-y-auto max-h-32">
                      {allocationData.map((d, i) => (
                        <div key={d.name} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                            <span className="text-white font-mono">{d.name}</span>
                          </div>
                          <span className="text-muted">{d.value}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted text-xs">No data</div>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-3 stagger anim-fade-up" style={{ animationDelay: "160ms" }}>
              {[
                { label: "Net P&L", value: hasData ? `${gainUp ? "+" : ""}$${Math.abs(netEarnings).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—",
                  color: !hasData ? "text-muted" : gainUp ? "text-green" : "text-red", sub: "Unrealized earnings" },
                { label: "Avg Return", value: `${avgGain >= 0 ? "+" : ""}${(avgGain * 100).toFixed(2)}%`,
                  color: avgGain >= 0 ? "text-green" : "text-red", sub: "Mean gain" },
                { label: "Positions", value: String(holdings.length),
                  color: "text-white", sub: "Active holdings" },
                { label: "Sell Signals", value: String(sellCount),
                  color: sellCount > 0 ? "text-red" : "text-green",
                  sub: sellCount > 0 ? "Meet your sell criteria" : "All clear" },
              ].map(({ label, value, color, sub }) => (
                <div key={label} className="bg-card2 rounded-2xl px-4 py-3 border border-border/40">
                  <p className="text-muted text-xs">{label}</p>
                  <p className={clsx("font-mono text-xl font-bold mt-1", color)}>{value}</p>
                  <p className="text-muted text-[10px] mt-0.5">{sub}</p>
                </div>
              ))}
            </div>

            {/* Holdings list */}
            <div className="anim-fade-up" style={{ animationDelay: "220ms" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <p className="text-white font-semibold">Positions</p>
                  {/* Select-all checkbox */}
                  {filteredHoldings.length > 0 && !loading && (
                    <button
                      onClick={toggleSelectAll}
                      className={clsx(
                        "text-[11px] px-2 py-0.5 rounded-lg border transition-colors",
                        filteredHoldings.every(h => selected.has(h.symbol))
                          ? "bg-green/15 border-green/30 text-green"
                          : "border-border/50 text-muted hover:text-white hover:border-border"
                      )}
                    >
                      {filteredHoldings.every(h => selected.has(h.symbol)) ? "Deselect all" : "Select all"}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Bulk delete button */}
                  {selected.size > 0 && (
                    <button
                      onClick={handleBulkDelete}
                      disabled={bulkDeleting}
                      className="flex items-center gap-1.5 text-xs text-red/80 hover:text-red bg-red/5 hover:bg-red/10 border border-red/20 px-3 py-1.5 rounded-xl transition-colors"
                    >
                      {bulkDeleting
                        ? <RefreshCw size={11} className="animate-spin" />
                        : <Trash2 size={11} />}
                      Remove {selected.size} selected
                    </button>
                  )}
                  <p className="text-muted text-xs">{holdings.length} holdings · click to expand</p>
                </div>
              </div>
              {/* Search bar */}
              <div className="relative mb-3">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                <input
                  type="text"
                  value={positionSearch}
                  onChange={e => setPositionSearch(e.target.value)}
                  placeholder="Search positions…"
                  className="w-full bg-card border border-border/50 rounded-xl pl-8 pr-3 py-2 text-sm text-white placeholder:text-muted focus:outline-none focus:border-green/40"
                />
              </div>
              <div className="space-y-2">
                {loading ? (
                  // Skeleton rows while portfolio loads
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border border-border/40 bg-white/[0.02] overflow-hidden">
                      <div className="flex items-center gap-4 px-5 py-4">
                        <div className="w-11 h-11 rounded-2xl bg-white/5 animate-pulse flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-white/5 rounded animate-pulse w-24" />
                          <div className="h-2.5 bg-white/5 rounded animate-pulse w-40" />
                        </div>
                        <div className="space-y-2 text-right">
                          <div className="h-3 bg-white/5 rounded animate-pulse w-16 ml-auto" />
                          <div className="h-2.5 bg-white/5 rounded animate-pulse w-12 ml-auto" />
                        </div>
                        <div className="w-28 space-y-2">
                          <div className="h-3 bg-white/5 rounded animate-pulse" />
                          <div className="h-2.5 bg-white/5 rounded animate-pulse w-20" />
                        </div>
                      </div>
                    </div>
                  ))
                ) : filteredHoldings.length === 0 && positionSearch ? (
                  <div className="text-muted text-sm text-center py-8">No positions match "{positionSearch}"</div>
                ) : (
                  filteredHoldings.map(h => <HoldingRow key={h.symbol} h={h} onRemove={handleSingleRemove} onSell={onSell} selected={selected.has(h.symbol)} onToggleSelect={toggleSelect} deleting={deletingSymbols.has(h.symbol)} />)
                )}
                {/* Optimistic placeholder while new holding is loading */}
                {optimisticSymbol && !holdings.find(h => h.symbol === optimisticSymbol) && (
                  <div className="rounded-2xl border border-green/20 bg-green/5 overflow-hidden">
                    <div className="flex items-center gap-4 px-5 py-4">
                      <div className="w-11 h-11 rounded-2xl bg-green/15 flex items-center justify-center flex-shrink-0">
                        <span className="text-green font-bold text-sm">{optimisticSymbol.slice(0,2)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-white font-semibold text-sm">{optimisticSymbol}</p>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-green/10 text-green border border-green/20">Adding...</span>
                        </div>
                        <p className="text-muted text-xs mt-0.5">Fetching current price...</p>
                      </div>
                      <div className="w-6 h-6 border-2 border-green/30 border-t-green rounded-full animate-spin" />
                    </div>
                  </div>
                )}
              </div>
            </div>
            </>
          )}

          {/* ── Sold Positions History ── */}
          {(soldPositions.length > 0 || soldLoading) && (
            <div className="anim-fade-up space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History size={14} className="text-muted" />
                  <p className="text-white font-semibold">Trade History</p>
                </div>
                <div className="flex items-center gap-3">
                  {totalRealized !== 0 && (
                    <span className={clsx("text-sm font-mono font-semibold", totalRealized >= 0 ? "text-green" : "text-red")}>
                      {totalRealized >= 0 ? "+" : ""}${Math.abs(totalRealized).toLocaleString("en-US", { maximumFractionDigits: 2 })} realized
                    </span>
                  )}
                  <button onClick={refreshSold} className="text-muted hover:text-green transition-colors p-1 rounded-lg hover:bg-white/5">
                    <RefreshCw size={11} className={soldLoading ? "animate-spin text-green" : ""} />
                  </button>
                </div>
              </div>
              {soldLoading ? (
                Array.from({ length: 2 }).map((_, i) => <div key={i} className="chart-skeleton h-12 rounded-xl" />)
              ) : (
                soldPositions.map((p: any) => {
                  const gain = p.realized_gain ?? 0;
                  const gainUp = gain >= 0;
                  const pct = p.realized_pct != null ? `${gainUp ? "+" : ""}${p.realized_pct.toFixed(2)}%` : null;
                  return (
                    <div key={p.id} className="flex items-center gap-4 px-4 py-3 rounded-2xl border border-border/40 bg-white/[0.02]">
                      <div className={clsx("w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0", gainUp ? "bg-green/10 text-green" : "bg-red/10 text-red")}>
                        {p.symbol.slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold">{p.symbol}</p>
                        <p className="text-muted text-xs">Sold {p.sell_date} · {p.shares} sh @ ${p.sell_price?.toFixed(2)}</p>
                      </div>
                      <div className="text-right">
                        <p className={clsx("font-mono text-sm font-semibold", gainUp ? "text-green" : "text-red")}>
                          {gainUp ? "+" : ""}${Math.abs(gain).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                        </p>
                        {pct && <p className={clsx("text-[10px] font-mono", gainUp ? "text-green/70" : "text-red/70")}>{pct}</p>}
                      </div>
                      <div className="text-right text-xs text-muted w-24">
                        <p>Bought @ ${p.buy_price?.toFixed(2) ?? "—"}</p>
                        <p>{p.buy_date ?? ""}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>{/* end left column */}

          {/* ── Vertical divider ── */}
          <div className="w-px bg-border/50 flex-shrink-0 mx-1" />

          {/* ── RIGHT: screener signals ── */}
          <div className="w-[420px] flex-shrink-0 overflow-y-auto pl-4 space-y-4">
            <div className="pt-1 pb-1 flex items-center justify-between sticky top-0 bg-bg z-10">
              <div>
                <p className="text-white font-semibold text-sm">Screener Signals</p>
                <p className="text-muted text-xs">From universe — top stocks by market cap</p>
              </div>
              <button onClick={refreshSignals} disabled={signalsLoading}
                className="text-muted hover:text-green transition-colors p-1 rounded-lg hover:bg-white/5">
                <RefreshCw size={12} className={signalsLoading ? "animate-spin text-green" : ""} />
              </button>
            </div>

            {signalsLoading ? (
              <div className="space-y-2">
                {[1,2,3,4].map(i => <div key={i} className="chart-skeleton h-14 rounded-xl" />)}
              </div>
            ) : (
              <>
                {/* Buy signals */}
                {buySignals.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-green inline-block" />
                      Buy ({buySignals.length})
                    </p>
                    <div className="space-y-1.5">
                      {buySignals.map((s: any) => (
                        <div key={s.symbol} className="bg-green/5 border border-green/20 rounded-xl px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="font-mono font-semibold text-white text-sm">{s.symbol}</p>
                            <p className="text-muted text-[10px]">{s.metrics?.sector ?? "—"}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-white text-sm">${s.metrics?.close_price?.toFixed(2) ?? "—"}</p>
                            <p className="text-green text-[10px]">{s.buy_result?.rules_met}/{s.buy_result?.rules_total} rules</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Watch signals */}
                {watchSignals.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" />
                      Watch ({watchSignals.length})
                    </p>
                    <div className="space-y-1.5">
                      {watchSignals.map((s: any) => (
                        <div key={s.symbol} className="bg-purple/5 border border-purple/20 rounded-xl px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="font-mono font-semibold text-white text-sm">{s.symbol}</p>
                            <p className="text-muted text-[10px]">{s.metrics?.sector ?? "—"}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-white text-sm">${s.metrics?.close_price?.toFixed(2) ?? "—"}</p>
                            <p className="text-purple-400 text-[10px]">{s.watch_result?.rules_met}/{s.watch_result?.rules_total} rules</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {buySignals.length === 0 && watchSignals.length === 0 && (
                  <div className="text-muted text-xs text-center py-8 bg-white/[0.02] rounded-xl border border-border/30">
                    {signals.length === 0
                      ? "Universe cache still loading — check back shortly"
                      : "No buy or watch signals at current market conditions"}
                  </div>
                )}
              </>
            )}
          </div>{/* end right column */}
        </div>{/* end two-column */}
    </div>
  );
}
