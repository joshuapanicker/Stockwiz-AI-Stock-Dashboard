import { useState, useMemo, useRef, useEffect } from "react";
import clsx from "clsx";
import { Briefcase, MessageSquare, BarChart2, User, Eye } from "lucide-react";

import ChartWidget, { type ChartType } from "./components/ChartWidget";
import UniverseTable from "./components/UniverseTable";
import StockDetailPanel from "./components/StockDetailPanel";
import UniverseStockPanel from "./components/UniverseStockPanel";
import PortfolioTab from "./components/PortfolioTab";
import GeneralChat from "./components/GeneralChat";
import MarketBar from "./components/MarketBar";
import ProfilePanel from "./components/ProfilePanel";
import SettingsPage from "./components/SettingsPage";

import { useScreener, usePriceHistory, usePortfolio, useMarket } from "./hooks/useApi";
import { usePersistedNumber, makeDragger } from "./hooks/usePersistedNumber";
import type { ScreenedStock, HoldingWithMetrics } from "./types";

type Tab = "analysis" | "portfolio" | "chat";

const NAV_ITEMS: { id: Tab; icon: React.ReactNode; label: string }[] = [
  { id: "analysis", icon: <BarChart2 size={16} />, label: "Analysis" },
  { id: "portfolio", icon: <Briefcase size={16} />, label: "Portfolio" },
  { id: "chat", icon: <MessageSquare size={16} />, label: "Market Chat" },
];

function NavBar({ tab, setTab, settingsOpen, onCloseSettings }: {
  tab: Tab; setTab: (t: Tab) => void;
  settingsOpen: boolean; onCloseSettings: () => void;
}) {
  return (
    <div className="fixed top-[6px] left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-0.5 px-1.5 py-[3px] glass-card border border-border/60 rounded-full shadow-2xl">
        {NAV_ITEMS.map(item => {
          const active = !settingsOpen && tab === item.id;
          const accent = item.id === "chat" ? "purple" : "green";
          return (
            <button key={item.id} onClick={() => { setTab(item.id); if (settingsOpen) onCloseSettings(); }}
              title={item.label}
              className={clsx(
                "relative w-9 h-8 flex flex-col items-center justify-center rounded-full text-xs font-medium transition-all",
                active
                  ? accent === "purple"
                    ? "text-purple drop-shadow-[0_0_6px_rgba(128,85,245,0.6)]"
                    : "text-green drop-shadow-[0_0_6px_rgba(46,230,168,0.6)]"
                  : "text-muted hover:text-white hover:bg-white/5"
              )}>
              {item.icon}
              <span className={clsx(
                "absolute bottom-0.5 w-1 h-1 rounded-full transition-all",
                active ? (accent === "purple" ? "bg-purple" : "bg-green") : "bg-transparent"
              )} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// The four dashboard chart slots — users can hide any of them and restore later
const CHART_SLOTS: { key: string; defaultType: ChartType; row: 0 | 1 }[] = [
  { key: "slot1", defaultType: "candlestick", row: 0 },
  { key: "slot2", defaultType: "area", row: 0 },
  { key: "slot3", defaultType: "roi", row: 1 },
  { key: "slot4", defaultType: "volume_profile", row: 1 },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("analysis");
  const [selectedSymbol, setSelectedSymbol] = useState<string>("AAPL");
  const [selectedUniverseMetrics, setSelectedUniverseMetrics] = useState<any | null>(null);
  const [rightWidth, setRightWidth] = usePersistedNumber("pulse_analysis_right_w", 340);
  const [chartH, setChartH] = usePersistedNumber("pulse_analysis_chart_h", 190);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"profile" | "criteria" | "notifications" | "brokerage" | "security">("criteria");

  // Hidden chart widgets — persisted so the dashboard layout is user-owned
  const [hiddenSlots, setHiddenSlots] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("pulse_hidden_widgets") ?? "[]"); }
    catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem("pulse_hidden_widgets", JSON.stringify(hiddenSlots)); } catch {}
  }, [hiddenSlots]);

  const hideSlot = (key: string) => setHiddenSlots(prev => [...prev, key]);
  const showSlot = (key: string) => setHiddenSlots(prev => prev.filter(k => k !== key));

  function openSettings(tab: "profile" | "criteria" | "notifications" | "brokerage" | "security" = "criteria") {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }

  const rightColRef = useRef<HTMLDivElement>(null);

  const onLRDivider = makeDragger(setRightWidth, () => rightWidth, "x",
    (d, s) => Math.min(600, Math.max(260, s - d)));
  const onChartHDivider = makeDragger(setChartH, () => chartH, "y",
    (d, s) => Math.min(320, Math.max(120, s + d / 2)));

  const { data: screened, loading: screenLoading } = useScreener();
  const market = useMarket();
  const { data: portfolio, loading: portfolioLoading, addHolding, removeHolding, removeHoldings, sellHolding, refresh: refreshPortfolio } = usePortfolio();

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

  const row2H = Math.max(110, Math.round(chartH * 0.79));

  const renderSlot = (slot: { key: string; defaultType: ChartType; row: 0 | 1 }) => (
    <div key={slot.key}
      className="chart-card glass-card bg-card/60 rounded-2xl p-4 border border-border/50 min-w-0 overflow-hidden anim-fade-up flex-1"
      style={{ flexBasis: "calc(50% - 4px)" }}>
      <ChartWidget
        slotKey={slot.key}
        defaultType={slot.defaultType}
        history={featuredHistory}
        history6m={featuredHistory6m}
        symbol={activeSymbol}
        currentPrice={selectedStock?.metrics?.close_price ?? null}
        height={slot.row === 0 ? chartH : row2H}
        label={slot.row === 0 ? (activeSymbol ?? "—") : undefined}
        loadingSkeleton={screenLoading && !featuredHistory.length}
        onHide={() => hideSlot(slot.key)}
      />
    </div>
  );

  const visibleRow0 = CHART_SLOTS.filter(s => s.row === 0 && !hiddenSlots.includes(s.key));
  const visibleRow1 = CHART_SLOTS.filter(s => s.row === 1 && !hiddenSlots.includes(s.key));

  return (
    <div className="h-screen bg-bg text-white font-sans flex flex-col overflow-hidden">

      {/* ── Pulse aurora ambience ── */}
      <div className="aurora-layer" aria-hidden="true">
        <div className="aurora-blob aurora-teal" />
        <div className="aurora-blob aurora-violet" />
        <div className="aurora-blob aurora-sky" />
      </div>

      {/* ── Fixed top-right profile button ── */}
      <button
        onClick={() => setProfileOpen(true)}
        className="fixed top-[6px] right-3 z-50 w-9 h-9 rounded-full glass-card border border-border/60 shadow-2xl flex items-center justify-center text-muted hover:text-white hover:border-green/40 transition-all"
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
        onPortfolioSync={refreshPortfolio}
      />

      {/* ── Floating top nav — fixed, same height as search bar ── */}
      <NavBar tab={tab} setTab={setTab} settingsOpen={settingsOpen} onCloseSettings={() => setSettingsOpen(false)} />

      {/* ── Tab content — full height, nav floats above ── */}
      <div className="flex-1 min-h-0 flex flex-col relative z-10">

        {/* ── TAB 1: Stock Analysis ── */}
        {tab === "analysis" && (
          <div key="analysis" className="flex flex-col flex-1 min-h-0 p-3 pt-8 gap-2 anim-fade-in">
            {/* Top bar — market info + hidden widget chips */}
            <div className="flex items-center flex-shrink-0 gap-3 min-w-0 anim-fade-down">
              <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
                <MarketBar market={market} />
              </div>
              {hiddenSlots.length > 0 && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {hiddenSlots.map(key => (
                    <button key={key} onClick={() => showSlot(key)}
                      title="Show widget"
                      className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-white/5 border border-border/60 text-muted hover:text-green hover:border-green/30 transition-colors">
                      <Eye size={9} />
                      {key.replace("slot", "Chart ")}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Main split */}
            <div className="flex flex-1 min-h-0 min-w-0 gap-0">

              {/* Left: charts + table */}
              <div className="flex flex-col flex-1 min-w-0 min-h-0 gap-2 pr-1 overflow-hidden">
                {/* Charts row 1 */}
                {visibleRow0.length > 0 && (
                  <div className="flex gap-2 flex-shrink-0 min-w-0 stagger">
                    {visibleRow0.map(renderSlot)}
                  </div>
                )}

                {/* Charts row 2 */}
                {visibleRow1.length > 0 && (
                  <div className="flex gap-2 flex-shrink-0 min-w-0 stagger">
                    {visibleRow1.map(renderSlot)}
                  </div>
                )}

                {/* Chart-height drag handle */}
                {(visibleRow0.length > 0 || visibleRow1.length > 0) && (
                  <div onMouseDown={onChartHDivider}
                    title="Drag to resize charts"
                    className="divider-handle h-2 flex-shrink-0 cursor-row-resize flex items-center justify-center">
                    <div className="divider-line w-10 h-0.5 rounded-full bg-border transition-colors" />
                  </div>
                )}

                {/* Universe table — scrollable */}
                <div className="glass-card bg-card/60 rounded-2xl border border-border/50 flex flex-col flex-1 min-h-0 overflow-hidden min-w-0 anim-fade-up" style={{ animationDelay: "150ms" }}>
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
                title="Drag to resize panel"
                className="divider-handle w-1.5 flex-shrink-0 cursor-col-resize flex items-center justify-center mx-1">
                <div className="divider-line w-0.5 h-full bg-border rounded-full transition-colors" />
              </div>

              {/* Right: stock detail */}
              <div ref={rightColRef}
                style={{ width: rightWidth, minWidth: 240, maxWidth: 600 }}
                className="flex-shrink-0 flex flex-col min-h-0 overflow-hidden anim-slide-right">
                <div className="glass-card bg-card/60 rounded-2xl border border-border/50 overflow-hidden flex-1 min-h-0">
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
              onRemoveMultiple={removeHoldings}
              onSell={sellHolding}
              onPortfolioRefresh={refreshPortfolio}
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
