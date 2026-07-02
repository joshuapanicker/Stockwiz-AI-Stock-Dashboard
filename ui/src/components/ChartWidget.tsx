/**
 * ChartWidget — a chart slot on the main dashboard.
 * Has a swap button (⇄) that lets users pick which chart type to display.
 * Selection is persisted to localStorage.
 */
import { useState, useRef, useEffect } from "react";
import clsx from "clsx";
import { ArrowLeftRight, ChevronDown } from "lucide-react";

import CandlestickChart from "./CandlestickChart";
import AreaChart from "./AreaChart";
import ROIChart from "./ROIChart";
import VolumeProfileChart from "./VolumeProfileChart";
import MovingAverageChart from "./MovingAverageChart";
import RSIChart from "./RSIChart";
import RelativeStrengthChart from "./RelativeStrengthChart";

export type ChartType =
  | "candlestick"
  | "area"
  | "roi"
  | "volume_profile"
  | "moving_averages"
  | "rsi"
  | "relative_strength";

export const CHART_OPTIONS: { value: ChartType; label: string; desc: string }[] = [
  { value: "candlestick",       label: "Candlestick",       desc: "OHLC price action" },
  { value: "area",              label: "Area",              desc: "Smoothed price line" },
  { value: "roi",               label: "ROI %",             desc: "Return from period start" },
  { value: "volume_profile",    label: "Volume Profile",    desc: "Volume by price level" },
  { value: "moving_averages",   label: "Moving Averages",   desc: "20 / 50 / 200 DMA" },
  { value: "rsi",               label: "RSI (14)",          desc: "Overbought / oversold" },
  { value: "relative_strength", label: "vs SPY",            desc: "Relative performance" },
];

interface ChartRendererProps {
  type: ChartType;
  history: any[];
  history6m?: any[];
  symbol: string;
  currentPrice?: number | null;
  height: number;
  loadingSkeleton?: boolean;
}

export function ChartRenderer({ type, history, history6m, symbol, currentPrice, height, loadingSkeleton }: ChartRendererProps) {
  if (loadingSkeleton) return <div className={`chart-skeleton h-[${height}px]`} style={{ height }} />;

  const h1y  = history;
  const h6m  = history6m ?? history;
  const roi  = (() => {
    if (!h6m.length) return [];
    const base = h6m[0]?.close ?? 1;
    return h6m.map((d: any) => ({ date: d.date, gain: (d.close - base) / base, baseline: 0 }));
  })();
  const area = h1y.map((d: any) => ({ date: d.date, close: d.close }));

  if (!h1y.length) return (
    <div className="flex items-center justify-center text-muted text-xs" style={{ height }}>Select a stock</div>
  );

  switch (type) {
    case "candlestick":       return <CandlestickChart data={h1y} height={height} />;
    case "area":              return <AreaChart data={area} height={height} color="#00e676" />;
    case "roi":               return roi.length ? <ROIChart data={roi} height={height} /> : <div className="flex items-center justify-center text-muted text-xs" style={{ height }}>No data</div>;
    case "volume_profile":    return <VolumeProfileChart history={h1y} currentPrice={currentPrice} height={height} />;
    case "moving_averages":   return <MovingAverageChart history={h1y} height={height} />;
    case "rsi":               return <RSIChart history={h1y} height={height} />;
    case "relative_strength": return <RelativeStrengthChart history={h1y} symbol={symbol} height={height} />;
    default:                  return null;
  }
}

interface Props {
  slotKey: string;         // unique key for localStorage persistence
  defaultType: ChartType;
  history: any[];
  history6m?: any[];
  symbol: string;
  currentPrice?: number | null;
  height: number;
  label?: string;
  extra?: React.ReactNode;  // extra content in the header (e.g. period selector)
  loadingSkeleton?: boolean;
}

export default function ChartWidget({
  slotKey, defaultType, history, history6m, symbol,
  currentPrice, height, label, extra, loadingSkeleton,
}: Props) {
  const storageKey = `chart_widget_${slotKey}`;
  const [chartType, setChartType] = useState<ChartType>(() => {
    try { return (localStorage.getItem(storageKey) as ChartType) || defaultType; }
    catch { return defaultType; }
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function selectType(t: ChartType) {
    setChartType(t);
    try { localStorage.setItem(storageKey, t); } catch {}
    setMenuOpen(false);
  }

  const currentOption = CHART_OPTIONS.find(o => o.value === chartType)!;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0 relative" ref={menuRef}>
        <div className="flex items-center gap-2 min-w-0">
          {label && <span className="text-xs text-muted truncate">{label}</span>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {extra}
          {/* Swap button */}
          <button
            onClick={() => setMenuOpen(v => !v)}
            title="Change chart type"
            className={clsx(
              "flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-colors",
              menuOpen ? "bg-green/15 text-green" : "text-muted hover:text-white hover:bg-white/5"
            )}>
            <ArrowLeftRight size={10} />
            <span className="hidden sm:inline">{currentOption.label}</span>
            <ChevronDown size={8} className={clsx("transition-transform", menuOpen && "rotate-180")} />
          </button>
        </div>

        {/* Dropdown */}
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-52 bg-card2 border border-border/70 rounded-xl shadow-2xl z-30 py-1 anim-scale-in">
            {CHART_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => selectType(opt.value)}
                className={clsx(
                  "w-full flex items-start gap-3 px-3 py-2 text-left transition-colors hover:bg-white/5",
                  chartType === opt.value ? "text-green" : "text-white"
                )}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-tight">{opt.label}</p>
                  <p className="text-[10px] text-muted mt-0.5">{opt.desc}</p>
                </div>
                {chartType === opt.value && <span className="text-green text-[10px] mt-0.5">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ChartRenderer
          type={chartType}
          history={history}
          history6m={history6m}
          symbol={symbol}
          currentPrice={currentPrice}
          height={height}
          loadingSkeleton={loadingSkeleton}
        />
      </div>
    </div>
  );
}
