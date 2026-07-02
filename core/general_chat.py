"""General market/strategy chatbot with live yfinance data injection."""

from __future__ import annotations
import os
import re
import anthropic
from core.metrics import get_market_context, get_stock_metrics
from core.news import get_recent_news, get_recent_earnings


# Common tickers to detect in messages
_TICKER_RE = re.compile(r'\b([A-Z]{1,5})\b')

# Words that look like tickers but aren't
_IGNORE = {
    "I", "A", "AN", "THE", "IS", "IT", "IN", "ON", "AT", "TO", "DO", "BE",
    "OR", "AND", "FOR", "NOT", "BUT", "IF", "SO", "UP", "AI", "US", "UK",
    "ETF", "IPO", "CEO", "CFO", "GDP", "CPI", "FED", "SEC", "NYSE", "NASDAQ",
    "PE", "EPS", "ROI", "YOY", "QOQ", "TTM", "ATH", "ATL", "BUY", "SELL",
    "HOLD", "NOW", "NEW", "OLD", "BIG", "LOW", "HIGH", "GOOD", "BAD", "WHY",
    "HOW", "WHAT", "WHEN", "WHO", "WILL", "CAN", "MAY", "ARE", "WAS", "HAS",
    "HAD", "GET", "GOT", "SET", "PUT", "USE", "SEE", "SAY", "SAID", "MAKE",
    "MADE", "TAKE", "TOOK", "GIVE", "GAVE", "COME", "CAME", "KNOW", "KNEW",
    "THINK", "THOUGHT", "LOOK", "LOOKS", "SEEM", "SEEMS", "FEEL", "FEELS",
    "BEST", "MOST", "SOME", "MANY", "MUCH", "MORE", "LESS", "VERY", "JUST",
    "ALSO", "EVEN", "ONLY", "BOTH", "EACH", "SUCH", "THAN", "THEN", "THAT",
    "THIS", "THEY", "THEM", "THEIR", "THERE", "THESE", "THOSE", "WHICH",
    "WITH", "FROM", "HAVE", "BEEN", "WERE", "WOULD", "COULD", "SHOULD",
    "MIGHT", "MUST", "NEED", "WANT", "LIKE", "WELL", "STILL", "ALREADY",
    "ABOUT", "AFTER", "BEFORE", "DURING", "WHILE", "SINCE", "UNTIL",
    "STOCK", "STOCKS", "MARKET", "PRICE", "SHARE", "SHARES", "FUND",
    "BOND", "BONDS", "CASH", "RISK", "RATE", "RATES", "YEAR", "YEARS",
    "MONTH", "WEEK", "DAY", "TIME", "LONG", "SHORT", "TERM", "GROWTH",
    "VALUE", "SECTOR", "INDEX", "TRADE", "TRADING", "INVEST", "INVESTING",
}


def _extract_tickers(text: str) -> list[str]:
    """Extract likely stock tickers from a message."""
    candidates = _TICKER_RE.findall(text)
    return list(dict.fromkeys(  # deduplicate preserving order
        t for t in candidates
        if t not in _IGNORE and 2 <= len(t) <= 5
    ))[:4]  # max 4 tickers per query


def _fmt(val, decimals=2, prefix="", suffix="", scale=1.0):
    if val is None:
        return "N/A"
    return f"{prefix}{val * scale:.{decimals}f}{suffix}"


def _stock_summary(symbol: str) -> str:
    try:
        m = get_stock_metrics(symbol)
        base = (
            f"{symbol}: ${m['close_price']:.2f} (as of {m['date']}) | "
            f"52W: ${m['low_52_week']:.2f}-${m['high_52_week']:.2f} | "
            f"Fwd PE: {_fmt(m.get('forward_pe'), 1)} | "
            f"Rev Growth: {_fmt(m.get('revenue_growth'), 1, suffix='%', scale=100)} | "
            f"Profit Margin: {_fmt(m.get('profit_margin'), 1, suffix='%', scale=100)} | "
            f"Sector: {m.get('sector') or 'N/A'}"
        )
        # Append most recent earnings beat/miss if available
        earnings = get_recent_earnings(symbol)
        if earnings and earnings.get("beat_miss"):
            base += f" | Last earnings: {earnings['beat_miss']}"
        # Append top headline if available
        news = get_recent_news(symbol)
        if news:
            base += f"\n  Latest: [{news[0]['age']}] {news[0]['title']}"
        return base
    except Exception as e:
        return f"{symbol}: data unavailable ({e})"


def general_chat(messages: list[dict]) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set.")

    # Get market context
    try:
        market = get_market_context()
        market_ctx = (
            f"Market trend: {market['market_trend']} | "
            f"VIX: {_fmt(market.get('vix'), 2)} | "
            f"SPY: ${_fmt(market.get('spy_latest'), 2)} | "
            f"SPY 20DMA: ${_fmt(market.get('spy_20dma'), 2)} | "
            f"SPY 50DMA: ${_fmt(market.get('spy_50dma'), 2)}"
        )
    except Exception:
        market_ctx = "Market data unavailable."

    # Extract tickers from the latest user message and fetch live data
    stock_ctx = ""
    last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    tickers = _extract_tickers(last_user.upper())
    if tickers:
        summaries = [_stock_summary(t) for t in tickers]
        stock_ctx = "\n\nLive stock data:\n" + "\n".join(summaries)

    system = (
        "You are a knowledgeable financial analyst assistant in a stock trading dashboard.\n"
        "You have access to live market data fetched from Yahoo Finance — use it directly in your answers.\n"
        "Never say you don't have access to real-time data. The data is provided below.\n"
        "Answer questions about stocks, strategies, market conditions, and economics.\n"
        "Be direct, data-driven, and concise. Do not use markdown formatting like ** or *.\n"
        "Write in plain text only. Keep responses under 200 words unless asked for more detail.\n\n"
        f"Live market context: {market_ctx}"
        f"{stock_ctx}"
    )

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=350,
        system=system,
        messages=messages,
    )
    return response.content[0].text if response.content else ""


def build_system(messages: list[dict]) -> str:
    """Return the system prompt with live market + stock context injected."""
    try:
        market = get_market_context()
        market_ctx = (
            f"Market trend: {market['market_trend']} | "
            f"VIX: {_fmt(market.get('vix'), 2)} | "
            f"SPY: ${_fmt(market.get('spy_latest'), 2)}"
        )
    except Exception:
        market_ctx = "Market data unavailable."

    stock_ctx = ""
    last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    tickers = _extract_tickers(last_user.upper())
    if tickers:
        summaries = [_stock_summary(t) for t in tickers]
        stock_ctx = "\n\nLive stock data:\n" + "\n".join(summaries)

    return (
        "You are a knowledgeable financial analyst assistant in a stock trading dashboard.\n"
        "You have access to live market data and recent news fetched from Yahoo Finance — use it directly.\n"
        "Never say you don't have access to real-time data. The data is provided below.\n"
        "Be direct, data-driven, and concise. Do not use markdown formatting like ** or *.\n"
        "Write in plain text only. Keep responses under 200 words unless asked for more.\n\n"
        f"Live market context: {market_ctx}"
        f"{stock_ctx}"
    )
