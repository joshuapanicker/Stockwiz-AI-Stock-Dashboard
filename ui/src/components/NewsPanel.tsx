/**
 * NewsPanel — shows recent headlines and latest earnings beat/miss for a stock.
 * Displayed in the stock detail panels so users can see the same context Claude uses.
 */
import clsx from "clsx";
import { Newspaper, TrendingUp, TrendingDown, ExternalLink, RefreshCw } from "lucide-react";
import { useNewsData } from "../hooks/useApi";

interface Props {
  symbol: string;
}

export default function NewsPanel({ symbol }: Props) {
  const { data, loading } = useNewsData(symbol);

  if (loading) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted mb-2 flex items-center gap-1.5">
          <Newspaper size={11} /> News & Earnings
        </p>
        <div className="flex items-center gap-2 text-muted text-xs">
          <RefreshCw size={10} className="animate-spin" /> Loading...
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { headlines, earnings } = data;
  const hasContent = (headlines?.length > 0) || earnings;
  if (!hasContent) return null;

  const surprisePct = earnings?.surprise_pct;
  const isBeat = surprisePct != null ? surprisePct >= 0 : earnings?.beat_miss?.startsWith("beat");
  const earningsColor = isBeat ? "text-green" : "text-red";
  const EarningsIcon = isBeat ? TrendingUp : TrendingDown;

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
        <Newspaper size={11} /> News & Earnings
      </p>

      {/* Earnings beat/miss badge */}
      {earnings && earnings.beat_miss && (
        <div className={clsx(
          "flex items-center gap-2 rounded-xl px-3 py-2.5 border text-xs",
          isBeat
            ? "bg-green/5 border-green/20"
            : "bg-red/5 border-red/20"
        )}>
          <EarningsIcon size={13} className={clsx("flex-shrink-0", earningsColor)} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={clsx("font-semibold capitalize", earningsColor)}>
                {earnings.beat_miss}
              </span>
              {earnings.quarter && (
                <span className="text-muted text-[10px]">{earnings.quarter}</span>
              )}
            </div>
            {earnings.eps_actual != null && earnings.eps_estimate != null && (
              <p className="text-muted text-[10px] mt-0.5">
                EPS: actual ${earnings.eps_actual} vs estimate ${earnings.eps_estimate}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Headlines */}
      {headlines && headlines.length > 0 && (
        <div className="space-y-1.5">
          {headlines.map((item: any, i: number) => (
            item.url ? (
              <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
                className="block bg-card2 rounded-xl px-3 py-2.5 border border-border/30 hover:border-green/30 hover:bg-green/5 transition-all group">
                <div className="flex items-start gap-2">
                  <p className="text-white/80 text-xs leading-snug flex-1 group-hover:text-white transition-colors">{item.title}</p>
                  <ExternalLink size={10} className="text-muted group-hover:text-green flex-shrink-0 mt-0.5 transition-colors" />
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-muted text-[10px]">{item.publisher}</span>
                  <span className="text-border text-[10px]">·</span>
                  <span className="text-muted text-[10px]">{item.age}</span>
                </div>
              </a>
            ) : (
              <div key={i} className="bg-card2 rounded-xl px-3 py-2.5 border border-border/30">
                <p className="text-white/80 text-xs leading-snug">{item.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-muted text-[10px]">{item.publisher}</span>
                  <span className="text-border text-[10px]">·</span>
                  <span className="text-muted text-[10px]">{item.age}</span>
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}
