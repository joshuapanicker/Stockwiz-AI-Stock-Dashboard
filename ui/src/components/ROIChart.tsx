import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface ROIPoint {
  date: string;
  gain: number;
  baseline: number;
}

interface Props {
  data: ROIPoint[];
  height?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const gain = payload[0]?.value ?? 0;
  return (
    <div className="bg-card2 border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted mb-1">{label}</p>
      <p className={gain >= 0 ? "text-green" : "text-red"}>
        {gain >= 0 ? "+" : ""}{(gain * 100).toFixed(2)}%
      </p>
    </div>
  );
};

export default function ROIChart({ data, height = 180 }: Props) {
  const hasPositive = data.some((d) => d.gain > 0);
  const hasNegative = data.some((d) => d.gain < 0);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="roiGradientPos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8055F5" stopOpacity={0.8} />
            <stop offset="50%" stopColor="#FFAC26" stopOpacity={0.6} />
            <stop offset="95%" stopColor="#FFAC26" stopOpacity={0.1} />
          </linearGradient>
          <linearGradient id="roiGradientNeg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#FF5C7A" stopOpacity={0.1} />
            <stop offset="95%" stopColor="#FF5C7A" stopOpacity={0.6} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fill: "#6E7787", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => v.slice(5)}
        />
        <YAxis
          tick={{ fill: "#6E7787", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
        {hasPositive && (
          <Area
            type="monotone"
            dataKey="gain"
            stroke="#8055F5"
            strokeWidth={2}
            fill="url(#roiGradientPos)"
            dot={false}
            activeDot={{ r: 4, fill: "#8055F5", stroke: "#10131A", strokeWidth: 2 }}
          />
        )}
        {hasNegative && (
          <Area
            type="monotone"
            dataKey="gain"
            stroke="#FF5C7A"
            strokeWidth={2}
            fill="url(#roiGradientNeg)"
            dot={false}
            activeDot={{ r: 4, fill: "#FF5C7A", stroke: "#10131A", strokeWidth: 2 }}
          />
        )}
        {!hasPositive && !hasNegative && (
          <Area
            type="monotone"
            dataKey="gain"
            stroke="#8055F5"
            strokeWidth={2}
            fill="url(#roiGradientPos)"
            dot={false}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
