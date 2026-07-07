/**
 * MovingAverageChart — price line with 20/50/200 DMA overlays.
 * Uses recharts ComposedChart since lightweight-charts doesn't support
 * multiple series as cleanly for this use case.
 */
import { useMemo } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from "recharts";

interface OHLCBar { date: string; close: number; }

interface Props {
  history: OHLCBar[];
  height?: number;
}

function sma(data: number[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card2 border border-border rounded-lg px-3 py-2 text-xs shadow-xl space-y-1">
      <p className="text-muted mb-1">{label}</p>
      {payload.map((p: any) => p.value != null && (
        <p key={p.name} style={{ color: p.color }}>{p.name}: ${Number(p.value).toFixed(2)}</p>
      ))}
    </div>
  );
};

export default function MovingAverageChart({ history, height = 190 }: Props) {
  const data = useMemo(() => {
    const closes = history.map(h => h.close);
    const ma20  = sma(closes, 20);
    const ma50  = sma(closes, 50);
    const ma200 = sma(closes, 200);
    return history.map((h, i) => ({
      date: h.date.slice(5),
      Price: h.close,
      "20 DMA": ma20[i],
      "50 DMA": ma50[i],
      "200 DMA": ma200[i],
    }));
  }, [history]);

  if (!data.length) return (
    <div className="flex items-center justify-center text-muted text-xs" style={{ height }}>No data</div>
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <XAxis dataKey="date" tick={{ fill: "#6E7787", fontSize: 9 }} axisLine={false} tickLine={false}
          interval="preserveStartEnd" />
        <YAxis tick={{ fill: "#6E7787", fontSize: 9 }} axisLine={false} tickLine={false}
          tickFormatter={v => `$${Number(v).toFixed(0)}`} domain={["auto", "auto"]} width={42} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 9, paddingTop: 4 }}
          formatter={v => <span style={{ color: "#9ca3af" }}>{v}</span>} />
        <Line type="monotone" dataKey="Price"   stroke="#2EE6A8" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
        <Line type="monotone" dataKey="20 DMA"  stroke="#8055F5" strokeWidth={1.5} dot={false} strokeDasharray="0" activeDot={{ r: 3 }} connectNulls />
        <Line type="monotone" dataKey="50 DMA"  stroke="#FFAC26" strokeWidth={1.5} dot={false} strokeDasharray="0" activeDot={{ r: 3 }} connectNulls />
        <Line type="monotone" dataKey="200 DMA" stroke="#FF5C7A" strokeWidth={1}   dot={false} strokeDasharray="4 2" activeDot={{ r: 3 }} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
