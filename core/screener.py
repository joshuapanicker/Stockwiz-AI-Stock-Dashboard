"""Screen the watchlist and classify each stock as buy, watch, or neither."""

from __future__ import annotations

import concurrent.futures
from dataclasses import dataclass, field

from core.criteria import evaluate_criteria, get_watchlist
from core.metrics import get_market_context, get_stock_metrics


@dataclass
class ScreenedStock:
    symbol: str
    metrics: dict
    market: dict
    buy_result: dict
    watch_result: dict
    classification: str  # "buy" | "watch" | "none"
    error: str | None = None


def _screen_one(symbol: str, market: dict) -> ScreenedStock:
    try:
        metrics = get_stock_metrics(symbol)
        buy_result = evaluate_criteria("buy", metrics, market)
        watch_result = evaluate_criteria("watch", metrics, market)

        if buy_result["passed"]:
            classification = "buy"
        elif watch_result["passed"]:
            classification = "watch"
        else:
            classification = "none"

        return ScreenedStock(
            symbol=symbol,
            metrics=metrics,
            market=market,
            buy_result=buy_result,
            watch_result=watch_result,
            classification=classification,
        )
    except Exception as exc:
        return ScreenedStock(
            symbol=symbol,
            metrics={},
            market=market,
            buy_result={},
            watch_result={},
            classification="none",
            error=str(exc),
        )


def run_screen(symbols: list[str] | None = None, max_workers: int = 8) -> list[ScreenedStock]:
    """Screen a list of symbols (defaults to watchlist) in parallel."""
    if symbols is None:
        symbols = get_watchlist()

    market = get_market_context()

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(_screen_one, sym, market): sym for sym in symbols}
        results = []
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())

    # stable sort: buy first, then watch, then none; alphabetical within group
    order = {"buy": 0, "watch": 1, "none": 2}
    results.sort(key=lambda s: (order[s.classification], s.symbol))
    return results
