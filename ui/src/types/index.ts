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
  notes: string;
}

export interface HoldingWithMetrics extends Holding {
  current_price: number | null;
  gain_pct: number | null;
  gain_abs: number | null;
  sell_result: CriteriaResult | null;
  metrics: StockMetrics | null;
  history: { date: string; close: number }[];
}

export interface AnalysisResult {
  symbol: string;
  action: string;
  metrics: StockMetrics;
  market: MarketContext;
  criteria_result: CriteriaResult;
  analysis_text: string;
}
