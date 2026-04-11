import { useState, useMemo, useRef, useEffect } from "react";
import clsx from "clsx";
import { Briefcase, MessageSquare, BarChart2, RefreshCw } from "lucide-react";

import CandlestickChart from "./components/CandlestickChart";
import AreaChart from "./components/AreaChart";
import ROIChart from "./components/ROIChart";
import DepthChart from "./components/DepthChart";
import StockTable from "./components/StockTable";
import StockDetailPanel from "./components/StockDetailPanel";
import PortfolioTab from "./components/PortfolioTab";
import GeneralChat from "./components/GeneralChat";
import SearchBar from "./components/SearchBar";
import MarketBar from "./components/MarketBar";

import { useScreener, usePriceHistory, usePortfolio, useMarket, useAnalysis } from "./hooks/useApi";
import { generateDepthData } from "./utils/mockDepth";
import type { ScreenedStock, HoldingWithMetrics } from "./types";

type Tab = "analysis" | "portfolio" | "chat";
type LeftTab = "buy" | "watch";

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
  const [leftTab, setLeftTab] = useState<LeftTab>("buy");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [searchSymbol, setSearchSymbol] = useState<string | null>(null);
  const [rightWidth, setRightWidth] = useState(340);

  const rightColRef = useRef<HTMLDivElement>(null);

  const onLRDivider = makeDragger(setRightWidth, () => rightWidth, "x",
    (d, s) => Math.min(600, Math.max(260, s - d)));

  const { data: screened, loading: screenLoading, refresh } = useScreener();
  const market = useMarket();
  const { data: portfolio, loading: portfolioLoading, addHolding, removeHolding } = usePortfolio();

  const buyStocks = useMemo(() => screened.filter((s: ScreenedStock) => s.classification === "buy"), [screened]);
  const watchStocks = useMemo(() => screened.filter((s: ScreenedStock) => s.classification === "watch"), [screened]);

  const defaultSymbol = useMemo(() => {
    return (leftTab === "buy" ? buyStocks : watchStocks)[0]?.symbol ?? null;
  }, [leftTab, buyStocks, watchStocks]);

  const activeSymbol = selectedSymbol ?? searchSymbol ?? defaultSymbol;

  const { data: featuredHistory } = usePriceHistory(activeSymbol, "1y");
  const { data: featuredHistory6m } = usePriceHistory(activeSymbol, "6mo");
  const { data: searchHistory } = usePriceHistory(searchSymbol, "1y");
  const { data: searchAnalysis } = useAnalysis(searchSymbol, "buy");

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
    const price = screened.find((s: ScreenedStock) => s.symbol === activeSymbol)?.metrics?.close_price ?? 100;
    return generateDepthData(price);
  }, [activeSymbol, screened]);

  const currentStocks = leftTab === "buy" ? buyStocks : watchStocks;

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
                      <span className="text-xs font-medium text-white/80 bg-card2 px-3 py-1 rounded-lg">Watchlists</span>
                      <div className="flex items-center gap-2">
                        {activeSymbol && <span className="text-xs text-muted font-mono truncate max-w-[80px]">{activeSymbol}</span>}
                        <button onClick={refresh} disabled={screenLoading}
                          className="text-muted hover:text-green transition-colors p-1 rounded-lg hover:bg-white/5 flex-shrink-0">
                          <RefreshCw size={12} className={screenLoading ? "animate-spin text-green" : ""} />
                        </button>
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

                {/* Stock table — scrollable */}
                <div className="bg-card rounded-2xl border border-border/50 flex flex-col flex-1 min-h-0 overflow-hidden min-w-0 anim-fade-up" style={{ animationDelay: "150ms" }}>
                  <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border flex-shrink-0 min-w-0">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="flex gap-1 bg-card2 rounded-lg p-0.5 flex-shrink-0">
                        {(["buy", "watch"] as LeftTab[]).map(t => (
                          <button key={t} onClick={() => setLeftTab(t)}
                            className={clsx("px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                              leftTab === t
                                ? t === "buy" ? "bg-green/15 text-green" : "bg-purple/20 text-purple-300"
                                : "text-muted hover:text-white")}>
                            {t === "buy" ? `Buy (${buyStocks.length})` : `Watch (${watchStocks.length})`}
                          </button>
                        ))}
                      </div>
                      <div className="flex-1 min-w-0 max-w-[200px]">
                        <SearchBar onSelect={s => { setSearchSymbol(s); setSelectedSymbol(null); }} />
                      </div>
                    </div>
                    <span className="text-xs text-muted flex-shrink-0 ml-2">{screenLoading ? "Scanning..." : `${currentStocks.length} stocks`}</span>
                  </div>
                  <div className="overflow-y-auto flex-1">
                    <StockTable stocks={currentStocks} selected={selectedSymbol}
                      onSelect={s => { setSelectedSymbol(s); setSearchSymbol(null); }} mode={leftTab} />
                  </div>
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
                  ) : searchSymbol ? (
                    <SearchResultPanel symbol={searchSymbol} history={searchHistory} analysis={searchAnalysis} onClose={() => setSearchSymbol(null)} />
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

// ── Sub-components ─────────────────────────────────────────────────────────

function SearchResultPanel({ symbol, history, analysis, onClose }: {
  symbol: string; history: any[]; analysis: any; onClose: () => void;
}) {
  const areaData = history.map((d: any) => ({ date: d.date, close: d.close }));
  const depthData = generateDepthData(history[history.length - 1]?.close ?? 100);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
        <div>
          <span className="text-white font-bold text-lg font-mono">{symbol}</span>
          <p className="text-muted text-xs mt-0.5">Search result</p>
        </div>
        <button onClick={onClose} className="text-muted hover:text-white text-xs px-2 py-1 bg-card2 rounded-lg">✕</button>
      </div>
      <div className="px-4 pt-3 flex-shrink-0">
        <p className="text-xs text-muted mb-2">Price (1Y)</p>
        {areaData.length > 0
          ? <AreaChart data={areaData} height={190} color="#7c3aed" />
          : <div className="flex items-center justify-center h-[190px] text-muted text-xs">Loading...</div>}
      </div>
      <div className="px-4 pt-3 flex-shrink-0">
        <p className="text-xs text-muted mb-2">Depth of market</p>
        <DepthChart data={depthData} height={120} />
      </div>
      <div className="px-4 pt-3 pb-4 flex-shrink-0">
        <p className="text-xs text-muted mb-2">Why this stock isn't optimal right now</p>
        {analysis?.analysis_text ? (
          <div className="bg-card2 rounded-lg p-3 text-xs text-white leading-relaxed space-y-1">
            {analysis.analysis_text.split("\n").filter(Boolean).map((line: string, i: number) => (
              <p key={i} className={line.startsWith("-") ? "pl-2" : ""}>{line}</p>
            ))}
          </div>
        ) : (
          <div className="bg-card2 rounded-lg p-3 text-xs text-muted animate-pulse">Analyzing {symbol}...</div>
        )}
      </div>
    </div>
  );
}
