import { useState, useMemo, useRef, useEffect } from "react";
import clsx from "clsx";
import { Briefcase, MessageSquare, BarChart2, User, Plus, GripVertical } from "lucide-react";

import ChartWidget, { type ChartType } from "./components/ChartWidget";
import UniverseTable from "./components/UniverseTable";
import StockDetailPanel from "./components/StockDetailPanel";
import UniverseStockPanel from "./components/UniverseStockPanel";
import PortfolioTab from "./components/PortfolioTab";
import GeneralChat from "./components/GeneralChat";
import MarketBar from "./components/MarketBar";
import ProfilePanel from "./components/ProfilePanel";
import SettingsPage, { type SettingsTab } from "./components/SettingsPage";

import { useScreener, usePriceHistory, usePortfolio, useMarket, useCredits } from "./hooks/useApi";
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

// Dashboard chart slots — a fully dynamic list: users can remove any widget
// and add new ones (each freely switchable to any chart type).
// `w` is the slot's width share of its row (0.25–0.75), adjustable by
// dragging the divider between the two cards in a row.
interface SlotDef { key: string; defaultType: ChartType; w?: number }

const DEFAULT_SLOTS: SlotDef[] = [
  { key: "slot1", defaultType: "candlestick" },
  { key: "slot2", defaultType: "area" },
  { key: "slot3", defaultType: "roi" },
  { key: "slot4", defaultType: "volume_profile" },
];
const MAX_SLOTS = 8;

function loadSlots(): SlotDef[] {
  try {
    const saved = JSON.parse(localStorage.getItem("pulse_chart_slots") ?? "null");
    if (Array.isArray(saved) && saved.every((s: any) => typeof s?.key === "string" && s?.defaultType)) {
      return saved;
    }
  } catch {}
  // Migrate from the old fixed-4-slot hide/show system
  try {
    const hidden: string[] = JSON.parse(localStorage.getItem("pulse_hidden_widgets") ?? "[]");
    return DEFAULT_SLOTS.filter(s => !hidden.includes(s.key));
  } catch {}
  return DEFAULT_SLOTS;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("analysis");
  const [selectedSymbol, setSelectedSymbol] = useState<string>("AAPL");
  const [selectedUniverseMetrics, setSelectedUniverseMetrics] = useState<any | null>(null);
  const [rightWidth, setRightWidth] = usePersistedNumber("pulse_analysis_right_w", 340);
  const [profileOpen, setProfileOpen] = useState(false);
  const { data: creditsStatus } = useCredits();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("criteria");

  // Chart widget slots — persisted so the dashboard layout is user-owned
  const [slots, setSlots] = useState<SlotDef[]>(loadSlots);
  useEffect(() => {
    try { localStorage.setItem("pulse_chart_slots", JSON.stringify(slots)); } catch {}
  }, [slots]);

  const removeSlot = (key: string) => setSlots(prev => prev.filter(s => s.key !== key));
  const addSlot = () => setSlots(prev => {
    if (prev.length >= MAX_SLOTS) return prev;
    return [...prev, { key: `slot_${Date.now()}`, defaultType: "candlestick" as ChartType }];
  });

  // Per-row chart heights — each row is resizable by dragging its bottom edge
  const [rowHeights, setRowHeights] = useState<number[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem("pulse_chart_row_heights") ?? "null");
      if (Array.isArray(v) && v.every((n: any) => Number.isFinite(n))) return v;
    } catch {}
    // Migrate from the old single global chart height
    const legacy = parseFloat(localStorage.getItem("pulse_analysis_chart_h") ?? "");
    const first = Number.isFinite(legacy) ? legacy : 190;
    return [first, Math.max(110, Math.round(first * 0.79)), 150, 150];
  });
  useEffect(() => {
    try { localStorage.setItem("pulse_chart_row_heights", JSON.stringify(rowHeights)); } catch {}
  }, [rowHeights]);
  const getRowH = (i: number) => rowHeights[i] ?? 150;
  const setRowH = (i: number, v: number) => setRowHeights(prev => {
    const next = [...prev];
    next[i] = v;
    return next;
  });

  const setSlotW = (key: string, w: number) =>
    setSlots(prev => prev.map(s => (s.key === key ? { ...s, w } : s)));

  // Drag-to-reorder — pointer-based (not native HTML5 drag, which only shows
  // a translucent ghost while the original stays in place). The real card
  // follows the cursor via transform; the hovered card highlights as the
  // drop target. Dragging is initiated from the grip handle only, so it
  // never fights with the chart libraries' own pointer interactions.
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const reorderSlots = (from: number, to: number) => setSlots(prev => {
    const next = [...prev];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  });

  function startWidgetDrag(e: React.MouseEvent, fromIdx: number) {
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const el = cardRefs.current[slots[fromIdx].key];
    setDragIdx(fromIdx);
    document.body.style.cursor = "grabbing";
    let currentDrop: number | null = null;

    // Three CSS rules fight the inline drag transform and must be neutralized
    // for the card to actually follow the cursor:
    //  - .anim-fade-up (fill-mode: both) keeps its final keyframe transform
    //    applied at animation priority, which overrides style.transform
    //  - .chart-card's hover transition would rubber-band the movement
    //  - ancestor overflow clipping would hide the card outside the grid
    const unclip: { node: HTMLElement; overflow: string }[] = [];
    if (el) {
      el.style.animation = "none";
      el.style.transition = "none";
      el.style.willChange = "transform";
      el.style.zIndex = "60";
      el.style.pointerEvents = "none";
      let p = el.parentElement;
      while (p && p !== document.body) {
        if (getComputedStyle(p).overflow !== "visible") {
          unclip.push({ node: p, overflow: p.style.overflow });
          p.style.overflow = "visible";
        }
        p = p.parentElement;
      }
    }

    function onMove(ev: MouseEvent) {
      if (el) {
        // The actual card travels with the cursor — no ghost image
        el.style.transform =
          `translate(${ev.clientX - startX}px, ${ev.clientY - startY}px) scale(1.03) rotate(0.5deg)`;
        el.style.boxShadow = "0 24px 60px rgba(0,0,0,0.6), 0 0 30px rgba(46,230,168,0.25)";
      }
      let found: number | null = null;
      slots.forEach((s, i) => {
        if (i === fromIdx) return;
        const r = cardRefs.current[s.key]?.getBoundingClientRect();
        if (r && ev.clientX >= r.left && ev.clientX <= r.right &&
            ev.clientY >= r.top && ev.clientY <= r.bottom) found = i;
      });
      if (found !== currentDrop) {
        currentDrop = found;
        setDropIdx(found);
      }
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      if (el) {
        el.style.transform = "";
        el.style.zIndex = "";
        el.style.pointerEvents = "";
        el.style.animation = "";
        el.style.transition = "";
        el.style.willChange = "";
        el.style.boxShadow = "";
      }
      unclip.forEach(({ node, overflow }) => { node.style.overflow = overflow; });
      if (currentDrop != null) reorderSlots(fromIdx, currentDrop);
      setDragIdx(null);
      setDropIdx(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Adjust the width split between the two cards of a row
  function startSplitDrag(e: React.MouseEvent, slotKey: string, startW: number) {
    e.preventDefault();
    const rowWidth = (e.currentTarget as HTMLElement).parentElement?.getBoundingClientRect().width || 1;
    const startX = e.clientX;
    document.body.style.cursor = "col-resize";
    function onMove(ev: MouseEvent) {
      setSlotW(slotKey, Math.min(0.75, Math.max(0.25, startW + (ev.clientX - startX) / rowWidth)));
    }
    function onUp() {
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Adjust a row's height by dragging its bottom edge
  function startRowHeightDrag(e: React.MouseEvent, rowIdx: number) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = getRowH(rowIdx);
    const target = e.currentTarget as HTMLElement;
    target.classList.add("dragging");
    document.body.style.cursor = "row-resize";
    function onMove(ev: MouseEvent) {
      setRowH(rowIdx, Math.min(420, Math.max(110, startH + (ev.clientY - startY))));
    }
    function onUp() {
      target.classList.remove("dragging");
      document.body.style.cursor = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function openSettings(tab: SettingsTab = "criteria") {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }

  const rightColRef = useRef<HTMLDivElement>(null);

  // Full-range divider: the right panel can span from a slim 180px up to
  // nearly the whole viewport (left side keeps a 320px minimum)
  const onLRDivider = makeDragger(setRightWidth, () => rightWidth, "x",
    (d, s) => Math.min(window.innerWidth - 320, Math.max(180, s - d)));

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

  // widthFrac: the slot's width share of its row (null = fill remaining space)
  const renderSlot = (slot: SlotDef, rowIdx: number, flatIdx: number, widthFrac: number | null) => {
    const isDragging = dragIdx === flatIdx;
    const isDropTarget = dropIdx === flatIdx && dragIdx !== null && dragIdx !== flatIdx;
    return (
      <div key={slot.key}
        ref={node => { cardRefs.current[slot.key] = node; }}
        className={clsx(
          "chart-card glass-card bg-card/60 rounded-2xl p-4 border min-w-0 overflow-hidden anim-fade-up transition-colors",
          isDragging
            ? "border-green ring-2 ring-green/60 shadow-2xl"
            : isDropTarget
              ? "border-green/50 ring-2 ring-green/30"
              : "border-border/50"
        )}
        style={widthFrac != null
          ? { width: `calc(${(widthFrac * 100).toFixed(2)}% - 10px)`, flexShrink: 0 }
          : { flex: 1 }}>
        <ChartWidget
          slotKey={slot.key}
          defaultType={slot.defaultType}
          history={featuredHistory}
          history6m={featuredHistory6m}
          symbol={activeSymbol}
          currentPrice={selectedStock?.metrics?.close_price ?? null}
          height={getRowH(rowIdx)}
          label={rowIdx === 0 ? (activeSymbol ?? "—") : undefined}
          loadingSkeleton={screenLoading && !featuredHistory.length}
          onRemove={() => removeSlot(slot.key)}
          extra={
            <button
              onMouseDown={e => startWidgetDrag(e, flatIdx)}
              title="Drag to reorder"
              className="cursor-grab active:cursor-grabbing text-muted hover:text-white p-0.5 rounded transition-colors flex-shrink-0">
              <GripVertical size={12} />
            </button>
          }
        />
      </div>
    );
  };

  // Chunk slots into rows of two — layout grows/shrinks with the slot list
  const slotRows: SlotDef[][] = [];
  for (let i = 0; i < slots.length; i += 2) slotRows.push(slots.slice(i, i + 2));

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
        {creditsStatus && !creditsStatus.has_own_key && (creditsStatus.warning || creditsStatus.exhausted) && (
          <span className={clsx(
            "absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-bg",
            creditsStatus.exhausted ? "bg-red" : "bg-amber-400"
          )} title={creditsStatus.exhausted ? "AI credits exhausted" : "AI credits running low"} />
        )}
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
              {slots.length < MAX_SLOTS && (
                <button onClick={addSlot}
                  title="Add a chart widget"
                  className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full bg-white/5 border border-border/60 text-muted hover:text-green hover:border-green/30 transition-colors flex-shrink-0">
                  <Plus size={10} />
                  Add chart
                </button>
              )}
            </div>

            {/* Main split */}
            <div className="flex flex-1 min-h-0 min-w-0 gap-0">

              {/* Left: charts + table */}
              <div className="flex flex-col flex-1 min-w-0 min-h-0 gap-2 pr-1 overflow-hidden">
                {/* Chart rows — two widgets per row; each row's split and
                    height are adjustable by dragging its side/bottom handles */}
                {slotRows.map((row, rowIdx) => {
                  const w = row[0]?.w ?? 0.5;
                  const twoUp = row.length === 2;
                  return (
                    <div key={rowIdx} className="flex flex-col flex-shrink-0 min-w-0">
                      <div className="flex min-w-0 items-stretch">
                        {renderSlot(row[0], rowIdx, rowIdx * 2, twoUp ? w : null)}
                        {twoUp && (
                          <div onMouseDown={e => startSplitDrag(e, row[0].key, w)}
                            title="Drag to resize widgets"
                            className="divider-handle w-1.5 flex-shrink-0 cursor-col-resize flex items-center justify-center mx-1">
                            <div className="divider-line w-0.5 h-full bg-border rounded-full transition-colors" />
                          </div>
                        )}
                        {twoUp && renderSlot(row[1], rowIdx, rowIdx * 2 + 1, null)}
                      </div>
                      <div onMouseDown={e => startRowHeightDrag(e, rowIdx)}
                        title="Drag to resize row height"
                        className="divider-handle h-2 flex-shrink-0 cursor-row-resize flex items-center justify-center">
                        <div className="divider-line w-10 h-0.5 rounded-full bg-border transition-colors" />
                      </div>
                    </div>
                  );
                })}

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
                style={{ width: rightWidth, minWidth: 180, maxWidth: "calc(100vw - 320px)" }}
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
