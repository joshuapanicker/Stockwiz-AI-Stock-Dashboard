/**
 * MACD Chart — Moving Average Convergence Divergence.
 * MACD line = 12 EMA - 26 EMA. Signal = 9 EMA of MACD.
 * Histogram = MACD - Signal. Bullish when MACD crosses above Signal.
 */
import { useMemo } from "react";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";

interface OHLCBar { date: string; close: number; }
interface Props { history: OHLCBar[]; height?: number; }

function ema(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = data[0];
  data.forEach(v => { prev = v * k + prev * (1 - k); result.push(prev); });
  return result;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card2 border border-border rounded-lg px-3 py-2 text-xs shadow-xl space-y-1">
      <p className="text-muted mb-1">{label}</p>
      {payload.map((p: any) => p.value != null && (
        <p key={p.name} style={{ color: p.color ?? p.fill }}>
          {p.name}: {Number(p.value).toFixed(3)}
        </p>
      ))}
    </div>
  );
};

export default function MACDChart({ history, height = 150 }: Props) {
  const data = useMemo(() => {
    if (history.length < 27) return [];
    const closes = history.map(h => h.close);
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const macd  = ema12.map((v, i) => v - ema26[i]);
    const signal = ema(macd.slice(25), 9);
    return history.slice(25).map((h, i) => ({
      date: h.date.slice(5),
      MACD: macd[i + 25],
      Signal: signal[i] ?? null,
      Hist: signal[i] != null ? macd[i + 25] - signal[i] : null,
    }));
  }, [history]);

  if (!data.length) return (
    <div className="flex items-center justify-center text-muted text-xs" style={{ height }}>Need 27+ bars</div>
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <XAxis dataKey="date" tick={{ fill: "#6E7787", fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: "#6E7787", fontSize: 9 }} axisLine={false} tickLine={false} width={36} tickFormatter={v => v.toFixed(1)} />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
        <Bar dataKey="Hist" name="Histogram" maxBarSize={4}>
          {data.map((d, i) => (
            <Cell key={i} fill={(d.Hist ?? 0) >= 0 ? "rgba(46,230,168,0.6)" : "rgba(255,92,122,0.6)"} />
          ))}
        </Bar>
        <Line type="monotone" dataKey="MACD"   stroke="#2EE6A8" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
        <Line type="monotone" dataKey="Signal" stroke="#FFAC26" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
