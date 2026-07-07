"""
News and earnings data fetcher using yfinance.

No additional API keys required — yfinance provides:
  - ticker.news: recent headlines (title, publisher, link, publish time)
  - ticker.quarterly_financials: revenue/earnings history for beat/miss calculation

Results are cached in the in-memory TTL cache (10-minute TTL for news,
30-minute TTL for earnings since they change less frequently).
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Optional

import yfinance as yf

from core.cache import get as cache_get, set as cache_set

NEWS_TTL     = 600   # 10 min
EARNINGS_TTL = 1800  # 30 min
MAX_HEADLINES = 4


def _safe_float(val) -> float | None:
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except Exception:
        return None


def get_recent_news(symbol: str) -> list[dict]:
    """
    Return up to MAX_HEADLINES recent headlines for a symbol.
    Each item: {"title", "publisher", "age"}
    """
    key = f"news:{symbol}"
    cached = cache_get(key, NEWS_TTL)
    if cached is not None:
        return cached

    try:
        ticker = yf.Ticker(symbol.strip().upper())
        raw = ticker.news or []
        now = datetime.now(timezone.utc).timestamp()
        results = []
        for item in raw[:MAX_HEADLINES]:
            # yfinance changed structure: item may have item['content'] or item['title'] directly
            content = item.get("content", item)  # new API nests under 'content'
            title = content.get("title", "").strip()
            if not title:
                continue
            # Publisher / provider
            provider = content.get("provider", {})
            publisher = provider.get("displayName", "") if isinstance(provider, dict) else str(provider)
            # Publish time — try pubDate string or providerPublishTime int
            pub_date_str = content.get("pubDate", "")
            pub_time = item.get("providerPublishTime", 0)
            if pub_date_str:
                try:
                    from datetime import datetime as dt
                    pub_dt = dt.fromisoformat(pub_date_str.replace("Z", "+00:00"))
                    pub_time = pub_dt.timestamp()
                except Exception:
                    pass
            age_hours = (now - pub_time) / 3600 if pub_time else None
            if age_hours is not None:
                if age_hours < 1:
                    age = "< 1h ago"
                elif age_hours < 24:
                    age = f"{int(age_hours)}h ago"
                else:
                    age = f"{int(age_hours / 24)}d ago"
            else:
                age = "recent"
            # URL
            url_obj = content.get("canonicalUrl") or content.get("clickThroughUrl") or {}
            url = url_obj.get("url", "") if isinstance(url_obj, dict) else ""
            results.append({"title": title, "publisher": publisher, "age": age, "url": url})
        cache_set(key, results)
        return results
    except Exception:
        cache_set(key, [])
        return []


def get_recent_earnings(symbol: str) -> dict | None:
    """
    Return the most recent quarterly earnings beat/miss summary.
    Returns: {
        "quarter": "Q3 2024",
        "eps_actual": 1.23,
        "eps_estimate": 1.18,
        "beat_miss": "beat by 4.2%",
        "revenue_actual": "94.9B",
        "surprise_pct": 4.2
    }
    Returns None if data unavailable.
    """
    key = f"earnings:{symbol}"
    cached = cache_get(key, EARNINGS_TTL)
    if cached is not None:
        return cached or None  # None stored as sentinel

    try:
        ticker = yf.Ticker(symbol.strip().upper())

        # Try earnings_dates for EPS beat/miss
        try:
            earnings_dates = ticker.earnings_dates
            if earnings_dates is not None and not earnings_dates.empty:
                latest = earnings_dates.iloc[0]
                eps_actual   = _safe_float(latest.get("Reported EPS"))
                eps_estimate = _safe_float(latest.get("EPS Estimate"))
                surprise_pct = _safe_float(latest.get("Surprise(%)"))

                if eps_actual is not None and eps_estimate is not None:
                    idx = earnings_dates.index[0]
                    try:
                        quarter = idx.strftime("Q%q %Y") if hasattr(idx, 'strftime') else str(idx)[:7]
                    except Exception:
                        quarter = str(idx)[:7]

                    if surprise_pct is not None:
                        direction = "beat" if surprise_pct >= 0 else "missed"
                        beat_miss = f"{direction} by {abs(surprise_pct):.1f}%"
                    elif eps_estimate != 0:
                        diff_pct = (eps_actual - eps_estimate) / abs(eps_estimate) * 100
                        direction = "beat" if diff_pct >= 0 else "missed"
                        beat_miss = f"{direction} by {abs(diff_pct):.1f}%"
                        surprise_pct = diff_pct
                    else:
                        beat_miss = "no estimate available"
                        surprise_pct = None

                    result = {
                        "quarter": quarter,
                        "eps_actual": round(eps_actual, 2),
                        "eps_estimate": round(eps_estimate, 2),
                        "beat_miss": beat_miss,
                        "surprise_pct": round(surprise_pct, 1) if surprise_pct is not None else None,
                    }
                    cache_set(key, result)
                    return result
        except Exception:
            pass  # fall through to revenue fallback

        # Fallback: use quarterly financials for revenue trend
        fins = ticker.quarterly_financials
        if fins is not None and not fins.empty and "Total Revenue" in fins.index:
            rev_row = fins.loc["Total Revenue"]
            if len(rev_row) >= 2:
                latest_rev = _safe_float(rev_row.iloc[0])
                prev_rev   = _safe_float(rev_row.iloc[1])
                if latest_rev and prev_rev and prev_rev != 0:
                    rev_chg = (latest_rev - prev_rev) / abs(prev_rev) * 100
                    direction = "up" if rev_chg >= 0 else "down"
                    label = _fmt_large(latest_rev)
                    result = {
                        "quarter": str(rev_row.index[0])[:7] if hasattr(rev_row.index[0], '__str__') else "latest",
                        "revenue_actual": label,
                        "revenue_qoq_pct": round(rev_chg, 1),
                        "beat_miss": f"revenue {direction} {abs(rev_chg):.1f}% QoQ",
                        "eps_actual": None,
                        "eps_estimate": None,
                        "surprise_pct": None,
                    }
                    cache_set(key, result)
                    return result

        # No data available — store sentinel so we don't hammer yfinance
        cache_set(key, {})
        return None

    except Exception:
        cache_set(key, {})
        return None


def _fmt_large(n: float) -> str:
    if n >= 1e12: return f"${n/1e12:.1f}T"
    if n >= 1e9:  return f"${n/1e9:.1f}B"
    if n >= 1e6:  return f"${n/1e6:.1f}M"
    return f"${n:.0f}"


def build_news_context(symbol: str) -> str:
    """
    Build a compact news + earnings context string for injection into Claude prompts.
    Returns empty string if no data available (graceful degradation).
    """
    from concurrent.futures import ThreadPoolExecutor

    lines = []

    # Earnings and headlines are separate yfinance calls — fetch concurrently
    with ThreadPoolExecutor(max_workers=2) as pool:
        f_earnings = pool.submit(get_recent_earnings, symbol)
        f_news = pool.submit(get_recent_news, symbol)
        earnings = f_earnings.result()
        news = f_news.result()
    if earnings:
        e_line = f"Most recent earnings ({earnings.get('quarter', 'latest')}): {earnings['beat_miss']}"
        if earnings.get("eps_actual") is not None:
            e_line += f" | EPS actual: ${earnings['eps_actual']}"
        if earnings.get("eps_estimate") is not None:
            e_line += f" vs estimate: ${earnings['eps_estimate']}"
        lines.append(e_line)

    # News headlines
    if news:
        lines.append(f"Recent news ({len(news)} headlines):")
        for item in news:
            lines.append(f"  [{item['age']}] {item['title']} — {item['publisher']}")

    if not lines:
        return ""

    return "\n\nRecent news & earnings:\n" + "\n".join(lines)
