import { useState } from "react";
import clsx from "clsx";
import { X, ShoppingCart } from "lucide-react";
import CandlestickChart from "./CandlestickChart";
import AreaChart from "./AreaChart";
import DepthChart from "./DepthChart";
import StockChat from "./StockChat";
import NewsPanel from "./NewsPanel";
import FinancialsTab from "./FinancialsTab";
import TechnicalsTab from "./TechnicalsTab";
import TickerLogo from "./TickerLogo";
import SymbolSearch from "./SymbolSearch";
import { usePriceHistory, useAnalysis } from "../hooks/useApi";
import type { ScreenedStock } from "../types";
import { generateDepthData } from "../utils/mockDepth";

interface Props {
  stock: ScreenedStock;
  onClose: () => void;
  onAddToPortfolio: (symbol: string, buyDate: string, buyPrice?: number, shares?: number) => void;
}

type ChartMode = "candle" | "area";
type RightTab = "analysis" | "chat" | "news" | "financials" | "technicals";

export default function StockDetailPanel({ stock, onClose, onAddToPortfolio }: Props) {
  const [chartMode, setChartMode] = useState<ChartMode>("candle");
  const [period, setPeriod] = useState("1y");
  const [showAddForm, setShowAddForm] = useState(false);
  const [buyDate, setBuyDate] = useState(new Date().toISOString().slice(0, 10));
  const [buyPrice, setBuyPrice] = useState("");
  const [shares, setShares] = useState("1");
  const [rightTab, setRightTab] = useState<RightTab>("analysis");

  const { data: history, loading: histLoading } = usePriceHistory(stock.symbol, period);
  const action = stock.classification === "buy" ? "buy" : "watch";
  const { data: analysis, error: analysisError, loading: analysisLoading } = useAnalysis(stock.symbol, action);

  const areaData = history.map((d: any) => ({ date: d.date, close: d.close }));
  const depthData = generateDepthData(stock.metrics.close_price ?? 100);

  const m = stock.metrics;
  const result = stock.classification === "buy" ? stock.buy_result : stock.watch_result;

  function handleAdd() {
    const price = buyPrice ? parseFloat(buyPrice) : undefined;
    onAddToPortfolio(stock.symbol, buyDate, price, parseFloat(shares) || 1);
    setShowAddForm(false);
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border flex-shrink-0 anim-fade-down">
        <div>
          <div className="flex items-center gap-3">
            <TickerLogo symbol={stock.symbol} size={36} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-lg font-mono">{stock.symbol}</span>
                <span className={clsx(
                  "text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide",
                  stock.classification === "buy" ? "bg-green/15 text-green" : "bg-purple/20 text-purple-300"
                )}>
                  {stock.classification}
                </span>
              </div>
              {m.sector && <p className="text-muted text-xs mt-0.5">{m.sector} · {m.industry}</p>}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-muted hover:text-white transition-colors p-1">
          <X size={16} />
        </button>
      </div>

      {/* Price row */}
      <div className="px-4 py-3 flex items-end gap-4 border-b border-border flex-shrink-0">
        <div>
          <p className="text-2xl font-mono font-bold text-white">${m.close_price?.toFixed(2)}</p>
          <p className="text-xs text-muted mt-0.5">{m.date}</p>
        </div>
        <div className="flex gap-4 text-xs pb-1">
          <div><p className="text-muted">52W Low</p><p className="font-mono text-white">${m.low_52_week?.toFixed(2)}</p></div>
          <div><p className="text-muted">52W High</p><p className="font-mono text-white">${m.high_52_week?.toFixed(2)}</p></div>
          <div><p className="text-muted">Mkt Cap</p><p className="font-mono text-white">{m.market_cap ? `${(m.market_cap / 1e9).toFixed(1)}B` : "—"}</p></div>
        </div>
      </div>

      {/* Chart controls */}
      <div className="px-4 pt-3 flex items-center justify-between flex-shrink-0">
        <div className="flex gap-1 bg-card2 rounded-lg p-0.5">
          {(["candle", "area"] as ChartMode[]).map((cm) => (
            <button key={cm} onClick={() => setChartMode(cm)}
              className={clsx("px-3 py-1 rounded-md text-xs transition-colors capitalize",
                chartMode === cm ? "bg-white/10 text-white" : "text-muted hover:text-white")}>
              {cm}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {["1mo", "3mo", "6mo", "1y", "2y"].map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={clsx("px-2 py-1 rounded text-xs transition-colors",
                period === p ? "text-green" : "text-muted hover:text-white")}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Main chart */}
      <div className="px-4 pt-2 flex-shrink-0 anim-fade-up" style={{ animationDelay: "60ms" }}>
        {histLoading ? (
          <div className="chart-skeleton h-[220px]" />
        ) : chartMode === "candle" ? (
          <CandlestickChart data={history} height={220} />
        ) : (
          <AreaChart data={areaData} height={220} color="#2EE6A8" />
        )}
      </div>

      {/* Depth of market */}
      <div className="px-4 pt-2 flex-shrink-0 anim-fade-up" style={{ animationDelay: "120ms" }}>
        <p className="text-xs text-muted mb-2">Depth of market</p>
        <DepthChart data={depthData} height={130} />
      </div>

      {/* Metrics grid */}
      <div className="px-4 pt-3 grid grid-cols-3 gap-2 flex-shrink-0 anim-fade-up stagger" style={{ animationDelay: "180ms" }}>
        {[
          { label: "Trailing PE", value: m.trailing_pe?.toFixed(1) ?? "—" },
          { label: "Forward PE", value: m.forward_pe?.toFixed(1) ?? "—" },
          { label: "Rev Growth", value: m.revenue_growth != null ? `${(m.revenue_growth * 100).toFixed(1)}%` : "—" },
          { label: "Earn Growth", value: m.earnings_growth != null ? `${(m.earnings_growth * 100).toFixed(1)}%` : "—" },
          { label: "Profit Margin", value: m.profit_margin != null ? `${(m.profit_margin * 100).toFixed(1)}%` : "—" },
          { label: "Op Margin", value: m.operating_margin != null ? `${(m.operating_margin * 100).toFixed(1)}%` : "—" },
        ].map(({ label, value }) => (
          <div key={label} className="bg-card2 rounded-lg px-3 py-2">
            <p className="text-muted text-[10px]">{label}</p>
            <p className="text-white font-mono text-sm mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* Criteria rules */}
      <div className="px-4 pt-3 flex-shrink-0">
        <p className="text-xs text-muted mb-2">
          Criteria — {result.rules_met}/{result.rules_total} rules met (need {result.min_required})
        </p>
        <div className="space-y-1">
          {result.details.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-xs">
              <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", r.passed ? "bg-green" : "bg-red")} />
              <span className={r.passed ? "text-white/80" : "text-muted"}>{r.description}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="px-4 pt-3 flex-shrink-0">
        <div className="flex gap-1 bg-card2 rounded-lg p-0.5">
          {(["analysis", "news", "financials", "technicals", "chat"] as RightTab[]).map((tab) => (
            <button key={tab} onClick={(e) => {
                e.preventDefault();
                const container = (e.currentTarget as HTMLElement).closest(".overflow-y-auto");
                const scrollTop = container?.scrollTop ?? 0;
                setRightTab(tab);
                requestAnimationFrame(() => { if (container) container.scrollTop = scrollTop; });
              }}
              className={clsx("flex-1 py-1.5 rounded-md text-xs font-medium transition-colors",
                rightTab === tab ? "bg-white/10 text-white" : "text-muted hover:text-white")}>
              {tab === "analysis" ? "AI" : tab === "news" ? "News" : tab === "financials" ? "Financials" : tab === "technicals" ? "Technical" : "Chat"}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {rightTab === "news" ? (
        <div className="px-4 pt-3 pb-4 flex-shrink-0">
          <NewsPanel symbol={stock.symbol} />
        </div>
      ) : rightTab === "financials" ? (
        <div className="px-4 pt-3 pb-4 flex-shrink-0">
          <FinancialsTab symbol={stock.symbol} />
        </div>
      ) : rightTab === "technicals" ? (
        <div className="px-4 pt-3 pb-4 flex-shrink-0">
          <TechnicalsTab history={history} symbol={stock.symbol} currentPrice={m.close_price} />
        </div>
      ) : rightTab === "analysis" ? (
        <div className="px-4 pt-3 pb-4 flex-shrink-0 space-y-3">
          {analysisLoading ? (
            <div className="bg-card2 rounded-lg p-3 text-xs text-muted animate-pulse">Analyzing {stock.symbol}...</div>
          ) : analysis?.analysis_text ? (
            <div className="bg-card2 rounded-lg p-3 text-xs text-white/80 leading-relaxed space-y-1">
              {analysis.analysis_text.split("\n").filter(Boolean).map((line: string, i: number) => (
                <p key={i} className={line.startsWith("-") ? "pl-2 text-white/60" : "text-white/80"}>{line}</p>
              ))}
            </div>
          ) : analysisError ? (
            <div className="bg-card2 rounded-lg p-3 text-xs text-red/80">{analysisError}</div>
          ) : (
            <div className="bg-card2 rounded-lg p-3 text-xs text-muted">Loading...</div>
          )}

          {/* Mark as purchased — only on analysis tab */}
          {!showAddForm ? (
            <button onClick={() => setShowAddForm(true)}
              className="w-full flex items-center justify-center gap-2 bg-green/10 hover:bg-green/20 border border-green/30 text-green rounded-xl py-2.5 text-sm font-medium transition-colors">
              <ShoppingCart size={14} />
              Mark as Purchased
            </button>
          ) : (
            <div className="bg-card2 rounded-xl p-3 space-y-2">
              <p className="text-xs text-muted">Add to portfolio</p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[10px] text-muted">Buy Date</label>
                  <input type="date" value={buyDate} onChange={(e) => setBuyDate(e.target.value)}
                    className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white mt-0.5 focus:outline-none focus:border-green/50" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-muted">Shares</label>
                  <input type="number" min="0.001" step="any" placeholder="1" value={shares}
                    onChange={(e) => setShares(e.target.value)}
                    className="w-full bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white mt-0.5 focus:outline-none focus:border-green/50" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-muted">Buy Price (optional)</label>
                  <input type="number" placeholder={`~${m.close_price?.toFixed(2)}`} value={buyPrice}
                    onChange={(e) => setBuyPrice(e.target.value)}
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
        /* Chat tab — fixed height, no other elements rendered below */
        <div className="flex-shrink-0" style={{ height: 340 }}>
          <StockChat symbol={stock.symbol} currentPrice={stock.metrics.close_price ?? 0} />
        </div>
      )}
    </div>
  );
}
