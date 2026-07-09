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
import re
import anthropic

from core.universe_cache import (
    query_universe, get_sectors, get_cached_count, get_total_universe_size,
    get_stocks_by_symbols, get_universe_symbols, upsert_stock,
)
from core.metrics import get_market_context


EXTRACTION_SYSTEM = """You are a stock screener assistant. Extract structured filter criteria from the user's query.

Return ONLY a valid JSON object with these optional fields (omit fields the user didn't specify):
{
  "symbols": ["SMCI", "NVDA"],      // specific ticker symbols the user named or clearly referred to
                                    //   (e.g. "show me SMCI", "Super Micro", "compare Nvidia and AMD")
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

IMPORTANT: If the user names one or more specific stocks (by ticker OR company name),
ALWAYS put their ticker symbols in "symbols". A lone symbols filter with no other
fields is the correct output for queries like "show me SMCI" or "pull up Tesla".

Valid sector names: Technology, Healthcare, Financial Services, Consumer Cyclical,
Industrials, Consumer Defensive, Energy, Basic Materials, Real Estate,
Communication Services, Utilities.

Examples:
- "show me SMCI" → {"symbols":["SMCI"],"intent_summary":"Look up Super Micro Computer (SMCI)"}
- "how do Apple and Microsoft compare?" → {"symbols":["AAPL","MSFT"],"intent_summary":"Compare Apple and Microsoft"}
- "show me cheap tech stocks" → {"sector":"Technology","max_forward_pe":20,"intent_summary":"Cheap tech stocks by forward PE"}
- "tech stocks under $100" → {"sector":"Technology","max_price":100,"order_by":"market_cap DESC","intent_summary":"Technology stocks trading under $100 per share"}
- "stocks under $20 that are profitable" → {"max_price":20,"min_profit_margin":0.0,"intent_summary":"Profitable stocks under $20 per share"}
- "profitable healthcare under 30 PE" → {"sector":"Healthcare","max_trailing_pe":30,"min_profit_margin":0.0,"intent_summary":"Profitable healthcare stocks"}
- "high growth small cap" → {"min_revenue_growth":0.20,"max_market_cap_note":"not supported, skip"}
- "stocks near 52 week low with positive margins" → {"near_52w_low_pct":0.15,"min_profit_margin":0.0,"order_by":"distance_to_low_pct ASC"}
- "best value stocks" → {"max_forward_pe":15,"min_profit_margin":0.05,"order_by":"forward_pe ASC"}
"""


def extract_filters(query: str, user_id: str | None = None) -> dict:
    """Call Claude to parse a natural language query into structured filter params."""
    from core.credits import metered_create
    response = metered_create(
        user_id,
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


def detect_ticker_symbols(query: str) -> list[str]:
    """
    Deterministic ticker detection — never rely on the LLM alone to spot symbols.

    A token counts as a ticker when it exactly matches a universe symbol AND either:
      - the whole query is that one token ("smci", "NVDA"), or
      - the user wrote it in ALL CAPS ("show me SMCI and PLTR")
    The ALL-CAPS requirement for in-sentence tokens avoids false positives on
    common words that happen to be tickers (e.g. "a", "for", "all", "on").
    """
    try:
        known = set(get_universe_symbols())
    except Exception:
        return []

    stripped = query.strip()
    # Whole query is a single ticker-like token, any case
    if re.fullmatch(r"[A-Za-z][A-Za-z.\-]{0,5}", stripped) and stripped.upper() in known:
        return [stripped.upper()]

    found: list[str] = []
    for tok in re.findall(r"\b[A-Z][A-Z.\-]{1,5}\b", query):
        if tok in known and tok not in found:
            found.append(tok)
    return found


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
    ]

    requested = filters.get("symbols") or []
    if requested:
        found = [s for s in requested if any(r["symbol"] == s for r in results)]
        not_found = [s for s in requested if s not in found]
        if found:
            lines.append(
                f"The user explicitly asked about: {', '.join(found)} — these ARE in the results below "
                f"(listed first). Focus your summary on them; never claim they are missing."
            )
        if not_found:
            lines.append(
                f"No data could be retrieved for: {', '.join(not_found)} — tell the user plainly that "
                f"data for these symbols is unavailable right now."
            )

    lines += [
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


def _fetch_missing_symbols(symbols: list[str]) -> list[dict]:
    """
    Live-fetch symbols the user explicitly asked for that aren't cached yet,
    and store them so the next lookup is instant.
    """
    from core.metrics import get_stock_metrics
    fetched: list[dict] = []
    for sym in symbols[:5]:  # explicit requests only — keep it bounded
        try:
            metrics = get_stock_metrics(sym)
            if metrics.get("close_price") is not None:
                upsert_stock(metrics)
                fetched.append({**metrics, "date": "live"})
        except Exception:
            continue
    return fetched


def run_agent_filter(query: str, user_id: str | None = None) -> tuple[dict, list[dict]]:
    """
    Extract filters from query, run the universe query, return (filters, results).
    This is the non-streaming part — call before streaming the summary.
    """
    # Deterministic ticker fast-path: a bare ticker query never needs the LLM
    detected = detect_ticker_symbols(query)
    if detected and re.fullmatch(r"[A-Za-z][A-Za-z.\-]{0,5}", query.strip()):
        filters = {"symbols": detected, "intent_summary": f"Look up {', '.join(detected)}"}
    else:
        from core.credits import CreditsExhausted
        try:
            filters = extract_filters(query, user_id=user_id)
        except CreditsExhausted:
            raise
        except Exception:
            # Extraction failed, but detected tickers can still be looked up
            if not detected:
                raise
            filters = {"intent_summary": query}
        # Merge AI-extracted symbols with deterministically detected ones
        ai_symbols = [s.upper() for s in filters.get("symbols") or [] if isinstance(s, str)]
        merged = list(dict.fromkeys(ai_symbols + detected))
        if merged:
            filters["symbols"] = merged
        else:
            filters.pop("symbols", None)

    requested_symbols = filters.get("symbols") or []

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
        symbols=requested_symbols or None,
        limit=min(int(filters.get("limit", 50)), 250),
        order_by=filters.get("order_by", "market_cap DESC"),
    )

    # Explicitly requested symbols must always surface. If one was filtered out
    # by metric clauses, pull it from cache; if not cached at all, fetch live.
    if requested_symbols:
        present = {r["symbol"] for r in results}
        missing = [s for s in requested_symbols if s not in present]
        if missing:
            cached = get_stocks_by_symbols(missing)
            results = cached + results
            still_missing = [s for s in missing if s not in {r["symbol"] for r in cached}]
            if still_missing:
                results = _fetch_missing_symbols(still_missing) + results

    return filters, results
