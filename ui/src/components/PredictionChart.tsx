import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";

interface Props {
  data: any;
  currentPrice: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card2 border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: ${p.value?.toFixed(2)}</p>
      ))}
    </div>
  );
};

export default function PredictionChart({ data, currentPrice }: Props) {
  if (!data?.base) return null;

  // Merge all scenarios by date
  const dateMap: Record<string, any> = {};
  const add = (scenario: string, points: any[]) => {
    points?.forEach((p: any) => {
      if (!dateMap[p.date]) dateMap[p.date] = { date: p.date.slice(5) };
      dateMap[p.date][scenario] = p.price;
    });
  };
  add("Bull", data.bull);
  add("Base", data.base);
  add("Bear", data.bear);

  const chartData = Object.values(dateMap).sort((a: any, b: any) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false}
            tickFormatter={(v) => `$${v.toFixed(0)}`} domain={["auto", "auto"]} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={currentPrice} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
          <Line type="monotone" dataKey="Bull" stroke="#00e676" strokeWidth={1.5} dot={false}
            strokeDasharray="4 2" activeDot={{ r: 3 }} />
          <Line type="monotone" dataKey="Base" stroke="#7c3aed" strokeWidth={2} dot={false}
            activeDot={{ r: 3 }} />
          <Line type="monotone" dataKey="Bear" stroke="#ff1744" strokeWidth={1.5} dot={false}
            strokeDasharray="4 2" activeDot={{ r: 3 }} />
          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
            formatter={(v) => <span style={{ color: "#9ca3af" }}>{v}</span>} />
        </LineChart>
      </ResponsiveContainer>
      {data.summary && (
        <p className="text-muted text-[10px] leading-relaxed px-1">{data.summary}</p>
      )}
    </div>
  );
}
