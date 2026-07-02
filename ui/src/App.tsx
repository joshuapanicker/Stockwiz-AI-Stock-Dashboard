import { useState, useMemo, useRef } from "react";
import clsx from "clsx";
import { Briefcase, MessageSquare, BarChart2, User, Settings } from "lucide-react";

import CandlestickChart from "./components/CandlestickChart";
import AreaChart from "./components/AreaChart";
import ROIChart from "./components/ROIChart";
import VolumeProfileChart from "./components/VolumeProfileChart";
import ChartWidget from "./components/ChartWidget";
import UniverseTable from "./components/UniverseTable";
import StockDetailPanel from "./components/StockDetailPanel";
import UniverseStockPanel from "./components/UniverseStockPanel";
import PortfolioTab from "./components/PortfolioTab";
import GeneralChat from "./components/GeneralChat";
import MarketBar from "./components/MarketBar";
import ProfilePanel from "./components/ProfilePanel";
import SettingsPage from "./components/SettingsPage";
import { useAuth } from "./context/AuthContext";

import { useScreener, usePriceHistory, usePortfolio, useMarket } from "./hooks/useApi";
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
  const [selectedSymbol, setSelectedSymbol] = useState<string>("AAPL");
  const [selectedUniverseMetrics, setSelectedUniverseMetrics] = useState<any | null>(null);
  const [rightWidth, setRightWidth] = useState(340);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"profile" | "criteria" | "notifications" | "security">("criteria");

  function openSettings(tab: "profile" | "criteria" | "notifications" | "security" = "criteria") {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }

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
    shares: h.shares ?? 1,
    current_price: h.current_price ?? null,
    gain_pct: h.gain_pct ?? null,
    gain_abs: h.gain_abs ?? null,
    total_value: h.total_value ?? null,
    sell_result: h.sell_result ?? null,
    metrics: h.metrics ?? null,
    history: h.history ?? [],
  })), [portfolio]);

  const portfolioStats = useMemo(() => {
    const netPnl = enrichedHoldings.reduce((s, h) => s + (h.gain_abs ?? 0), 0);
    const avgGain = enrichedHoldings.length
      ? enrichedHoldings.reduce((s, h) => s + (h.gain_pct ?? 0), 0) / enrichedHoldings.length
      : null;
    return {
      holdings: enrichedHoldings.length,
      netPnl: enrichedHoldings.some(h => h.gain_abs != null) ? netPnl : null,
      avgGain: enrichedHoldings.length ? avgGain : null,
      sellSignals: enrichedHoldings.filter(h => h.sell_result?.passed).length,
    };
  }, [enrichedHoldings]);

  const featuredAreaData = featuredHistory.map((d: any) => ({ date: d.date, close: d.close }));
  const roiData = toROIData(featuredHistory6m.map((d: any) => ({ date: d.date, close: d.close })));

  return (
    <div className="h-screen bg-bg text-white font-sans flex flex-col overflow-hidden">

      {/* ── Fixed top-right profile button ── */}
      <button
        onClick={() => setProfileOpen(true)}
        className="fixed top-[6px] right-3 z-50 w-9 h-9 rounded-xl bg-card/90 backdrop-blur-md border border-border/60 shadow-2xl flex items-center justify-center text-muted hover:text-white hover:border-green/40 transition-all"
        title="Profile">
        <User size={15} />
      </button>

      {/* ── Profile slide-in panel ── */}
      <ProfilePanel
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onOpenSettings={openSettings}
        portfolioStats={portfolioStats}
      />

      {/* ── Settings full-screen page ── */}
      <SettingsPage
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialTab={settingsTab}
      />

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
                    <ChartWidget
                      slotKey="slot1"
                      defaultType="candlestick"
                      history={featuredHistory}
                      history6m={featuredHistory6m}
                      symbol={activeSymbol}
                      currentPrice={selectedStock?.metrics?.close_price ?? null}
                      height={190}
                      label={activeSymbol ?? "—"}
                      loadingSkeleton={screenLoading && !featuredHistory.length}
                    />
                  </div>
                  <div className="bg-card rounded-2xl p-4 border border-border/50 min-w-0 overflow-hidden anim-fade-up">
                    <ChartWidget
                      slotKey="slot2"
                      defaultType="area"
                      history={featuredHistory}
                      history6m={featuredHistory6m}
                      symbol={activeSymbol}
                      currentPrice={selectedStock?.metrics?.close_price ?? null}
                      height={190}
                      label={activeSymbol ?? "—"}
                      loadingSkeleton={screenLoading && !featuredHistory.length}
                    />
                  </div>
                </div>

                {/* Charts row 2 */}
                <div className="grid grid-cols-2 gap-2 flex-shrink-0 min-w-0 stagger">
                  <div className="bg-card rounded-2xl p-4 border border-border/50 min-w-0 overflow-hidden anim-fade-up">
                    <ChartWidget
                      slotKey="slot3"
                      defaultType="roi"
                      history={featuredHistory}
                      history6m={featuredHistory6m}
                      symbol={activeSymbol}
                      currentPrice={selectedStock?.metrics?.close_price ?? null}
                      height={150}
                      loadingSkeleton={screenLoading && !featuredHistory6m.length}
                    />
                  </div>
                  <div className="bg-card rounded-2xl p-4 border border-border/50 min-w-0 overflow-hidden anim-fade-up">
                    <ChartWidget
                      slotKey="slot4"
                      defaultType="volume_profile"
                      history={featuredHistory}
                      history6m={featuredHistory6m}
                      symbol={activeSymbol}
                      currentPrice={selectedStock?.metrics?.close_price ?? null}
                      height={150}
                      loadingSkeleton={screenLoading && !featuredHistory.length}
                    />
                  </div>
                </div>

                {/* Universe table — scrollable */}
                <div className="bg-card rounded-2xl border border-border/50 flex flex-col flex-1 min-h-0 overflow-hidden min-w-0 anim-fade-up" style={{ animationDelay: "150ms" }}>
                  <UniverseTable
                    selected={selectedSymbol}
                    onSelect={(s, metrics) => { setSelectedSymbol(s); setSelectedUniverseMetrics(metrics ?? null); }}
                    onFirstLoad={s => setSelectedSymbol(s)}
                    onOpenCriteria={() => openSettings("criteria")}
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
                    <StockDetailPanel stock={selectedStock} onClose={() => setSelectedSymbol("AAPL")} onAddToPortfolio={addHolding} />
                  ) : activeSymbol ? (
                    <UniverseStockPanel
                      symbol={activeSymbol}
                      cachedMetrics={selectedUniverseMetrics}
                      onClose={() => setSelectedSymbol("AAPL")}
                      onAddToPortfolio={addHolding}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted text-xs">
                      Select a stock
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
