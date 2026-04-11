import { useState } from "react";
import clsx from "clsx";
import { Plus, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import PortfolioChart from "./PortfolioChart";
import { useAnalysis } from "../hooks/useApi";
import type { HoldingWithMetrics } from "../types";

interface Props {
  holdings: HoldingWithMetrics[];
  loading: boolean;
  onAdd: (symbol: string, buyDate: string, buyPrice?: number, notes?: string) => void;
  onRemove: (symbol: string) => void;
}

function GainBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted text-xs">—</span>;
  const up = pct >= 0;
  return (
    <span className={clsx("flex items-center gap-1 text-xs font-mono", up ? "text-green" : "text-red")}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? "+" : ""}{(pct * 100).toFixed(2)}%
    </span>
  );
}

function HoldingCard({
  h,
  onRemove,
}: {
  h: HoldingWithMetrics;
  onRemove: (s: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: analysis, loading: analysisLoading } = useAnalysis(
    expanded ? h.symbol : null,
    "sell"
  );

  const sellResult = h.sell_result;
  const shouldSell = sellResult?.passed ?? false;

  return (
    <div className="bg-card2 rounded-xl overflow-hidden border border-border/50">
      {/* Card header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className={clsx(
            "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
            shouldSell ? "bg-red/15 text-red" : "bg-green/10 text-green"
          )}>
            {h.symbol.slice(0, 2)}
          </div>
          <div>
            <p className="text-white font-mono font-semibold text-sm">{h.symbol}</p>
            <p className="text-muted text-[10px]">Bought {h.buy_date}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-white font-mono text-sm">
              ${h.current_price?.toFixed(2) ?? "—"}
            </p>
            <GainBadge pct={h.gain_pct} />
          </div>
          <div className={clsx(
            "text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide",
            shouldSell
              ? "bg-red/15 text-red"
              : "bg-green/10 text-green"
          )}>
            {shouldSell ? "SELL" : "HOLD"}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(h.symbol); }}
            className="text-muted hover:text-red transition-colors p-1"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-3">
          {/* Portfolio chart */}
          {h.history && h.history.length > 0 && (
            <PortfolioChart data={h.history} buyPrice={h.buy_price} height={150} />
          )}

          {/* Metrics row */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Buy Price", value: h.buy_price != null ? `$${h.buy_price.toFixed(2)}` : "—" },
              { label: "Current", value: h.current_price != null ? `$${h.current_price.toFixed(2)}` : "—" },
              { label: "Gain $", value: h.gain_abs != null ? `${h.gain_abs >= 0 ? "+" : ""}$${h.gain_abs.toFixed(2)}` : "—" },
              { label: "Gain %", value: h.gain_pct != null ? `${h.gain_pct >= 0 ? "+" : ""}${(h.gain_pct * 100).toFixed(2)}%` : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="bg-card rounded-lg px-2 py-2">
                <p className="text-muted text-[10px]">{label}</p>
                <p className="text-white font-mono text-xs mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Sell criteria */}
          {sellResult && (
            <div>
              <p className="text-xs text-muted mb-1.5">
                Sell criteria — {sellResult.rules_met}/{sellResult.rules_total} met
                (need {sellResult.min_required})
              </p>
              <div className="space-y-1">
                {sellResult.details.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-xs">
                    <span className={clsx(
                      "w-1.5 h-1.5 rounded-full flex-shrink-0",
                      r.passed ? "bg-red" : "bg-white/20"
                    )} />
                    <span className={r.passed ? "text-red/90" : "text-muted"}>{r.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI sell analysis */}
          <div>
            <p className="text-xs text-muted mb-1.5">AI Sell Analysis</p>
            {analysisLoading ? (
              <div className="bg-card rounded-lg p-3 text-xs text-muted animate-pulse">
                Analyzing sell conditions...
              </div>
            ) : analysis?.analysis_text ? (
              <div className="bg-card rounded-lg p-3 text-xs text-white/80 leading-relaxed space-y-1">
                {analysis.analysis_text.split("\n").filter(Boolean).map((line: string, i: number) => (
                  <p key={i} className={line.startsWith("-") ? "pl-2 text-white/60" : "text-white/80"}>
                    {line}
                  </p>
                ))}
              </div>
            ) : (
              <div className="bg-card rounded-lg p-3 text-xs text-muted">
                Click to load analysis
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PortfolioPanel({ holdings, loading, onAdd, onRemove }: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [buyDate, setBuyDate] = useState(new Date().toISOString().slice(0, 10));
  const [buyPrice, setBuyPrice] = useState("");
  const [notes, setNotes] = useState("");

  const totalGain = holdings.reduce((sum, h) => sum + (h.gain_pct ?? 0), 0);
  const avgGain = holdings.length ? totalGain / holdings.length : 0;
  const sellCount = holdings.filter((h) => h.sell_result?.passed).length;

  // Net earnings: sum of (current_price - buy_price) across all holdings
  const netEarnings = holdings.reduce((sum, h) => {
    if (h.gain_abs != null) return sum + h.gain_abs;
    return sum;
  }, 0);
  const hasNetData = holdings.some((h) => h.gain_abs != null);

  function handleAdd() {
    if (!symbol.trim()) return;
    onAdd(symbol.trim().toUpperCase(), buyDate, buyPrice ? parseFloat(buyPrice) : undefined, notes);
    setSymbol(""); setBuyDate(new Date().toISOString().slice(0, 10));
    setBuyPrice(""); setNotes(""); setShowAddForm(false);
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold text-sm">Portfolio</h2>
            <p className="text-muted text-xs mt-0.5">{holdings.length} holdings</p>
          </div>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-1.5 bg-green/10 hover:bg-green/20 border border-green/30 text-green rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          >
            <Plus size={12} />
            Add Stock
          </button>
        </div>

        {/* Summary stats */}
        {holdings.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="bg-card2 rounded-lg px-3 py-2">
              <p className="text-muted text-[10px]">Avg Gain</p>
              <p className={clsx("font-mono text-sm mt-0.5", avgGain >= 0 ? "text-green" : "text-red")}>
                {avgGain >= 0 ? "+" : ""}{(avgGain * 100).toFixed(2)}%
              </p>
            </div>
            <div className="bg-card2 rounded-lg px-3 py-2">
              <p className="text-muted text-[10px]">Net Earnings</p>
              <p className={clsx("font-mono text-sm mt-0.5", !hasNetData ? "text-muted" : netEarnings >= 0 ? "text-green" : "text-red")}>
                {hasNetData ? `${netEarnings >= 0 ? "+" : ""}$${netEarnings.toFixed(2)}` : "—"}
              </p>
            </div>
            <div className="bg-card2 rounded-lg px-3 py-2">
              <p className="text-muted text-[10px]">Holdings</p>
              <p className="text-white font-mono text-sm mt-0.5">{holdings.length}</p>
            </div>
            <div className="bg-card2 rounded-lg px-3 py-2">
              <p className="text-muted text-[10px]">Sell Signals</p>
              <p className={clsx("font-mono text-sm mt-0.5", sellCount > 0 ? "text-red" : "text-green")}>
                {sellCount}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="mx-4 mt-3 bg-card2 rounded-xl p-3 space-y-2 flex-shrink-0 border border-border/50">
          <p className="text-xs text-muted">Add holding</p>
          <input
            placeholder="Symbol (e.g. AAPL)"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-green/50 font-mono"
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-muted">Buy Date</label>
              <input
                type="date"
                value={buyDate}
                onChange={(e) => setBuyDate(e.target.value)}
                className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white mt-0.5 focus:outline-none focus:border-green/50"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-muted">Buy Price (opt)</label>
              <input
                type="number"
                placeholder="Auto-lookup"
                value={buyPrice}
                onChange={(e) => setBuyPrice(e.target.value)}
                className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white mt-0.5 focus:outline-none focus:border-green/50"
              />
            </div>
          </div>
          <input
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-green/50"
          />
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAdd}
              className="flex-1 bg-green/15 hover:bg-green/25 text-green border border-green/30 rounded-lg py-1.5 text-xs font-medium transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="flex-1 bg-white/5 hover:bg-white/10 text-muted rounded-lg py-1.5 text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Holdings list */}
      <div className="px-4 pt-3 pb-4 space-y-2 flex-shrink-0">
        {loading ? (
          <div className="text-muted text-xs text-center py-8">Loading portfolio...</div>
        ) : holdings.length === 0 ? (
          <div className="text-muted text-xs text-center py-8">
            No holdings yet. Add stocks you've purchased.
          </div>
        ) : (
          holdings.map((h) => (
            <HoldingCard key={h.symbol} h={h} onRemove={onRemove} />
          ))
        )}
      </div>
    </div>
  );
}
