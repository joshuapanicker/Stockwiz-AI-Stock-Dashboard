import clsx from "clsx";
import type { MarketContext } from "../types";

interface Props {
  market: MarketContext | null;
}

export default function MarketBar({ market }: Props) {
  if (!market) return null;

  const trendColor = {
    bullish: "text-green",
    bearish: "text-red",
    mixed: "text-orange",
    unknown: "text-muted",
  }[market.market_trend];

  return (
    <div className="flex items-center gap-4 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="text-muted">Market</span>
        <span className={clsx("font-semibold capitalize", trendColor)}>
          {market.market_trend}
        </span>
      </div>
      {market.spy_latest != null && (
        <div className="flex items-center gap-1.5">
          <span className="text-muted">SPY</span>
          <span className="text-white font-mono">${market.spy_latest.toFixed(2)}</span>
        </div>
      )}
      {market.vix != null && (
        <div className="flex items-center gap-1.5">
          <span className="text-muted">VIX</span>
          <span className={clsx(
            "font-mono",
            market.vix > 30 ? "text-red" : market.vix > 20 ? "text-orange" : "text-green"
          )}>
            {market.vix.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
