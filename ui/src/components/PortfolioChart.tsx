import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface Props {
  data: { date: string; close: number }[];
  buyPrice: number | null;
  height?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card2 border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted mb-1">{label}</p>
      <p className="text-white font-mono">${payload[0]?.value?.toFixed(2)}</p>
    </div>
  );
};

export default function PortfolioChart({ data, buyPrice, height = 160 }: Props) {
  if (!data.length) return (
    <div className="flex items-center justify-center text-muted text-xs" style={{ height }}>
      No data
    </div>
  );

  const latest = data[data.length - 1]?.close ?? 0;
  const isUp = buyPrice == null || latest >= buyPrice;
  const lineColor = isUp ? "#2EE6A8" : "#FF5C7A";
  const gradId = isUp ? "pfGradUp" : "pfGradDown";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="pfGradUp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#2EE6A8" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#2EE6A8" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="pfGradDown" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#FF5C7A" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#FF5C7A" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fill: "#6E7787", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => v.slice(5)}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "#6E7787", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v.toFixed(0)}`}
          domain={["auto", "auto"]}
        />
        <Tooltip content={<CustomTooltip />} />
        {buyPrice != null && (
          <ReferenceLine
            y={buyPrice}
            stroke="rgba(255,255,255,0.3)"
            strokeDasharray="5 5"
            label={{ value: `Buy $${buyPrice.toFixed(2)}`, fill: "#9ca3af", fontSize: 10, position: "insideTopLeft" }}
          />
        )}
        <Area
          type="monotone"
          dataKey="close"
          stroke={lineColor}
          strokeWidth={2}
          fill={`url(#${gradId})`}
          dot={false}
          activeDot={{ r: 4, fill: lineColor, stroke: "#10131A", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
