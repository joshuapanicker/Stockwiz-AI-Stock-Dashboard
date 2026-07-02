/**
 * Bollinger Bands — 20-period SMA ± 2 standard deviations.
 * Price near upper band = overbought, near lower band = oversold.
 * Band squeeze = low volatility, often precedes a breakout.
 */
import { useMemo } from "react";
import { ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface OHLCBar { date: string; close: number; }
interface Props { history: OHLCBar[]; height?: number; }

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card2 border border-border rounded-lg px-3 py-2 text-xs shadow-xl space-y-1">
      <p className="text-muted mb-1">{label}</p>
      {payload.filter((p: any) => p.value != null).map((p: any) => (
        <p key={p.name} style={{ color: p.stroke ?? p.fill }}>
          {p.name}: ${Number(Array.isArray(p.value) ? p.value[1] : p.value).toFixed(2)}
        </p>
      ))}
    </div>
  );
};

export default function BollingerChart({ history, height = 190 }: Props) {
  const data = useMemo(() => {
    const period = 20;
    if (history.length < period) return [];
    const closes = history.map(h => h.close);
    return history.slice(period - 1).map((h, i) => {
      const slice = closes.slice(i, i + period);
      const mean  = slice.reduce((a, b) => a + b, 0) / period;
      const std   = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
      return {
        date:   h.date.slice(5),
        Price:  h.close,
        Middle: mean,
        Band:   [mean - 2 * std, mean + 2 * std],
      };
    });
  }, [history]);

  if (!data.length) return (
    <div className="flex items-center justify-center text-muted text-xs" style={{ height }}>Need 20+ bars</div>
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="bbGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#7c3aed" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} axisLine={false} tickLine={false}
          tickFormatter={v => `$${Number(v).toFixed(0)}`} domain={["auto", "auto"]} width={42} />
        <Tooltip content={<CustomTooltip />} />
        {/* Band area */}
        <Area type="monotone" dataKey="Band" stroke="none" fill="url(#bbGrad)" name="Bands" />
        {/* Middle SMA */}
        <Line type="monotone" dataKey="Middle" stroke="#7c3aed" strokeWidth={1} dot={false} strokeDasharray="3 2" name="SMA 20" />
        {/* Price */}
        <Line type="monotone" dataKey="Price" stroke="#00e676" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} name="Price" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
