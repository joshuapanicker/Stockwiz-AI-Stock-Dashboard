"""Claude-powered analysis using the anthropic SDK directly."""

from __future__ import annotations
import json
import os
import anthropic

from core.criteria import evaluate_criteria
from core.metrics import get_market_context, get_stock_metrics
from core.news import build_news_context


def _build_prompt(symbol: str, action: str, criteria_result: dict, metrics: dict,
                  market: dict, news_ctx: str = "", gain_pct: float | None = None) -> str:
    data = {k: metrics.get(k) for k in [
        "symbol", "date", "close_price", "low_52_week", "high_52_week",
        "trailing_pe", "forward_pe", "revenue_growth", "earnings_growth",
        "profit_margin", "operating_margin", "distance_to_low_pct", "distance_to_high_pct",
    ]}
    data["market_trend"] = market.get("market_trend")
    data["vix"] = market.get("vix")
    if gain_pct is not None:
        data["position_gain_pct"] = round(gain_pct, 4)

    rules = "\n".join(
        f"  {'[PASS]' if r['passed'] else '[FAIL]'} {r['description']}"
        for r in criteria_result.get("details", [])
    )

    news_section = news_ctx if news_ctx else "(no recent news available)"

    return f"""Analyze stock {symbol} for action: {action.upper()}.

Criteria ({criteria_result.get('rules_met')}/{criteria_result.get('rules_total')} met, need {criteria_result.get('min_required')}):
{rules}

Fundamentals: {json.dumps(data, separators=(',', ':'))}

{news_section}

Return exactly:

Symbol: {symbol}
Action: {action.upper()}
Decision: <YES or NO>
Date: <date>
Summary: <one sentence>

Reasoning:
- <reason 1>
- <reason 2>
- <reason 3>

Rules: use only provided data, say "missing" if absent, max 3 bullets."""


def analyze_stock(symbol: str, action: str, gain_pct: float | None = None,
                  user_id: str | None = None) -> dict:
    from concurrent.futures import ThreadPoolExecutor
    from core.cache import get as cache_get, set as cache_set
    # user_id is part of the key: criteria are per-user, so cached analyses
    # must never leak across accounts with different rule sets.
    cache_key = f"analysis:{symbol}:{action}:{gain_pct}:{user_id}"
    cached = cache_get(cache_key, 300)  # cache for 5 min
    if cached:
        return cached

    # Metrics, market context, and news are independent network fetches —
    # run them concurrently instead of paying for each in sequence.
    with ThreadPoolExecutor(max_workers=3) as pool:
        f_metrics = pool.submit(get_stock_metrics, symbol)
        f_market = pool.submit(get_market_context)
        f_news = pool.submit(build_news_context, symbol)
        metrics = f_metrics.result()
        market = f_market.result()
        try:
            news_ctx = f_news.result()
        except Exception:
            news_ctx = ""
    # Same gain_pct + user criteria as the portfolio sell-signal checklist,
    # so the AI's rule counts always match what the UI displays.
    criteria_result = evaluate_criteria(action, metrics, market,
                                        gain_pct=gain_pct, user_id=user_id)

    from core.credits import metered_create

    prompt = _build_prompt(symbol, action, criteria_result, metrics, market, news_ctx,
                           gain_pct=gain_pct)
    message = metered_create(
        user_id,
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        system=(
            "You are a disciplined stock analysis assistant. "
            "Use only the provided data. Do not fabricate missing values."
        ),
        messages=[{"role": "user", "content": prompt}],
    )

    result = {
        "symbol": symbol,
        "action": action,
        "metrics": metrics,
        "market": market,
        "criteria_result": criteria_result,
        "analysis_text": message.content[0].text if message.content else "",
    }
    cache_set(cache_key, result)
    return result
