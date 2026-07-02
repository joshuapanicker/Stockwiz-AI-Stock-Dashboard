/**
 * RelativeStrengthChart — compares a stock's % return vs SPY over the same period.
 * Both lines start at 0% on day 1, showing relative outperformance/underperformance.
 */
import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts";
import { usePriceHistory } from "../hooks/useApi";

interface OHLCBar { date: string; close: number; }
interface Props { history: OHLCBar[]; symbol: string; height?: number; }

function toReturn(bars: OHLCBar[]): { date: string; ret: number }[] {
  if (!bars.length) return [];
  const base = bars[0].close;
  return bars.map(b => ({ date: b.date.slice(5), ret: (b.close - base) / base * 100 }));
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card2 border border-border rounded-lg px-3 py-2 text-xs shadow-xl space-y-1">
      <p className="text-muted mb-1">{label}</p>
      {payload.map((p: any) => p.value != null && (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value >= 0 ? "+" : ""}{p.value.toFixed(1)}%
        </p>
      ))}
    </div>
  );
};

export default function RelativeStrengthChart({ history, symbol, height = 190 }: Props) {
  const { data: spyHistory } = usePriceHistory("SPY", "1y");

  const data = useMemo(() => {
    if (!history.length || !spyHistory.length) return [];
    const stockRet = toReturn(history);
    const spyRet   = toReturn(spyHistory as OHLCBar[]);
    // Align by date — only include dates present in both
    const spyMap = new Map(spyRet.map(d => [d.date, d.ret]));
    return stockRet.map(d => ({
      date: d.date,
      [symbol]: d.ret,
      SPY: spyMap.get(d.date) ?? null,
    })).filter(d => d.SPY != null);
  }, [history, spyHistory, symbol]);

  if (!data.length) return (
    <div className="flex items-center justify-center text-muted text-xs" style={{ height }}>Loading...</div>
  );

  const stockColor = "#00e676";
  const spyColor   = "#6b7280";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 9 }} axisLine={false} tickLine={false}
          interval="preserveStartEnd" />
        <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} axisLine={false} tickLine={false}
          tickFormatter={v => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`} domain={["auto", "auto"]} width={38} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 9, paddingTop: 4 }}
          formatter={v => <span style={{ color: "#9ca3af" }}>{v}</span>} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
        <Line type="monotone" dataKey={symbol} stroke={stockColor} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
        <Line type="monotone" dataKey="SPY"    stroke={spyColor}   strokeWidth={1.5} dot={false} strokeDasharray="4 2" activeDot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
