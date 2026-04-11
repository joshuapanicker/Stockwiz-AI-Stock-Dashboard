import clsx from "clsx";
import type { ScreenedStock } from "../types";

interface Props {
  stocks: ScreenedStock[];
  selected: string | null;
  onSelect: (symbol: string) => void;
  mode: "buy" | "watch";
}

function fmt(v: number | null | undefined, decimals = 2, suffix = "") {
  if (v == null) return <span className="text-muted">—</span>;
  return <span>{v.toFixed(decimals)}{suffix}</span>;
}

function pct(v: number | null | undefined) {
  if (v == null) return <span className="text-muted">—</span>;
  const color = v >= 0 ? "text-green" : "text-red";
  return <span className={color}>{v >= 0 ? "+" : ""}{(v * 100).toFixed(2)}%</span>;
}

export default function StockTable({ stocks, selected, onSelect, mode }: Props) {
  if (!stocks.length) {
    return (
      <div className="flex items-center justify-center h-24 text-muted text-sm">
        No {mode} candidates found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted border-b border-border">
            <th className="text-left py-2 px-3 font-medium">Symbol</th>
            <th className="text-right py-2 px-3 font-medium">Price</th>
            <th className="text-right py-2 px-3 font-medium">52W Low</th>
            <th className="text-right py-2 px-3 font-medium">52W High</th>
            <th className="text-right py-2 px-3 font-medium">Rev Growth</th>
            <th className="text-right py-2 px-3 font-medium">Fwd PE</th>
            <th className="text-right py-2 px-3 font-medium">Rules</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((s) => {
            const result = mode === "buy" ? s.buy_result : s.watch_result;
            const isSelected = selected === s.symbol;
            return (
              <tr
                key={s.symbol}
                onClick={() => onSelect(s.symbol)}
                className={clsx(
                  "border-b border-border/50 cursor-pointer transition-colors",
                  isSelected
                    ? "bg-card2"
                    : "hover:bg-white/[0.02]"
                )}
              >
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={clsx(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        mode === "buy" ? "bg-green" : "bg-purple"
                      )}
                    />
                    <span className="font-mono font-semibold text-white">{s.symbol}</span>
                  </div>
                  {s.metrics.sector && (
                    <div className="text-muted text-[10px] pl-4 mt-0.5">{s.metrics.sector}</div>
                  )}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-white">
                  ${s.metrics.close_price?.toFixed(2) ?? "—"}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-muted">
                  ${s.metrics.low_52_week?.toFixed(2) ?? "—"}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-muted">
                  ${s.metrics.high_52_week?.toFixed(2) ?? "—"}
                </td>
                <td className="py-2.5 px-3 text-right">
                  {pct(s.metrics.revenue_growth)}
                </td>
                <td className="py-2.5 px-3 text-right font-mono text-muted">
                  {fmt(s.metrics.forward_pe, 1, "x")}
                </td>
                <td className="py-2.5 px-3 text-right">
                  <span className={clsx(
                    "font-mono text-[11px] px-1.5 py-0.5 rounded",
                    result?.passed ? "bg-green/10 text-green" : "bg-white/5 text-muted"
                  )}>
                    {result?.rules_met ?? 0}/{result?.rules_total ?? 0}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
