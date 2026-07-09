export interface StockMetrics {
  symbol: string;
  date: string;
  close_price: number;
  low_52_week: number;
  high_52_week: number;
  trailing_pe: number | null;
  forward_pe: number | null;
  profit_margin: number | null;
  operating_margin: number | null;
  revenue_growth: number | null;
  earnings_growth: number | null;
  market_cap: number | null;
  sector: string | null;
  industry: string | null;
  distance_to_low_pct: number | null;
  distance_to_high_pct: number | null;
  closer_to_52w_low: boolean;
}

export interface CriteriaRule {
  id: string;
  description: string;
  passed: boolean;
}

export interface CriteriaResult {
  passed: boolean;
  rules_met: number;
  rules_total: number;
  min_required: number;
  details: CriteriaRule[];
}

export interface ScreenedStock {
  symbol: string;
  metrics: StockMetrics;
  market: MarketContext;
  buy_result: CriteriaResult;
  watch_result: CriteriaResult;
  classification: "buy" | "watch" | "none";
  error?: string;
}

export interface MarketContext {
  market_trend: "bullish" | "bearish" | "mixed" | "unknown";
  vix: number | null;
  spy_latest: number | null;
  spy_20dma: number | null;
  spy_50dma: number | null;
}

export interface OHLCBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PricePoint {
  date: string;
  close: number;
}

export interface Holding {
  symbol: string;
  buy_date: string;
  buy_price: number | null;
  shares: number;
  notes: string;
}

export interface HoldingWithMetrics extends Holding {
  current_price: number | null;
  gain_pct: number | null;
  gain_abs: number | null;
  total_value: number | null;
  sell_result: CriteriaResult | null;
  metrics: StockMetrics | null;
  history: { date: string; close: number }[];
}

export interface SoldPosition {
  id: string;
  symbol: string;
  sell_date: string;
  sell_price: number;
  shares: number;
  buy_price: number | null;
  buy_date: string | null;
  realized_gain: number | null;
  realized_pct: number | null;
  created_at: string;
}

export interface AnalysisResult {
  symbol: string;
  action: string;
  metrics: StockMetrics;
  market: MarketContext;
  criteria_result: CriteriaResult;
  analysis_text: string;
}

// ── Universe types ─────────────────────────────────────────────────────────

export interface UniverseFilters {
  symbols?: string[] | null;
  sector?: string | null;
  max_forward_pe?: number | null;
  max_trailing_pe?: number | null;
  min_revenue_growth?: number | null;
  min_profit_margin?: number | null;
  min_earnings_growth?: number | null;
  near_52w_low_pct?: number | null;
  min_market_cap?: number | null;
  max_price?: number | null;
  min_price?: number | null;
  limit?: number;
  order_by?: string;
  intent_summary?: string;
}

export interface UniverseStock {
  symbol: string;
  close_price: number | null;
  low_52_week: number | null;
  high_52_week: number | null;
  trailing_pe: number | null;
  forward_pe: number | null;
  profit_margin: number | null;
  operating_margin: number | null;
  revenue_growth: number | null;
  earnings_growth: number | null;
  market_cap: number | null;
  sector: string | null;
  industry: string | null;
  distance_to_low_pct: number | null;
  distance_to_high_pct: number | null;
  closer_to_52w_low: boolean;
  last_updated: number | null;
  fetch_error: string | null;
}

export interface UniverseStatus {
  cached: number;
  total: number;
  fetching: boolean;
  fetched_this_cycle: number;
  cycle_total: number;
  last_run: number | null;
}

export interface AgentFilterResult {
  type: "results";
  filters: UniverseFilters;
  results: UniverseStock[];
  total_matched: number;
}
