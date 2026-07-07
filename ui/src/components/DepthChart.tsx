import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DepthLevel {
  price: number;
  bidSize: number;
  askSize: number;
}

interface Props {
  data: DepthLevel[];
  height?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card2 border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted mb-1">${Number(label).toFixed(2)}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value?.toFixed(0)}
        </p>
      ))}
    </div>
  );
};

export default function DepthChart({ data, height = 160 }: Props) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
        <defs>
          <linearGradient id="bidGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#2EE6A8" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#2EE6A8" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="askGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#FF5C7A" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#FF5C7A" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="price"
          tick={{ fill: "#6E7787", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
        />
        <YAxis
          tick={{ fill: "#6E7787", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="stepAfter"
          dataKey="bidSize"
          name="Bid"
          stroke="#2EE6A8"
          strokeWidth={1.5}
          fill="url(#bidGrad)"
          dot={false}
        />
        <Area
          type="stepBefore"
          dataKey="askSize"
          name="Ask"
          stroke="#FF5C7A"
          strokeWidth={1.5}
          fill="url(#askGrad)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
