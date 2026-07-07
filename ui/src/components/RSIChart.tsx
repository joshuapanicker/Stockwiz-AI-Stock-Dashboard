/**
 * RSIChart — 14-period Relative Strength Index.
 * RSI > 70 = overbought (red zone), RSI < 30 = oversold (green zone).
 */
import { useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid
} from "recharts";

interface OHLCBar { date: string; close: number; }
interface Props { history: OHLCBar[]; height?: number; }

function computeRSI(closes: number[], period = 14): (number | null)[] {
  const rsi: (number | null)[] = Array(closes.length).fill(null);
  if (closes.length < period + 1) return rsi;

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period; avgLoss /= period;

  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      const diff = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi[i] = 100 - 100 / (1 + rs);
  }
  return rsi;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length || payload[0].value == null) return null;
  const v = payload[0].value;
  const color = v > 70 ? "#FF5C7A" : v < 30 ? "#2EE6A8" : "#6E7787";
  return (
    <div className="bg-card2 border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted mb-1">{label}</p>
      <p style={{ color }}>RSI: {v.toFixed(1)}{v > 70 ? " — Overbought" : v < 30 ? " — Oversold" : ""}</p>
    </div>
  );
};

export default function RSIChart({ history, height = 150 }: Props) {
  const data = useMemo(() => {
    const closes = history.map(h => h.close);
    const rsi = computeRSI(closes);
    return history.map((h, i) => ({ date: h.date.slice(5), rsi: rsi[i] })).filter(d => d.rsi != null);
  }, [history]);

  if (!data.length) return (
    <div className="flex items-center justify-center text-muted text-xs" style={{ height }}>Need 15+ bars</div>
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="rsiGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#8055F5" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#8055F5" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.03)" />
        <XAxis dataKey="date" tick={{ fill: "#6E7787", fontSize: 9 }} axisLine={false} tickLine={false}
          interval="preserveStartEnd" />
        <YAxis tick={{ fill: "#6E7787", fontSize: 9 }} axisLine={false} tickLine={false}
          domain={[0, 100]} ticks={[0, 30, 50, 70, 100]} width={28} />
        <Tooltip content={<CustomTooltip />} />
        {/* Overbought / oversold zones */}
        <ReferenceLine y={70} stroke="rgba(255,92,122,0.5)"  strokeDasharray="3 3" label={{ value: "70", fill: "#FF5C7A", fontSize: 8, position: "insideRight" }} />
        <ReferenceLine y={30} stroke="rgba(46,230,168,0.5)"  strokeDasharray="3 3" label={{ value: "30", fill: "#2EE6A8", fontSize: 8, position: "insideRight" }} />
        <ReferenceLine y={50} stroke="rgba(255,255,255,0.08)" />
        <Area type="monotone" dataKey="rsi" stroke="#8055F5" strokeWidth={1.5}
          fill="url(#rsiGrad)" dot={false} activeDot={{ r: 3 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
