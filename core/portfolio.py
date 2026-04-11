"""Manage the portfolio of purchased stocks."""

from __future__ import annotations

import json
import math
from pathlib import Path

import yfinance as yf

PORTFOLIO_FILE = Path(__file__).parent.parent / "data" / "portfolio.json"


def _safe(val) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
        return None if (math.isnan(f) or math.isinf(f)) else round(f, 4)
    except Exception:
        return None


def _load() -> dict:
    if not PORTFOLIO_FILE.exists():
        return {"holdings": []}
    with open(PORTFOLIO_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save(data: dict) -> None:
    PORTFOLIO_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PORTFOLIO_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def get_holdings() -> list[dict]:
    return _load().get("holdings", [])


def add_holding(symbol: str, buy_date: str, buy_price: float | None = None, notes: str = "") -> dict:
    symbol = symbol.strip().upper()
    if buy_price is None:
        buy_price = _lookup_price_on_date(symbol, buy_date)

    holding = {"symbol": symbol, "buy_date": buy_date, "buy_price": buy_price, "notes": notes}
    data = _load()
    data["holdings"] = [h for h in data["holdings"] if h["symbol"] != symbol]
    data["holdings"].append(holding)
    _save(data)
    return holding


def remove_holding(symbol: str) -> bool:
    symbol = symbol.strip().upper()
    data = _load()
    before = len(data["holdings"])
    data["holdings"] = [h for h in data["holdings"] if h["symbol"] != symbol]
    _save(data)
    return len(data["holdings"]) < before


def get_holding(symbol: str) -> dict | None:
    symbol = symbol.strip().upper()
    for h in get_holdings():
        if h["symbol"] == symbol:
            return h
    return None


def _lookup_price_on_date(symbol: str, date_str: str) -> float | None:
    """Fetch the closing price for a symbol on or near a given date."""
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(start=date_str, period="5d", interval="1d").dropna(subset=["Close"])
        if not hist.empty:
            return _safe(float(hist["Close"].iloc[0]))
        # fallback to fast_info current price
        return _safe(ticker.fast_info.get("lastPrice"))
    except Exception:
        return None


def compute_gain(holding: dict, current_price: float) -> dict:
    buy_price = holding.get("buy_price")
    if buy_price is None or buy_price == 0:
        return {"gain_pct": None, "gain_abs": None}
    gain_abs = round(current_price - buy_price, 4)
    gain_pct = round((current_price - buy_price) / buy_price, 4)
    return {"gain_pct": gain_pct, "gain_abs": gain_abs}


def get_portfolio_price_history(symbol: str, buy_date: str) -> list[dict]:
    """Return price history from buy_date to today for portfolio chart."""
    try:
        ticker = yf.Ticker(symbol.strip().upper())
        hist = ticker.history(start=buy_date, interval="1d").dropna(subset=["Close"])
        if hist.empty:
            return []
        records = []
        for ts, row in hist.iterrows():
            c = _safe(float(row["Close"]))
            if c is None:
                continue
            records.append({"date": ts.strftime("%Y-%m-%d"), "close": c})
        return records
    except Exception:
        return []
