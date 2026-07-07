/**
 * UniverseStockPanel — detail panel for any stock, not just the watchlist.
 *
 * Used when a symbol is selected from the Stock Search Engine that isn't
 * in the screener's watchlist. Uses cached universe metrics instantly,
 * fetches price history on demand, and wires up AI analysis + chat.
 */
import { useState } from "react";
import clsx from "clsx";
import { X, ShoppingCart, RefreshCw } from "lucide-react";
import CandlestickChart from "./CandlestickChart";
import AreaChart from "./AreaChart";
import StockChat from "./StockChat";
import NewsPanel from "./NewsPanel";
import FinancialsTab from "./FinancialsTab";
import TechnicalsTab from "./TechnicalsTab";
import { usePriceHistory, useAnalysis, apiFetch } from "../hooks/useApi";
import type { UniverseStock } from "../types";

interface Props {
  symbol: string;
  cachedMetrics?: UniverseStock | null;   // from universe cache — shows instantly
  onClose: () => void;
  onAddToPortfolio: (symbol: string, buyDate: string, buyPrice?: number, shares?: number) => void;
}

type ChartMode = "candle" | "area";
type RightTab = "analysis" | "chat" | "news" | "financials" | "technicals";

export default function UniverseStockPanel({ symbol, cachedMetrics, onClose, onAddToPortfolio }: Props) {
  const [chartMode, setChartMode] = useState<ChartMode>("candle");
  const [period, setPeriod] = useState("1y");
  const [rightTab, setRightTab] = useState<RightTab>("analysis");
  const [showAddForm, setShowAddForm] = useState(false);
  const [buyDate, setBuyDate] = useState(new Date().toISOString().slice(0, 10));
  const [buyPrice, setBuyPrice] = useState("");
  const [shares, setShares] = useState("1");

  const { data: history, loading: histLoading } = usePriceHistory(symbol, period);
  const { data: analysis, loading: analysisLoading, error: analysisError } = useAnalysis(symbol, "buy");

  const areaData = history.map((d: any) => ({ date: d.date, close: d.close }));
  const m = cachedMetrics;

  function handleAdd() {
    onAddToPortfolio(symbol, buyDate, buyPrice ? parseFloat(buyPrice) : undefined, parseFloat(shares) || 1);
    setShowAddForm(false);
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border flex-shrink-0 anim-fade-down">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-lg font-mono">{symbol}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide bg-blue-500/15 text-blue-400">
              Universe
            </span>
          </div>
          {m?.sector && <p className="text-muted text-xs mt-0.5">{m.sector}{m.industry ? ` · ${m.industry}` : ""}</p>}
        </div>
        <button onClick={onClose} className="text-muted hover:text-white transition-colors p-1">
          <X size={16} />
        </button>
      </div>

      {/* Price row — from cache, shows instantly */}
      <div className="px-4 py-3 flex items-end gap-4 border-b border-border flex-shrink-0">
        {m?.close_price != null ? (
          <>
            <div>
              <p className="text-2xl font-mono font-bold text-white">${m.close_price.toFixed(2)}</p>
              <p className="text-xs text-muted mt-0.5">from cache</p>
            </div>
            <div className="flex gap-4 text-xs pb-1">
              {m.low_52_week  && <div><p className="text-muted">52W Low</p> <p className="font-mono text-white">${m.low_52_week.toFixed(2)}</p></div>}
              {m.high_52_week && <div><p className="text-muted">52W High</p><p className="font-mono text-white">${m.high_52_week.toFixed(2)}</p></div>}
              {m.market_cap   && <div><p className="text-muted">Mkt Cap</p> <p className="font-mono text-white">${(m.market_cap / 1e9).toFixed(1)}B</p></div>}
            </div>
          </>
        ) : (
          <p className="text-muted text-sm">Loading price data...</p>
        )}
      </div>

      {/* Chart controls */}
      <div className="px-4 pt-3 flex items-center justify-between flex-shrink-0">
        <div className="flex gap-1 bg-card2 rounded-lg p-0.5">
          {(["candle", "area"] as ChartMode[]).map(cm => (
            <button key={cm} onClick={() => setChartMode(cm)}
              className={clsx("px-3 py-1 rounded-md text-xs transition-colors capitalize",
                chartMode === cm ? "bg-white/10 text-white" : "text-muted hover:text-white")}>
              {cm}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {["1mo", "3mo", "6mo", "1y", "2y"].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={clsx("px-2 py-1 rounded text-xs transition-colors",
                period === p ? "text-green" : "text-muted hover:text-white")}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="px-4 pt-2 flex-shrink-0">
        {histLoading ? (
          <div className="chart-skeleton h-[220px]" />
        ) : history.length > 0 ? (
          chartMode === "candle"
            ? <CandlestickChart data={history} height={220} />
            : <AreaChart data={areaData} height={220} color="#2EE6A8" />
        ) : (
          <div className="flex items-center justify-center h-[220px] text-muted text-xs">No chart data</div>
        )}
      </div>

      {/* Metrics grid — from cache, instant */}
      {m && (
        <div className="px-4 pt-3 grid grid-cols-3 gap-2 flex-shrink-0">
          {[
            { label: "Trailing PE",   value: m.trailing_pe    != null ? m.trailing_pe.toFixed(1)                     : "—" },
            { label: "Forward PE",    value: m.forward_pe     != null ? m.forward_pe.toFixed(1)                      : "—" },
            { label: "Rev Growth",    value: m.revenue_growth != null ? `${(m.revenue_growth * 100).toFixed(1)}%`    : "—" },
            { label: "Earn Growth",   value: m.earnings_growth!= null ? `${(m.earnings_growth* 100).toFixed(1)}%`   : "—" },
            { label: "Profit Margin", value: m.profit_margin  != null ? `${(m.profit_margin  * 100).toFixed(1)}%`   : "—" },
            { label: "Op Margin",     value: m.operating_margin!=null ? `${(m.operating_margin*100).toFixed(1)}%`   : "—" },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card2 rounded-lg px-3 py-2">
              <p className="text-muted text-[10px]">{label}</p>
              <p className="text-white font-mono text-sm mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tab switcher */}
      <div className="px-4 pt-3 flex-shrink-0">
        <div className="flex gap-1 bg-card2 rounded-lg p-0.5">
          {(["analysis", "news", "financials", "technicals", "chat"] as RightTab[]).map(t => (
            <button key={t} onClick={() => setRightTab(t)}
              className={clsx("flex-1 py-1.5 rounded-md text-xs font-medium transition-colors",
                rightTab === t ? "bg-white/10 text-white" : "text-muted hover:text-white")}>
              {t === "analysis" ? "AI" : t === "news" ? "News" : t === "financials" ? "Financials" : t === "technicals" ? "Technical" : "Chat"}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {rightTab === "news" ? (
        <div className="px-4 pt-3 pb-4 flex-shrink-0">
          <NewsPanel symbol={symbol} />
        </div>
      ) : rightTab === "financials" ? (
        <div className="px-4 pt-3 pb-4 flex-shrink-0">
          <FinancialsTab symbol={symbol} />
        </div>
      ) : rightTab === "technicals" ? (
        <div className="px-4 pt-3 pb-4 flex-shrink-0">
          <TechnicalsTab history={history} symbol={symbol} currentPrice={m?.close_price} />
        </div>
      ) : rightTab === "analysis" ? (
        <div className="px-4 pt-3 pb-4 flex-shrink-0 space-y-3">
          {analysisLoading ? (
            <div className="bg-card2 rounded-lg p-3 text-xs text-muted animate-pulse flex items-center gap-2">
              <RefreshCw size={11} className="animate-spin" /> Analyzing {symbol}...
            </div>
          ) : analysis?.analysis_text ? (
            <div className="bg-card2 rounded-lg p-3 text-xs text-white/80 leading-relaxed space-y-1">
              {analysis.analysis_text.split("\n").filter(Boolean).map((line: string, i: number) => (
                <p key={i} className={line.startsWith("-") ? "pl-2 text-white/60" : "text-white/80"}>{line}</p>
              ))}
            </div>
          ) : analysisError ? (
            <div className="bg-card2 rounded-lg p-3 text-xs text-red/80">{analysisError}</div>
          ) : (
            <div className="bg-card2 rounded-lg p-3 text-xs text-muted">Loading analysis...</div>
          )}

          {!showAddForm ? (
            <button onClick={() => setShowAddForm(true)}
              className="w-full flex items-center justify-center gap-2 bg-green/10 hover:bg-green/20 border border-green/30 text-green rounded-xl py-2.5 text-sm font-medium transition-colors">
              <ShoppingCart size={14} /> Mark as Purchased
            </button>
          ) : (
            <div className="bg-card2 rounded-xl p-3 space-y-2">
              <p className="text-xs text-muted">Add to portfolio</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-muted">Buy Date</label>
                  <input type="date" value={buyDate} onChange={e => setBuyDate(e.target.value)}
                    className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white mt-0.5 focus:outline-none focus:border-green/50" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-muted">Shares</label>
                  <input type="number" min="0.001" step="any" placeholder="1" value={shares}
                    onChange={e => setShares(e.target.value)}
                    className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white mt-0.5 focus:outline-none focus:border-green/50" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-muted">Buy Price (optional)</label>
                  <input type="number" placeholder={m?.close_price ? `~${m.close_price.toFixed(2)}` : "Auto"}
                    value={buyPrice} onChange={e => setBuyPrice(e.target.value)}
                    className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white mt-0.5 focus:outline-none focus:border-green/50" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleAdd}
                  className="flex-1 bg-green/15 hover:bg-green/25 text-green border border-green/30 rounded-lg py-1.5 text-xs font-medium transition-colors">
                  Confirm
                </button>
                <button onClick={() => setShowAddForm(false)}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-muted rounded-lg py-1.5 text-xs transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-shrink-0" style={{ height: 340 }}>
          <StockChat symbol={symbol} currentPrice={m?.close_price ?? 0} />
        </div>
      )}
    </div>
  );
}
