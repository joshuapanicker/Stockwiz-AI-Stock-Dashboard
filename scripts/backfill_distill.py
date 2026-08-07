"""
V2 diversified distillation backfill.

Generates fine-tuning training examples by running the same analysis
pipeline analyze_stock() uses (metrics, criteria, RAG filing context,
Claude call) across a stratified set of tickers and scenarios, and
appending each to the distillation log (core/distill_log.py).

Deliberately does NOT call analyze_stock() directly, and deliberately
does NOT call core.track_record.log_call(): analyze_stock() logs every
verdict to the public "AI track record" ledger shown in the app / on the
landing page, which is marketed as an authentic, unedited record of real
verdicts. Looping analyze_stock() here would flood that public ledger
with synthetic backfill verdicts (up to one buy + one sell entry per
symbol per day, since log_call dedupes on symbol+action+day — the v1
backfill likely did this already). This script reproduces the same
prompt-building / RAG-grounding / distillation-logging path without the
track-record side effect.

Bills to your own ANTHROPIC_API_KEY (passes user_id=None, which resolves
to the shared key, unmetered, no per-user credits touched — see
core/credits.py resolve_api_key). Run a small batch first to sanity-check
cost before committing to the full list.

Usage:
    py -3 scripts/backfill_distill.py --limit 5      # test batch, ~30 calls
    py -3 scripts/backfill_distill.py                # full curated list

Run via `railway run` to reuse Railway's env vars without exporting them
locally:
    railway run py -3 scripts/backfill_distill.py --limit 5
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.analysis import (
    _build_prompt, _build_retrieval_query, _get_filing_context, _parse_decision,
)
from core.criteria import evaluate_criteria
from core.credits import metered_create
from core.distill_log import log_example
from core.metrics import get_market_context, get_stock_metrics
from core.news import build_news_context
from core.rag_index import ensure_indexed

# Approximate GICS-sector stratification, mixed cap sizes per sector.
# Not authoritative classification — just enough spread for training-data
# diversity. Extend freely; nothing downstream depends on these groupings
# being exact (actual sector is read live from yfinance metrics below).
SECTOR_TICKERS: dict[str, list[str]] = {
    "Technology":              ["AAPL", "MSFT", "NVDA", "ADBE", "CRM", "AMD", "INTC", "PANW", "DDOG"],
    "Healthcare":               ["UNH", "LLY", "JNJ", "PFE", "MRK", "ABBV", "ISRG", "VRTX", "MRNA"],
    "Financials":                ["JPM", "BAC", "GS", "MS", "AXP", "SCHW", "SOFI"],
    "Consumer Discretionary":    ["AMZN", "HD", "MCD", "NKE", "SBUX", "LOW", "ETSY"],
    "Consumer Staples":          ["WMT", "PG", "KO", "PEP", "COST", "CLX"],
    "Energy":                    ["XOM", "CVX", "COP", "SLB", "OXY"],
    "Industrials":               ["CAT", "BA", "GE", "RTX", "UNP", "HON"],
    "Materials":                 ["LIN", "FCX", "NEM", "DOW"],
    "Utilities":                 ["NEE", "DUK", "SO", "AEP"],
    "Real Estate":                ["PLD", "AMT", "EQIX", "SPG"],
    "Communication Services":     ["GOOGL", "META", "DIS", "NFLX", "T"],
}

# Sell scenarios as gain_pct fractions (matches core/portfolio.py's
# gain_per_share / buy_price convention: 0.20 == +20%, not 20.0).
SELL_GAIN_SCENARIOS = [-0.25, -0.10, 0.0, 0.20, 0.60]

MODEL = "claude-haiku-4-5-20251001"
SYSTEM = ("You are a disciplined stock analysis assistant. "
          "Use only the provided data. Do not fabricate missing values.")


def run_one(symbol: str, action: str, market: dict, gain_pct: float | None = None) -> bool:
    try:
        metrics = get_stock_metrics(symbol)
        try:
            news_ctx = build_news_context(symbol)
        except Exception:
            news_ctx = ""

        criteria_result = evaluate_criteria(action, metrics, market, gain_pct=gain_pct)
        retrieval_query = _build_retrieval_query(symbol, action, criteria_result)
        filing_ctx, _sources = _get_filing_context(symbol, retrieval_query)

        prompt = _build_prompt(symbol, action, criteria_result, metrics, market,
                               news_ctx=news_ctx, gain_pct=gain_pct, filing_ctx=filing_ctx)

        message = metered_create(
            None,  # unmetered: bills to ANTHROPIC_API_KEY directly, no user credits touched
            model=MODEL, max_tokens=300, system=SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )
        analysis_text = message.content[0].text if message.content else ""
        if not analysis_text.strip() or not _parse_decision(analysis_text):
            return False  # malformed output isn't a useful training example

        log_example(
            task="stock_analysis", system=SYSTEM, prompt=prompt, output=analysis_text,
            model=MODEL, meta={"symbol": symbol, "action": action, "gain_pct": gain_pct,
                               "sector": metrics.get("sector"), "source": "backfill_v2"},
        )
        return True
    except Exception as e:
        print(f"    ! {symbol} {action} gain={gain_pct}: {e}")
        return False


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None,
                        help="cap tickers PER SECTOR (e.g. --limit 2 for a cheap test run)")
    parser.add_argument("--sleep", type=float, default=1.0,
                        help="seconds to sleep between symbols (politeness to yfinance/SEC/Anthropic)")
    args = parser.parse_args()

    tickers: list[tuple[str, str]] = []  # (sector, symbol)
    for sector, symbols in SECTOR_TICKERS.items():
        for sym in (symbols[:args.limit] if args.limit else symbols):
            tickers.append((sector, sym))

    total_calls = len(tickers) * (1 + len(SELL_GAIN_SCENARIOS))
    print(f"{len(tickers)} tickers x {1 + len(SELL_GAIN_SCENARIOS)} scenarios "
          f"= up to {total_calls} calls\n")

    market = get_market_context()
    ok, failed = 0, 0

    for i, (sector, symbol) in enumerate(tickers, 1):
        print(f"[{i}/{len(tickers)}] {symbol} ({sector})")
        ensure_indexed(symbol)  # block so every scenario below gets RAG-grounded, not just later runs

        if run_one(symbol, "buy", market):
            ok += 1
        else:
            failed += 1

        for gp in SELL_GAIN_SCENARIOS:
            if run_one(symbol, "sell", market, gain_pct=gp):
                ok += 1
            else:
                failed += 1

        time.sleep(args.sleep)

    print(f"\nDone. {ok} examples logged, {failed} failed/skipped.")
    print("Log file: core/distill_log.py's LOG_PATH (default data/distill_log.jsonl, "
          "or $DISTILL_LOG_PATH if set).")


if __name__ == "__main__":
    main()
