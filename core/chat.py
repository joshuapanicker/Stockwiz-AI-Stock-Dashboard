"""Natural language chat about a stock using live metrics."""

from __future__ import annotations
import os
import anthropic
from core.metrics import get_stock_metrics, get_market_context
from core.criteria import evaluate_criteria, load_criteria
from core.portfolio import get_holdings, compute_gain
from core.news import build_news_context


def _fmt(val, decimals=2, prefix="", suffix="", scale=1.0):
    if val is None:
        return "N/A"
    return f"{prefix}{val * scale:.{decimals}f}{suffix}"


def _criteria_description(mode: str) -> str:
    """Return a plain-English description of what the criteria actually check."""
    try:
        criteria = load_criteria()
        rules = criteria.get(mode, {}).get("rules", [])
        min_required = criteria.get(mode, {}).get("min_rules_met", len(rules))
        lines = [f"To qualify as a {mode} candidate, at least {min_required} of these {len(rules)} conditions must be true:"]
        for r in rules:
            lines.append(f"- {r['description']}")
        return "\n".join(lines)
    except Exception:
        return ""


def _stock_context(symbol: str) -> str:
    m = get_stock_metrics(symbol)
    market = get_market_context()
    buy_result = evaluate_criteria("buy", m, market)
    watch_result = evaluate_criteria("watch", m, market)

    holdings = get_holdings()
    holding = next((h for h in holdings if h["symbol"] == symbol), None)
    portfolio_ctx = ""
    if holding:
        gain = compute_gain(holding, m["close_price"])
        sell_result = evaluate_criteria("sell", m, market, gain_pct=gain.get("gain_pct"))
        portfolio_ctx = (
            f"\nPortfolio position:\n"
            f"- Bought {holding['buy_date']} at ${holding['buy_price']}\n"
            f"- Gain: {_fmt(gain.get('gain_pct'), 2, suffix='%', scale=100)}\n"
            f"- Sell conditions met: {sell_result['rules_met']}/{sell_result['rules_total']}\n"
        )

    mkt_cap_str = f"${m['market_cap']/1e9:.1f}B" if m.get("market_cap") else "N/A"
    vix_str = f"{market['vix']:.2f}" if market.get("vix") else "N/A"
    spy_str = f"${market['spy_latest']:.2f}" if market.get("spy_latest") else "N/A"

    buy_rules = "\n".join(f"  {'PASS' if r['passed'] else 'FAIL'} {r['description']}" for r in buy_result["details"])
    watch_rules = "\n".join(f"  {'PASS' if r['passed'] else 'FAIL'} {r['description']}" for r in watch_result["details"])

    buy_desc = _criteria_description("buy")
    watch_desc = _criteria_description("watch")

    return (
        f"Stock: {symbol}\n"
        f"Price: ${m['close_price']:.2f} (as of {m['date']})\n"
        f"52W Low: ${m['low_52_week']:.2f} | 52W High: ${m['high_52_week']:.2f}\n"
        f"Distance to 52W low: {_fmt(m.get('distance_to_low_pct'), 1, suffix='%', scale=100)}\n"
        f"Sector: {m.get('sector') or 'N/A'} | Industry: {m.get('industry') or 'N/A'}\n"
        f"Market Cap: {mkt_cap_str}\n\n"
        f"Fundamentals:\n"
        f"- Trailing PE: {_fmt(m.get('trailing_pe'), 1)}\n"
        f"- Forward PE: {_fmt(m.get('forward_pe'), 1)}\n"
        f"- Revenue Growth: {_fmt(m.get('revenue_growth'), 1, suffix='%', scale=100)}\n"
        f"- Earnings Growth: {_fmt(m.get('earnings_growth'), 1, suffix='%', scale=100)}\n"
        f"- Profit Margin: {_fmt(m.get('profit_margin'), 1, suffix='%', scale=100)}\n"
        f"- Operating Margin: {_fmt(m.get('operating_margin'), 1, suffix='%', scale=100)}\n\n"
        f"Market: {market['market_trend']} | VIX: {vix_str} | SPY: {spy_str}\n\n"
        f"{buy_desc}\n"
        f"Current status ({buy_result['rules_met']}/{buy_result['rules_total']} conditions met):\n{buy_rules}\n\n"
        f"{watch_desc}\n"
        f"Current status ({watch_result['rules_met']}/{watch_result['rules_total']} conditions met):\n{watch_rules}"
        f"{portfolio_ctx}"
        f"{build_news_context(symbol)}"
    )


def chat(symbol: str, messages: list[dict]) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set.")

    stock_ctx = _stock_context(symbol)

    system = (
        f"You are a sharp, concise stock analysis assistant in a trading dashboard.\n"
        f"You have live data for {symbol} below. Use the exact numbers provided.\n"
        f"Never say you cannot access data. Be direct and data-driven.\n"
        f"When explaining why a stock qualifies or doesn't qualify, describe the actual conditions "
        f"in plain English (e.g. 'the stock is trading near its 52-week low' not 'buy criteria met').\n"
        f"Do not use markdown formatting like ** or *. Write in plain text only.\n"
        f"Keep responses under 150 words unless the user asks for more detail.\n\n"
        f"Live data for {symbol}:\n{stock_ctx}"
    )

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=400,
        system=system,
        messages=messages,
    )
    return response.content[0].text if response.content else ""


def _profile_context(user_id: str | None) -> str:
    """Build a profile context string to inject into prompts."""
    if not user_id:
        return ""
    try:
        from core.db import get_user_profile
        p = get_user_profile(user_id)
        parts = ["\nUser investment profile (tailor your analysis to this):"]
        parts.append(f"- Risk tolerance: {p.get('risk_tolerance', 'moderate')}")
        parts.append(f"- Hold duration preference: {p.get('hold_duration', 'medium')}")
        max_pos = p.get("max_position_usd")
        if max_pos:
            parts.append(f"- Max position size: ${max_pos:,.0f}")
        sectors = p.get("preferred_sectors") or []
        if sectors:
            parts.append(f"- Preferred sectors: {', '.join(sectors)}")
        if p.get("tax_sensitive"):
            parts.append("- Tax-sensitive: prefer long-term gains, flag short-term implications")
        notes = p.get("notes", "").strip()
        if notes:
            parts.append(f"- Additional notes: {notes}")
        return "\n".join(parts)
    except Exception:
        return ""


def build_system(symbol: str, messages: list[dict], user_id: str | None = None) -> str:
    """Return the system prompt with live stock context for streaming."""
    stock_ctx = _stock_context(symbol)
    profile_ctx = _profile_context(user_id)

    # RAG grounding: filing excerpts retrieved against the user's question.
    # Non-blocking — a cold ticker indexes in the background rather than
    # delaying the first token of the streamed reply.
    filing_ctx = ""
    try:
        from core.rag_index import build_chat_filing_context
        last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        if last_user:
            filing_ctx = build_chat_filing_context([symbol], last_user)
    except Exception:
        filing_ctx = ""

    return (
        f"You are a sharp, concise stock analysis assistant in a trading dashboard.\n"
        f"You have live data for {symbol} below. Use the exact numbers provided, and "
        f"cite the SEC filing when you draw on a filing excerpt.\n"
        f"Never say you cannot access data. Be direct and data-driven.\n"
        f"When explaining criteria, describe conditions in plain English.\n"
        f"Do not use markdown formatting like ** or *. Write in plain text only.\n"
        f"Keep responses under 150 words unless the user asks for more detail.\n"
        f"{profile_ctx}\n\n"
        f"Live data for {symbol}:\n{stock_ctx}"
        f"{filing_ctx}"
    )
