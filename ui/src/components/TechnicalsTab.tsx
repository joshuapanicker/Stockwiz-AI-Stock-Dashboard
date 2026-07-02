/**
 * TechnicalsTab — RSI + Moving Averages using existing price history data.
 * No extra API calls needed — uses the history already fetched by the panel.
 */
import clsx from "clsx";
import RSIChart from "./RSIChart";
import MovingAverageChart from "./MovingAverageChart";

interface Props {
  history: any[];  // OHLCV bars
  symbol: string;
  currentPrice?: number | null;
}

function interpretRSI(rsi: number | null): { label: string; color: string } {
  if (rsi == null) return { label: "N/A", color: "text-muted" };
  if (rsi > 70) return { label: `${rsi.toFixed(0)} — Overbought`, color: "text-red" };
  if (rsi < 30) return { label: `${rsi.toFixed(0)} — Oversold`,   color: "text-green" };
  return { label: `${rsi.toFixed(0)} — Neutral`, color: "text-white/70" };
}

function computeLatestRSI(history: any[]): number | null {
  const closes = history.map(h => h.close);
  const period = 14;
  if (closes.length < period + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export default function TechnicalsTab({ history, symbol, currentPrice }: Props) {
  const closes = history.map(h => h.close);
  const latestRSI = computeLatestRSI(history);
  const ma20  = computeSMA(closes, 20);
  const ma50  = computeSMA(closes, 50);
  const ma200 = computeSMA(closes, 200);
  const price = currentPrice ?? closes[closes.length - 1] ?? null;

  const maSignal = (ma: number | null, label: string) => {
    if (!ma || !price) return null;
    const aboveBelow = price > ma ? "above" : "below";
    const color = price > ma ? "text-green" : "text-red";
    return { label, value: `$${ma.toFixed(2)}`, signal: aboveBelow, color };
  };

  const maRows = [
    maSignal(ma20,  "20 DMA"),
    maSignal(ma50,  "50 DMA"),
    maSignal(ma200, "200 DMA"),
  ].filter(Boolean);

  const { label: rsiLabel, color: rsiColor } = interpretRSI(latestRSI);

  return (
    <div className="space-y-4">
      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-card2 rounded-xl px-3 py-2.5 border border-border/40">
          <p className="text-muted text-[10px]">RSI (14)</p>
          <p className={clsx("font-mono text-sm font-bold mt-0.5", rsiColor)}>{rsiLabel}</p>
        </div>
        {maRows[0] && (
          <div className="bg-card2 rounded-xl px-3 py-2.5 border border-border/40">
            <p className="text-muted text-[10px]">vs 20 DMA</p>
            <p className={clsx("font-mono text-sm font-bold mt-0.5", maRows[0]!.color)}>
              {maRows[0]!.signal === "above" ? "▲ Above" : "▼ Below"} {maRows[0]!.value}
            </p>
          </div>
        )}
      </div>

      {/* MA rows */}
      {maRows.length > 0 && (
        <div className="space-y-1.5">
          {maRows.map(row => row && (
            <div key={row.label} className="flex items-center justify-between text-xs px-3 py-2 bg-card2 rounded-lg border border-border/30">
              <span className="text-muted">{row.label}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-white/70">{row.value}</span>
                <span className={clsx("text-[10px] font-medium", row.color)}>
                  {row.signal === "above" ? "Price above ↑" : "Price below ↓"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RSI chart */}
      {history.length > 15 && (
        <div>
          <p className="text-xs text-muted mb-2">RSI (14-period)</p>
          <RSIChart history={history} height={110} />
        </div>
      )}

      {/* MA chart */}
      {history.length > 20 && (
        <div>
          <p className="text-xs text-muted mb-2">Price + Moving Averages</p>
          <MovingAverageChart history={history} height={130} />
        </div>
      )}
    </div>
  );
}
