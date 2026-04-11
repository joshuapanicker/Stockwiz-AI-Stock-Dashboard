"""Fetch stock metrics and market context from Yahoo Finance."""

from __future__ import annotations
import math
import yfinance as yf
from core.cache import get as cache_get, set as cache_set

METRICS_TTL = 300   # 5 min
HISTORY_TTL = 300   # 5 min
MARKET_TTL  = 120   # 2 min


def _safe(val):
    """Convert to float, return None if nan/inf/invalid."""
    if val is None:
        return None
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
    except Exception:
        return None


def get_stock_metrics(symbol: str) -> dict:
    symbol = symbol.strip().upper()
    if not symbol:
        raise ValueError("Empty symbol")

    key = f"metrics:{symbol}"
    cached = cache_get(key, METRICS_TTL)
    if cached:
        return cached

    ticker = yf.Ticker(symbol)

    # fast_info is more reliable than history() for current price
    fi = ticker.fast_info
    close_price = _safe(fi.get("lastPrice") or fi.get("regularMarketPrice"))

    # History for 52w range — drop nan rows
    hist_1y = ticker.history(period="1y", interval="1d")
    if hist_1y.empty:
        raise ValueError(f"No history found for {symbol}")

    hist_valid = hist_1y.dropna(subset=["Close"])
    latest_date = hist_valid.index[-1].strftime("%Y-%m-%d") if not hist_valid.empty else "N/A"

    if close_price is None and not hist_valid.empty:
        close_price = _safe(float(hist_valid["Close"].iloc[-1]))

    low_52w = _safe(float(hist_valid["Low"].min())) if not hist_valid.empty else None
    high_52w = _safe(float(hist_valid["High"].max())) if not hist_valid.empty else None

    info = ticker.info or {}

    distance_to_low = round((close_price - low_52w) / low_52w, 4) if (close_price and low_52w) else None
    distance_to_high = round((high_52w - close_price) / high_52w, 4) if (high_52w and close_price) else None

    return {
        "symbol": symbol,
        "date": latest_date,
        "close_price": close_price,
        "low_52_week": low_52w,
        "high_52_week": high_52w,
        "trailing_pe": _safe(info.get("trailingPE")),
        "forward_pe": _safe(info.get("forwardPE")),
        "profit_margin": _safe(info.get("profitMargins")),
        "operating_margin": _safe(info.get("operatingMargins")),
        "revenue_growth": _safe(info.get("revenueGrowth")),
        "earnings_growth": _safe(info.get("earningsGrowth")),
        "market_cap": _safe(info.get("marketCap")),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "distance_to_low_pct": distance_to_low,
        "distance_to_high_pct": distance_to_high,
        "closer_to_52w_low": (
            distance_to_low is not None
            and distance_to_high is not None
            and distance_to_low < distance_to_high
        ),
    }
    cache_set(key, result)
    return result


def get_market_context() -> dict:
    cached = cache_get("market", MARKET_TTL)
    if cached:
        return cached
    spy_ticker = yf.Ticker("SPY")
    vix_ticker = yf.Ticker("^VIX")

    # fast_info for current prices
    spy_latest = _safe(spy_ticker.fast_info.get("lastPrice"))
    vix_latest = _safe(vix_ticker.fast_info.get("lastPrice"))

    # History for moving averages — drop nan
    spy = spy_ticker.history(period="6mo", interval="1d").dropna(subset=["Close"])
    spy_20dma = _safe(float(spy["Close"].tail(20).mean())) if len(spy) >= 20 else None
    spy_50dma = _safe(float(spy["Close"].tail(50).mean())) if len(spy) >= 50 else None

    market_trend = "unknown"
    if spy_latest and spy_20dma and spy_50dma:
        if spy_latest > spy_20dma > spy_50dma:
            market_trend = "bullish"
        elif spy_latest < spy_20dma < spy_50dma:
            market_trend = "bearish"
        else:
            market_trend = "mixed"

    result = {
        "market_trend": market_trend,
        "vix": vix_latest,
        "spy_latest": spy_latest,
        "spy_20dma": spy_20dma,
        "spy_50dma": spy_50dma,
    }
    cache_set("market", result)
    return result


def get_price_history(symbol: str, period: str = "1y") -> list[dict]:
    """Return OHLCV history as a list of dicts for charting."""
    key = f"history:{symbol}:{period}"
    cached = cache_get(key, HISTORY_TTL)
    if cached:
        return cached
    ticker = yf.Ticker(symbol.strip().upper())
    hist = ticker.history(period=period, interval="1d").dropna(subset=["Close"])
    if hist.empty:
        return []
    records = []
    for ts, row in hist.iterrows():
        o = _safe(float(row["Open"]))
        h = _safe(float(row["High"]))
        l = _safe(float(row["Low"]))
        c = _safe(float(row["Close"]))
        if c is None:
            continue
        records.append({
            "date": ts.strftime("%Y-%m-%d"),
            "open": o or c,
            "high": h or c,
            "low": l or c,
            "close": c,
            "volume": int(row["Volume"]) if not math.isnan(float(row["Volume"])) else 0,
        })
    cache_set(key, records)
    return records
