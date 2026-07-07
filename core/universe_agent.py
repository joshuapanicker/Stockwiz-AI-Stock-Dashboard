"""
Agent that translates natural-language filter queries into structured
universe query parameters, then returns ranked results with reasoning.

Flow
----
1. User types: "show me profitable tech stocks with low PE"
2. Claude extracts structured filters (sector, max_forward_pe, min_profit_margin, etc.)
3. We query SQLite with those filters
4. We stream back a summary + top results

The extraction step is a short non-streaming Claude call (fast, cheap).
The summary step uses SSE streaming so results appear immediately.
"""

from __future__ import annotations

import json
import os
import anthropic

from core.universe_cache import query_universe, get_sectors, get_cached_count, get_total_universe_size
from core.metrics import get_market_context


EXTRACTION_SYSTEM = """You are a stock screener assistant. Extract structured filter criteria from the user's query.

Return ONLY a valid JSON object with these optional fields (omit fields the user didn't specify):
{
  "sector": "Technology",           // exact sector name, or null
  "max_forward_pe": 25,             // maximum forward P/E ratio
  "max_trailing_pe": 40,            // maximum trailing P/E ratio
  "min_revenue_growth": 0.10,       // minimum revenue growth (decimal: 0.10 = 10%)
  "min_profit_margin": 0.05,        // minimum profit margin (decimal)
  "min_earnings_growth": 0.05,      // minimum earnings growth (decimal)
  "near_52w_low_pct": 0.20,         // within X% of 52-week low (e.g. 0.20 = 20%)
  "min_market_cap": 1000000000,     // minimum market cap in dollars
  "max_price": 100,                 // maximum share price in dollars ("under $100")
  "min_price": 5,                   // minimum share price in dollars ("above $5", "no penny stocks")
  "limit": 50,                      // max results (default 50, max 250 — use higher limits when the user wants a broad pool)
  "order_by": "market_cap DESC",    // one of: market_cap DESC/ASC, revenue_growth DESC/ASC,
                                    //   forward_pe ASC/DESC, distance_to_low_pct ASC/DESC,
                                    //   profit_margin DESC/ASC, earnings_growth DESC/ASC,
                                    //   close_price ASC/DESC
  "intent_summary": "short plain English description of what user wants"
}

IMPORTANT: "under/below/less than $X" with no other metric named refers to SHARE PRICE
(max_price), not P/E. "under X PE" or "under X times earnings" refers to P/E.

Valid sector names: Technology, Healthcare, Financial Services, Consumer Cyclical,
Industrials, Consumer Defensive, Energy, Basic Materials, Real Estate,
Communication Services, Utilities.

Examples:
- "show me cheap tech stocks" → {"sector":"Technology","max_forward_pe":20,"intent_summary":"Cheap tech stocks by forward PE"}
- "tech stocks under $100" → {"sector":"Technology","max_price":100,"order_by":"market_cap DESC","intent_summary":"Technology stocks trading under $100 per share"}
- "stocks under $20 that are profitable" → {"max_price":20,"min_profit_margin":0.0,"intent_summary":"Profitable stocks under $20 per share"}
- "profitable healthcare under 30 PE" → {"sector":"Healthcare","max_trailing_pe":30,"min_profit_margin":0.0,"intent_summary":"Profitable healthcare stocks"}
- "high growth small cap" → {"min_revenue_growth":0.20,"max_market_cap_note":"not supported, skip"}
- "stocks near 52 week low with positive margins" → {"near_52w_low_pct":0.15,"min_profit_margin":0.0,"order_by":"distance_to_low_pct ASC"}
- "best value stocks" → {"max_forward_pe":15,"min_profit_margin":0.05,"order_by":"forward_pe ASC"}
"""


def extract_filters(query: str) -> dict:
    """Call Claude to parse a natural language query into structured filter params."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        system=EXTRACTION_SYSTEM,
        messages=[{"role": "user", "content": query}],
    )

    raw = response.content[0].text.strip() if response.content else "{}"
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        return json.loads(raw[start:end])
    except Exception:
        return {"intent_summary": query}


def _fmt(val, decimals: int = 2, prefix: str = "", suffix: str = "", scale: float = 1.0) -> str:
    if val is None:
        return "N/A"
    return f"{prefix}{val * scale:.{decimals}f}{suffix}"


def _build_results_context(filters: dict, results: list[dict], market: dict) -> str:
    """Build the context block Claude uses to summarize results."""
    intent = filters.get("intent_summary", "your query")

    applied = {k: v for k, v in filters.items() if k not in ("intent_summary",) and v is not None}
    lines = [
        f"User filter intent: {intent}",
        f"SQL filters actually applied: {json.dumps(applied)}",
        f"Market: {market.get('market_trend','unknown')} | VIX: {_fmt(market.get('vix'),2)} | SPY: ${_fmt(market.get('spy_latest'),2)}",
        f"Results: {len(results)} stocks matched — every one of them already satisfies ALL applied filters. "
        f"You are shown the top {min(len(results), 15)}; do not speculate about unshown rows failing the filters.",
        "",
        "Top matched stocks (symbol | price | sector | fwd PE | rev growth | profit margin | distance to 52W low):",
    ]

    for i, r in enumerate(results[:15], 1):
        lines.append(
            f"{i:2}. {r['symbol']:<6} "
            f"${_fmt(r.get('close_price'), 2)} | "
            f"{r.get('sector') or 'N/A':<25} | "
            f"FwdPE: {_fmt(r.get('forward_pe'), 1)} | "
            f"RevGrowth: {_fmt(r.get('revenue_growth'), 1, suffix='%', scale=100)} | "
            f"Margin: {_fmt(r.get('profit_margin'), 1, suffix='%', scale=100)} | "
            f"52WLow+{_fmt(r.get('distance_to_low_pct'), 1, suffix='%', scale=100)}"
        )

    return "\n".join(lines)


SUMMARY_SYSTEM = """You are a stock screener assistant inside a trading dashboard.
The user asked a natural language question and you matched it against a live stock universe.
Briefly summarize the results in 3-5 sentences: what you found, any standout candidates, 
and one actionable observation. Be specific and use the data. Plain text only, no markdown."""


def build_summary_system(filters: dict, results: list[dict], market: dict) -> str:
    """Build the system prompt for the streaming summary response."""
    context = _build_results_context(filters, results, market)
    return f"{SUMMARY_SYSTEM}\n\n{context}"


def run_agent_filter(query: str) -> tuple[dict, list[dict]]:
    """
    Extract filters from query, run the universe query, return (filters, results).
    This is the non-streaming part — call before streaming the summary.
    """
    filters = extract_filters(query)

    results = query_universe(
        sector=filters.get("sector"),
        max_forward_pe=filters.get("max_forward_pe"),
        max_trailing_pe=filters.get("max_trailing_pe"),
        min_revenue_growth=filters.get("min_revenue_growth"),
        min_profit_margin=filters.get("min_profit_margin"),
        near_52w_low_pct=filters.get("near_52w_low_pct"),
        min_earnings_growth=filters.get("min_earnings_growth"),
        min_market_cap=filters.get("min_market_cap"),
        max_price=filters.get("max_price"),
        min_price=filters.get("min_price"),
        limit=min(int(filters.get("limit", 50)), 250),
        order_by=filters.get("order_by", "market_cap DESC"),
    )

    return filters, results
