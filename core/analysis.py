"""Claude-powered analysis using the anthropic SDK directly."""

from __future__ import annotations
import json
import os
import re
import anthropic

from core.criteria import evaluate_criteria
from core.metrics import get_market_context, get_stock_metrics
from core.news import build_news_context


def _build_prompt(symbol: str, action: str, criteria_result: dict, metrics: dict,
                  market: dict, news_ctx: str = "", gain_pct: float | None = None,
                  filing_ctx: str = "") -> str:
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
    filing_section = f"\n{filing_ctx}\n" if filing_ctx else ""

    return f"""Analyze stock {symbol} for action: {action.upper()}.

Criteria ({criteria_result.get('rules_met')}/{criteria_result.get('rules_total')} met, need {criteria_result.get('min_required')}):
{rules}

Fundamentals: {json.dumps(data, separators=(',', ':'))}

{news_section}
{filing_section}
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


def _parse_decision(text: str) -> str | None:
    m = re.search(r"Decision:\s*(YES|NO)", text, re.IGNORECASE)
    return m.group(1).upper() if m else None


def _warm_filing_index(symbol: str) -> None:
    """Kick off background indexing of this ticker's filings if stale.
    Fire-and-forget — returns immediately. The analysis request must NEVER
    wait on SEC fetching + embedding (it hung analyses for the full
    duration on small hosts); an unindexed ticker just gets an ungrounded
    analysis this time and a grounded one once the background job lands."""
    # Lazy import — sentence-transformers/chromadb are heavy to load and
    # RAG grounding is optional, so a module import failure here shouldn't
    # take down every caller of core.analysis.
    try:
        from core.rag_index import ensure_indexed_async
        ensure_indexed_async(symbol)
    except Exception:
        pass


# Screener rule fields → the language filings actually use for that topic.
# Embedding raw rule text ("Forward PE under 25") retrieves poorly because
# 10-K/10-Q prose never says "PE" — it talks about margins, net sales, and
# demand. This translation is what makes criteria-driven retrieval land on
# the right chunks.
_FIELD_TOPICS = {
    "trailing_pe":          "earnings performance, profitability outlook, and valuation drivers",
    "forward_pe":           "expected earnings, guidance, and profitability outlook",
    "revenue_growth":       "revenue and net sales trends, product demand, and sales outlook",
    "earnings_growth":      "earnings, operating income performance, and income trends",
    "profit_margin":        "gross margin, cost pressures, and pricing",
    "operating_margin":     "operating margin, operating expenses, and cost structure",
    "distance_to_low_pct":  "stock price performance, share repurchases, and capital return",
    "distance_to_high_pct": "stock price performance, share repurchases, and capital return",
    "market_trend":         "macroeconomic conditions, foreign exchange, and demand environment",
    "vix":                  "macroeconomic conditions and market volatility impact",
    "gain_pct":             "stock price appreciation and shareholder returns",
}

_GENERIC_QUERY = "business risks, recent performance, and outlook"


def _build_retrieval_query(symbol: str, action: str, criteria_result: dict) -> str:
    """
    Task-specific retrieval: search the filings for what THIS analysis
    actually hinges on, instead of a generic "risks and outlook" query.
    For a sell analysis the triggered rules are the concerns to investigate;
    for a buy analysis the failing rules are what's blocking the thesis.
    """
    details = criteria_result.get("details", [])
    if action == "sell":
        focus = [d for d in details if d.get("passed")]
    else:
        focus = [d for d in details if not d.get("passed")]
    if not focus:  # nothing triggered/failing — fall back to the full rule set
        focus = details

    topics: list[str] = []
    for d in focus:
        topic = _FIELD_TOPICS.get(d.get("field") or "")
        if topic and topic not in topics:
            topics.append(topic)
    if not topics:
        return _GENERIC_QUERY
    return ", ".join(topics[:3])


def _get_filing_context(symbol: str, query: str) -> tuple[str, list[dict]]:
    """Returns (prompt_block, sources). sources is a deduped list of
    {form, date, section} — surfaced in the API response so the UI can show
    users exactly which filings a verdict was grounded in."""
    try:
        from core.rag_index import build_filing_context_with_sources
        return build_filing_context_with_sources(symbol, query=query)
    except Exception:
        return "", []


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

    # Kick off background filing indexing first (returns instantly — the
    # actual work happens on a daemon thread and never blocks this request).
    _warm_filing_index(symbol)

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

    # Retrieval query derived from the rules that matter for this decision
    # (triggered rules for a sell, failing rules for a buy). Fast local
    # lookup if the ticker is indexed; returns empty (ungrounded analysis)
    # if the background indexing job hasn't landed yet.
    retrieval_query = _build_retrieval_query(symbol, action, criteria_result)
    filing_ctx, filing_sources = _get_filing_context(symbol, retrieval_query)

    from core.credits import metered_create

    prompt = _build_prompt(symbol, action, criteria_result, metrics, market, news_ctx,
                           gain_pct=gain_pct, filing_ctx=filing_ctx)
    model = "claude-haiku-4-5-20251001"
    system = ("You are a disciplined stock analysis assistant. "
              "Use only the provided data. Do not fabricate missing values.")
    message = metered_create(
        user_id,
        model=model,
        max_tokens=300,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )

    analysis_text = message.content[0].text if message.content else ""

    # Distillation logging: every fresh analysis is a free training example
    # for the future fine-tuned model — the exact prompt (with RAG filing
    # context included) paired with what Claude produced. Never raises.
    from core.distill_log import log_example
    log_example(
        task="stock_analysis", system=system, prompt=prompt,
        output=analysis_text, model=model,
        meta={"symbol": symbol, "action": action, "gain_pct": gain_pct},
    )
    result = {
        "symbol": symbol,
        "action": action,
        "metrics": metrics,
        "market": market,
        "criteria_result": criteria_result,
        "analysis_text": analysis_text,
        "grounding_sources": filing_sources,
    }

    # Log the verdict for the public track record — best-effort, must never
    # break the analysis response itself.
    try:
        decision = _parse_decision(analysis_text)
        if decision:
            from core.track_record import log_call
            log_call(symbol, action, decision, metrics.get("close_price"),
                     market.get("spy_latest"), criteria_result.get("rules_met"),
                     criteria_result.get("rules_total"))
    except Exception:
        pass

    cache_set(cache_key, result)
    return result
