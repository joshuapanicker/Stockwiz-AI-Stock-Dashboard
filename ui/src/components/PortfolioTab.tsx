import { useState, useMemo } from "react";
import clsx from "clsx";
import { Plus, Trash2, TrendingUp, TrendingDown, Package, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, PieChart, Pie, Cell
} from "recharts";
import PortfolioChart from "./PortfolioChart";
import SymbolSearch from "./SymbolSearch";
import { useAnalysis, useUniverseSignals } from "../hooks/useApi";
import type { HoldingWithMetrics } from "../types";

interface Props {
  holdings: HoldingWithMetrics[];
  loading: boolean;
  onAdd: (symbol: string, buyDate: string, buyPrice?: number, shares?: number, notes?: string) => void;
  onRemove: (symbol: string) => void;
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

function HoldingRow({ h, onRemove }: { h: HoldingWithMetrics; onRemove: (s: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { data: analysis, loading: analysisLoading } = useAnalysis(expanded ? h.symbol : null, "sell");
  const sellResult = h.sell_result;
  const shouldSell = sellResult?.passed ?? false;
  const gainUp = (h.gain_pct ?? 0) >= 0;

  return (
    <div className={clsx(
      "rounded-2xl border overflow-hidden transition-all",
      shouldSell ? "border-red/20 bg-red/5" : "border-border/40 bg-white/[0.02]"
    )}>
      <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(v => !v)}>

        {/* Avatar */}
        <div className={clsx(
          "w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-bold flex-shrink-0",
          shouldSell
            ? "bg-gradient-to-br from-red/30 to-red/10 text-red"
            : "bg-gradient-to-br from-green/20 to-purple-500/10 text-green"
        )}>
          {h.symbol.slice(0, 2)}
        </div>

        {/* Symbol + date */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white font-semibold text-sm">{h.symbol}</p>
            <span className={clsx(
              "text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide",
              shouldSell ? "bg-red/15 text-red" : "bg-green/10 text-green"
            )}>
              {shouldSell ? "SELL" : "HOLD"}
            </span>
          </div>
          <p className="text-muted text-xs mt-0.5">Since {h.buy_date} · avg ${h.buy_price?.toFixed(2) ?? "—"}</p>
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
        <div className="text-right w-24">
          <p className={clsx("font-mono text-sm font-semibold", gainUp ? "text-green" : "text-red")}>
            {h.gain_abs != null ? `${gainUp ? "+" : ""}$${Math.abs(h.gain_abs).toFixed(2)}` : "—"}
          </p>
          <p className="text-muted text-[10px]">unrealized P&L</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={e => { e.stopPropagation(); onRemove(h.symbol); }}
            className="text-muted hover:text-red transition-colors p-1.5 rounded-lg hover:bg-red/10">
            <Trash2 size={13} />
          </button>
          {expanded ? <ChevronUp size={14} className="text-muted" /> : <ChevronDown size={14} className="text-muted" />}
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
              { label: "Current", value: h.current_price != null ? `$${h.current_price.toFixed(2)}` : "—" },
              { label: "P&L ($)", value: h.gain_abs != null ? `${h.gain_abs >= 0 ? "+" : ""}$${h.gain_abs.toFixed(2)}` : "—" },
              { label: "P&L (%)", value: h.gain_pct != null ? `${h.gain_pct >= 0 ? "+" : ""}${(h.gain_pct * 100).toFixed(2)}%` : "—" },
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

export default function PortfolioTab({ holdings, loading, onAdd, onRemove }: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [buyDate, setBuyDate] = useState(new Date().toISOString().slice(0, 10));
  const [buyPrice, setBuyPrice] = useState("");
  const [shares, setShares] = useState("1");
  const [notes, setNotes] = useState("");

  const netEarnings = holdings.reduce((s, h) => s + (h.gain_abs ?? 0), 0);
  const avgGain = holdings.length
    ? holdings.reduce((s, h) => s + (h.gain_pct ?? 0), 0) / holdings.length : 0;
  const sellCount = holdings.filter(h => h.sell_result?.passed).length;
  const hasData = holdings.some(h => h.gain_abs != null);
  const combinedHistory = useMemo(() => buildCombinedHistory(holdings), [holdings]);

  // Universe signals
  const { data: signals, loading: signalsLoading, refresh: refreshSignals } = useUniverseSignals();
  const buySignals = signals.filter((s: any) => s.classification === "buy");
  const watchSignals = signals.filter((s: any) => s.classification === "watch");

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
    onAdd(symbol.trim().toUpperCase(), buyDate, buyPrice ? parseFloat(buyPrice) : undefined, parseFloat(shares) || 1, notes);
    setSymbol(""); setBuyDate(new Date().toISOString().slice(0, 10));
    setBuyPrice(""); setShares("1"); setNotes(""); setShowAddForm(false);
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
                {hasData ? `${gainUp ? "+" : ""}$${Math.abs(netEarnings).toFixed(2)}` : "—"}
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

          <button onClick={() => setShowAddForm(v => !v)}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-border/60 text-white rounded-2xl px-5 py-2.5 text-sm font-medium transition-all hover:border-green/30">
            <Plus size={15} />
            Add Stock
          </button>
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
              <button onClick={handleAdd}
                className="flex-1 bg-green/15 hover:bg-green/25 text-green border border-green/30 rounded-xl py-2.5 text-sm font-medium transition-colors">
                Add Stock
              </button>
              <button onClick={() => setShowAddForm(false)}
                className="flex-1 bg-white/5 hover:bg-white/10 text-muted rounded-xl py-2.5 text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}
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
              <div className="col-span-2 bg-card2 rounded-2xl border border-border/40 p-5">
                <div className="mb-4">
                  <p className="text-white font-semibold text-sm">Portfolio Performance</p>
                  <p className="text-muted text-xs mt-0.5">Combined value over time</p>
                </div>
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
              </div>

              <div className="bg-card2 rounded-2xl border border-border/40 p-5 flex flex-col">
                <p className="text-white font-semibold text-sm mb-1">Allocation</p>
                <p className="text-muted text-xs mb-3">By current value</p>
                {allocationData.length > 0 ? (
                  <>
                    <div className="flex items-center justify-center">
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
                    <div className="space-y-1 mt-2">
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
                { label: "Net P&L", value: hasData ? `${gainUp ? "+" : ""}$${Math.abs(netEarnings).toFixed(2)}` : "—",
                  color: !hasData ? "text-muted" : gainUp ? "text-green" : "text-red", sub: "Unrealized earnings" },
                { label: "Avg Return", value: `${avgGain >= 0 ? "+" : ""}${(avgGain * 100).toFixed(2)}%`,
                  color: avgGain >= 0 ? "text-green" : "text-red", sub: "Mean gain" },
                { label: "Positions", value: String(holdings.length),
                  color: "text-white", sub: "Active holdings" },
                { label: "Sell Signals", value: String(sellCount),
                  color: sellCount > 0 ? "text-red" : "text-green",
                  sub: sellCount > 0 ? "Action required" : "All clear" },
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
                <p className="text-white font-semibold">Positions</p>
                <p className="text-muted text-xs">{holdings.length} holdings · click to expand</p>
              </div>
              <div className="space-y-2">
                {loading ? (
                  <div className="text-muted text-sm text-center py-12">Loading...</div>
                ) : (
                  holdings.map(h => <HoldingRow key={h.symbol} h={h} onRemove={onRemove} />)
                )}
              </div>
            </div>
            </>
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
