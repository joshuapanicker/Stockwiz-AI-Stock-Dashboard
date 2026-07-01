import { useState, useMemo, useRef, useEffect } from "react";
import clsx from "clsx";
import { Briefcase, MessageSquare, BarChart2, RefreshCw } from "lucide-react";

import CandlestickChart from "./components/CandlestickChart";
import AreaChart from "./components/AreaChart";
import ROIChart from "./components/ROIChart";
import DepthChart from "./components/DepthChart";
import UniverseTable from "./components/UniverseTable";
import StockDetailPanel from "./components/StockDetailPanel";
import PortfolioTab from "./components/PortfolioTab";
import GeneralChat from "./components/GeneralChat";
import MarketBar from "./components/MarketBar";

import { useScreener, usePriceHistory, usePortfolio, useMarket } from "./hooks/useApi";
import { generateDepthData } from "./utils/mockDepth";
import type { ScreenedStock, HoldingWithMetrics } from "./types";

type Tab = "analysis" | "portfolio" | "chat";

function toROIData(history: any[]) {
  if (!history.length) return [];
  const base = history[0]?.close ?? 1;
  return history.map(d => ({ date: d.date, gain: (d.close - base) / base, baseline: 0 }));
}

function makeDragger(
  setVal: (v: number) => void,
  getStart: () => number,
  axis: "x" | "y",
  transform: (delta: number, start: number) => number
) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    const startPos = axis === "x" ? e.clientX : e.clientY;
    const startVal = getStart();
    function onMove(ev: MouseEvent) {
      setVal(transform((axis === "x" ? ev.clientX : ev.clientY) - startPos, startVal));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
}

const NAV_ITEMS: { id: Tab; icon: React.ReactNode; label: string }[] = [
  { id: "analysis", icon: <BarChart2 size={16} />, label: "Analysis" },
  { id: "portfolio", icon: <Briefcase size={16} />, label: "Portfolio" },
  { id: "chat", icon: <MessageSquare size={16} />, label: "Market Chat" },
];

function NavBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div className="fixed top-[6px] left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-0.5 px-1.5 py-[3px] bg-card/90 backdrop-blur-md border border-border/60 rounded-xl shadow-2xl">
        {NAV_ITEMS.map(item => (
          <button key={item.id} onClick={() => setTab(item.id)}
            title={item.label}
            className={clsx(
              "w-9 h-8 flex items-center justify-center rounded-lg text-xs font-medium transition-all",
              tab === item.id
                ? item.id === "chat"
                  ? "bg-purple-500/20 text-purple-400"
                  : "bg-green/15 text-green"
                : "text-muted hover:text-white hover:bg-white/5"
            )}>
            {item.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("analysis");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [rightWidth, setRightWidth] = useState(340);

  const rightColRef = useRef<HTMLDivElement>(null);

  const onLRDivider = makeDragger(setRightWidth, () => rightWidth, "x",
    (d, s) => Math.min(600, Math.max(260, s - d)));

  const { data: screened, loading: screenLoading } = useScreener();
  const market = useMarket();
  const { data: portfolio, loading: portfolioLoading, addHolding, removeHolding } = usePortfolio();

  const activeSymbol = selectedSymbol;

  const { data: featuredHistory } = usePriceHistory(activeSymbol, "1y");
  const { data: featuredHistory6m } = usePriceHistory(activeSymbol, "6mo");

  const selectedStock = useMemo(
    () => screened.find((s: ScreenedStock) => s.symbol === activeSymbol) ?? null,
    [screened, activeSymbol]
  );

  const enrichedHoldings: HoldingWithMetrics[] = useMemo(() => portfolio.map((h: any) => ({
    ...h,
    current_price: h.current_price ?? null,
    gain_pct: h.gain_pct ?? null,
    gain_abs: h.gain_abs ?? null,
    sell_result: h.sell_result ?? null,
    metrics: h.metrics ?? null,
    history: h.history ?? [],
  })), [portfolio]);

  const featuredAreaData = featuredHistory.map((d: any) => ({ date: d.date, close: d.close }));
  const roiData = toROIData(featuredHistory6m.map((d: any) => ({ date: d.date, close: d.close })));
  const depthData = useMemo(() => {
    const price = selectedStock?.metrics?.close_price ?? 100;
    return generateDepthData(price);
  }, [selectedStock]);

  return (
    <div className="h-screen bg-bg text-white font-sans flex flex-col overflow-hidden">

      {/* ── Floating top nav — fixed, same height as search bar ── */}
      <NavBar tab={tab} setTab={setTab} />

      {/* ── Tab content — full height, nav floats above ── */}
      <div className="flex-1 min-h-0 flex flex-col">

        {/* ── TAB 1: Stock Analysis ── */}
        {tab === "analysis" && (
          <div key="analysis" className="flex flex-col flex-1 min-h-0 p-3 pt-8 gap-2 anim-fade-in">
            {/* Top bar — market info + spacing */}
            <div className="flex items-center flex-shrink-0 gap-3 min-w-0 anim-fade-down">
              <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
                <MarketBar market={market} />
              </div>
            </div>

            {/* Main split */}
            <div className="flex flex-1 min-h-0 min-w-0 gap-0">

              {/* Left: charts + table */}
              <div className="flex flex-col flex-1 min-w-0 min-h-0 gap-2 pr-1 overflow-hidden">
                {/* Charts row 1 */}
                <div className="grid grid-cols-2 gap-2 flex-shrink-0 min-w-0 stagger">
                  <div className="bg-card rounded-2xl p-4 border border-border/50 min-w-0 overflow-hidden anim-fade-up">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-white/80 bg-card2 px-3 py-1 rounded-lg">Stock Search Engine</span>
                      <div className="flex items-center gap-2">
                        {activeSymbol && <span className="text-xs text-muted font-mono truncate max-w-[80px]">{activeSymbol}</span>}
                      </div>
                    </div>
                    {featuredHistory.length > 0
                      ? <CandlestickChart data={featuredHistory} height={190} />
                      : <div className={screenLoading ? "chart-skeleton h-[190px]" : "flex items-center justify-center h-[190px] text-muted text-xs"}>{!screenLoading && "Select a stock"}</div>}
                  </div>

                  <div className="bg-card rounded-2xl p-4 border border-border/50 min-w-0 overflow-hidden anim-fade-up">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-mono text-white/80 truncate">{activeSymbol ?? "—"}</span>
                      <span className="text-xs text-muted flex-shrink-0">6mo area</span>
                    </div>
                    {featuredAreaData.length > 0
                      ? <AreaChart data={featuredAreaData} height={190} color="#00e676" />
                      : <div className={screenLoading ? "chart-skeleton h-[190px]" : "flex items-center justify-center h-[190px] text-muted text-xs"}>{!screenLoading && "Select a stock"}</div>}
                  </div>
                </div>

                {/* Charts row 2 */}
                <div className="grid grid-cols-2 gap-2 flex-shrink-0 min-w-0 stagger">
                  <div className="bg-card rounded-2xl p-4 border border-border/50 min-w-0 overflow-hidden anim-fade-up">
                    <p className="text-xs font-semibold text-white mb-2">ROI (6 Month)</p>
                    {roiData.length > 0
                      ? <ROIChart data={roiData} height={150} />
                      : <div className={screenLoading ? "chart-skeleton h-[150px]" : "flex items-center justify-center h-[150px] text-muted text-xs"}>{!screenLoading && "Select a stock"}</div>}
                  </div>
                  <div className="bg-card rounded-2xl p-4 border border-border/50 min-w-0 overflow-hidden anim-fade-up">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-white">Depth of market</p>
                      <span className="text-xs text-muted font-mono truncate max-w-[60px]">{activeSymbol ?? "—"}</span>
                    </div>
                    <DepthChart data={depthData} height={150} />
                  </div>
                </div>

                {/* Universe table — scrollable */}
                <div className="bg-card rounded-2xl border border-border/50 flex flex-col flex-1 min-h-0 overflow-hidden min-w-0 anim-fade-up" style={{ animationDelay: "150ms" }}>
                  <UniverseTable
                    selected={selectedSymbol}
                    onSelect={s => setSelectedSymbol(s)}
                    onFirstLoad={s => { if (!selectedSymbol) setSelectedSymbol(s); }}
                  />
                </div>
              </div>

              {/* L/R divider */}
              <div onMouseDown={onLRDivider}
                className="w-1.5 flex-shrink-0 cursor-col-resize group flex items-center justify-center mx-1">
                <div className="w-0.5 h-full bg-border group-hover:bg-green/40 transition-colors rounded-full" />
              </div>

              {/* Right: stock detail */}
              <div ref={rightColRef}
                style={{ width: rightWidth, minWidth: 240, maxWidth: 600 }}
                className="flex-shrink-0 flex flex-col min-h-0 overflow-hidden anim-slide-right">
                <div className="bg-card rounded-2xl border border-border/50 overflow-hidden flex-1 min-h-0">
                  {selectedStock ? (
                    <StockDetailPanel stock={selectedStock} onClose={() => setSelectedSymbol(null)} onAddToPortfolio={addHolding} />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted text-xs">
                      {screenLoading ? "Loading..." : "Select a stock"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: Portfolio ── */}
        {tab === "portfolio" && (
          <div key="portfolio" className="flex-1 min-h-0 overflow-hidden anim-fade-in">
            <PortfolioTab
              holdings={enrichedHoldings}
              loading={portfolioLoading}
              onAdd={addHolding}
              onRemove={removeHolding}
            />
          </div>
        )}

        {/* ── TAB 3: Market Chat ── */}
        {tab === "chat" && (
          <div key="chat" className="flex-1 min-h-0 overflow-hidden anim-fade-in">
            <GeneralChat />
          </div>
        )}
      </div>
    </div>
  );
}
