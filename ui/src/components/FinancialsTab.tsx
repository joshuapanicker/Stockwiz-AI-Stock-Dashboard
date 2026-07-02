/**
 * FinancialsTab — quarterly revenue and earnings bar chart.
 * Uses yfinance quarterly_financials via a new /api/financials/{symbol} endpoint.
 */
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";
import { RefreshCw } from "lucide-react";
import { apiFetch } from "../hooks/useApi";

interface Props { symbol: string; }

interface FinancialData {
  quarters: { quarter: string; revenue: number | null; net_income: number | null }[];
  revenue_growth_yoy: number | null;
  profit_margin: number | null;
}

function fmtLarge(n: number): string {
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (Math.abs(n) >= 1e9)  return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6)  return `${(n / 1e6).toFixed(1)}M`;
  return `${(n / 1e3).toFixed(0)}K`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card2 border border-border rounded-lg px-3 py-2 text-xs shadow-xl space-y-1">
      <p className="text-muted mb-1">{label}</p>
      {payload.map((p: any) => p.value != null && (
        <p key={p.name} style={{ color: p.fill ?? p.color }}>
          {p.name}: ${fmtLarge(p.value)}
        </p>
      ))}
    </div>
  );
};

export default function FinancialsTab({ symbol }: Props) {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true); setError(false); setData(null);
    apiFetch<FinancialData>(`/financials/${symbol}`)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [symbol]);

  if (loading) return (
    <div className="flex items-center gap-2 text-muted text-xs py-4">
      <RefreshCw size={11} className="animate-spin" /> Loading financials...
    </div>
  );

  if (error || !data || !data.quarters?.length) return (
    <div className="text-muted text-xs py-4">Financial data unavailable for {symbol}.</div>
  );

  const revData = data.quarters.filter(q => q.revenue != null);
  const niData  = data.quarters.filter(q => q.net_income != null);

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-card2 rounded-xl px-3 py-2.5 border border-border/40">
          <p className="text-muted text-[10px]">YoY Revenue Growth</p>
          <p className={`font-mono text-sm font-bold mt-0.5 ${
            data.revenue_growth_yoy == null ? "text-muted"
            : data.revenue_growth_yoy >= 0 ? "text-green" : "text-red"
          }`}>
            {data.revenue_growth_yoy != null
              ? `${data.revenue_growth_yoy >= 0 ? "+" : ""}${(data.revenue_growth_yoy * 100).toFixed(1)}%`
              : "—"}
          </p>
        </div>
        <div className="bg-card2 rounded-xl px-3 py-2.5 border border-border/40">
          <p className="text-muted text-[10px]">Profit Margin</p>
          <p className={`font-mono text-sm font-bold mt-0.5 ${
            data.profit_margin == null ? "text-muted"
            : data.profit_margin >= 0 ? "text-green" : "text-red"
          }`}>
            {data.profit_margin != null ? `${(data.profit_margin * 100).toFixed(1)}%` : "—"}
          </p>
        </div>
      </div>

      {/* Revenue chart */}
      {revData.length > 0 && (
        <div>
          <p className="text-xs text-muted mb-2">Quarterly Revenue</p>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={revData} margin={{ top: 0, right: 0, left: -15, bottom: 0 }}>
              <XAxis dataKey="quarter" tick={{ fill: "#6b7280", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} axisLine={false} tickLine={false}
                tickFormatter={v => `$${fmtLarge(v)}`} width={38} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="revenue" name="Revenue" radius={[3, 3, 0, 0]} maxBarSize={24}>
                {revData.map((_, i) => (
                  <Cell key={i} fill={i === revData.length - 1 ? "rgba(0,230,118,0.7)" : "rgba(0,230,118,0.35)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Net income chart */}
      {niData.length > 0 && (
        <div>
          <p className="text-xs text-muted mb-2">Quarterly Net Income</p>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={niData} margin={{ top: 0, right: 0, left: -15, bottom: 0 }}>
              <XAxis dataKey="quarter" tick={{ fill: "#6b7280", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} axisLine={false} tickLine={false}
                tickFormatter={v => `$${fmtLarge(v)}`} width={38} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="net_income" name="Net Income" radius={[3, 3, 0, 0]} maxBarSize={24}>
                {niData.map((entry, i) => (
                  <Cell key={i} fill={(entry.net_income ?? 0) >= 0
                    ? (i === niData.length - 1 ? "rgba(0,230,118,0.7)" : "rgba(0,230,118,0.35)")
                    : "rgba(255,23,68,0.5)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
