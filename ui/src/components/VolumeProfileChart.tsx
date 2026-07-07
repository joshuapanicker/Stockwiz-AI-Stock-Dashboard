/**
 * Volume Profile Chart — shows real historical volume distribution by price level.
 * Horizontal bars indicate how much volume traded at each price range.
 * High-volume nodes act as support/resistance levels — genuinely useful for traders.
 */
import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, ReferenceLine } from "recharts";

interface OHLCBar { date: string; open: number; high: number; low: number; close: number; volume: number; }

interface Props {
  history: OHLCBar[];
  currentPrice?: number | null;
  height?: number;
  bins?: number;
}

function buildVolumeProfile(history: OHLCBar[], bins: number) {
  if (!history.length) return [];

  const prices = history.flatMap(b => [b.low, b.high]);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP;
  if (range === 0) return [];

  const binSize = range / bins;
  const buckets = Array.from({ length: bins }, (_, i) => ({
    price: minP + i * binSize + binSize / 2,
    volume: 0,
    isHvn: false, // high-volume node
  }));

  for (const bar of history) {
    // Approximate: distribute bar's volume across price range it covered
    const barRange = bar.high - bar.low || binSize;
    for (const bucket of buckets) {
      const bucketLow  = bucket.price - binSize / 2;
      const bucketHigh = bucket.price + binSize / 2;
      // Overlap between bar range and bucket range
      const overlap = Math.max(0, Math.min(bar.high, bucketHigh) - Math.max(bar.low, bucketLow));
      if (overlap > 0) {
        bucket.volume += bar.volume * (overlap / barRange);
      }
    }
  }

  // Mark top 20% volume nodes as HVN (high-volume nodes)
  const maxVol = Math.max(...buckets.map(b => b.volume));
  const hvnThreshold = maxVol * 0.7;
  buckets.forEach(b => { b.isHvn = b.volume >= hvnThreshold; });

  return buckets;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const vol = d.volume >= 1e9 ? `${(d.volume / 1e9).toFixed(1)}B`
    : d.volume >= 1e6 ? `${(d.volume / 1e6).toFixed(1)}M`
    : d.volume >= 1e3 ? `${(d.volume / 1e3).toFixed(0)}K`
    : d.volume.toFixed(0);
  return (
    <div className="bg-card2 border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted mb-1">${d.price.toFixed(2)}</p>
      <p className={d.isHvn ? "text-green" : "text-white"}>
        Vol: {vol} {d.isHvn ? "★ HVN" : ""}
      </p>
    </div>
  );
};

export default function VolumeProfileChart({ history, currentPrice, height = 150, bins = 24 }: Props) {
  const data = useMemo(() => buildVolumeProfile(history, bins), [history, bins]);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-muted text-xs" style={{ height }}>
        No data
      </div>
    );
  }

  return (
    <div style={{ height }} className="relative">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: -10, bottom: 0 }}>
          <XAxis
            type="number"
            tick={{ fill: "#6E7787", fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => v >= 1e9 ? `${(v/1e9).toFixed(0)}B` : v >= 1e6 ? `${(v/1e6).toFixed(0)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : String(v)}
          />
          <YAxis
            dataKey="price"
            type="number"
            domain={["auto", "auto"]}
            tick={{ fill: "#6E7787", fontSize: 9 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `$${Number(v).toFixed(0)}`}
            width={42}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          {currentPrice && (
            <ReferenceLine
              y={currentPrice}
              stroke="rgba(46,230,168,0.7)"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          )}
          <Bar dataKey="volume" radius={[0, 2, 2, 0]} maxBarSize={10}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.isHvn ? "rgba(46,230,168,0.7)" : "rgba(46,230,168,0.22)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="absolute bottom-0 right-1 flex items-center gap-2 text-[9px] text-muted">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-green inline-block opacity-70" /> HVN
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-green/25 inline-block" /> Volume
        </span>
      </div>
    </div>
  );
}
