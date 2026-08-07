"""
Targeted sell-scenario backfill — fixes the class imbalance in the v2
distillation dataset.

Problem this solves: `backfill_distill.py` produced 330 sell examples of
which only 2.4% had Decision: YES. The `sell` mode needs 2 of 5 rules met,
and on healthy large caps in a bullish market the four non-gain rules
(near 52w high, trailing PE > 50, negative revenue growth, bearish market)
almost never trip — so a high gain_pct alone leaves the verdict at 1/5 and
the answer is always NO. Fine-tuning on that teaches "never sell."

Approach: screen candidates' metrics FIRST (yfinance only — free, no Claude
calls), keep the tickers that already satisfy at least one non-gain sell
rule, then spend Claude calls only on those, paired with gain_pct values
above the 40% profit_target threshold. Those combinations reach the 2-rule
bar, so they produce genuine YES sell examples.

Cost control: prints the screened candidate list and the exact call count,
then requires --confirm to actually spend anything. Dry-run by default.

Usage:
    py -3 scripts/backfill_sell_balance.py                  # dry run: screen + report only
    py -3 scripts/backfill_sell_balance.py --confirm        # actually run Claude calls
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
from core.credits import metered_create
from core.criteria import evaluate_criteria
from core.distill_log import log_example
from core.metrics import get_market_context, get_stock_metrics
from core.news import build_news_context
from core.rag_index import ensure_indexed

# Wide candidate pool — deliberately includes high-multiple names and
# recent decliners, since those are the ones likely to trip a non-gain
# sell rule. Screening below decides which actually qualify.
CANDIDATES = [
    "NVDA", "TSLA", "PLTR", "SMCI", "COIN", "NFLX", "AMD", "CRM", "NOW", "SHOP",
    "SNOW", "DDOG", "PANW", "ANET", "MU", "AVGO", "ISRG", "LLY", "COST", "WMT",
    "MCD", "SBUX", "NKE", "INTC", "PFE", "MRNA", "BA", "DIS", "T", "VZ",
    "ETSY", "SOFI", "OXY", "SLB", "NEM", "FCX", "DOW", "CLX", "AEP", "SPG",
    "UBER", "ABNB", "PYPL", "SQ", "RIVN", "F", "GM", "GE", "CAT", "HON",
]

# Above the profit_target threshold (gain_pct > 0.4), so the gain rule
# always contributes one of the two required rules.
HIGH_GAIN_SCENARIOS = [0.5, 0.75, 1.2]

MODEL = "claude-haiku-4-5-20251001"
SYSTEM = ("You are a disciplined stock analysis assistant. "
          "Use only the provided data. Do not fabricate missing values.")


def non_gain_sell_rules_met(metrics: dict, market: dict) -> int:
    """How many sell rules trip WITHOUT any gain_pct contribution.
    Mirrors data/criteria.json's sell rules."""
    n = 0
    dth = metrics.get("distance_to_high_pct")
    if dth is not None and dth < 0.1:
        n += 1
    tpe = metrics.get("trailing_pe")
    if tpe is not None and tpe > 50:
        n += 1
    rg = metrics.get("revenue_growth")
    if rg is not None and rg < 0:
        n += 1
    if market.get("market_trend") == "bearish":
        n += 1
    return n


def run_one(symbol: str, market: dict, gain_pct: float) -> str | None:
    try:
        metrics = get_stock_metrics(symbol)
        try:
            news_ctx = build_news_context(symbol)
        except Exception:
            news_ctx = ""
        criteria_result = evaluate_criteria("sell", metrics, market, gain_pct=gain_pct)
        rq = _build_retrieval_query(symbol, "sell", criteria_result)
        filing_ctx, _ = _get_filing_context(symbol, rq)
        prompt = _build_prompt(symbol, "sell", criteria_result, metrics, market,
                               news_ctx=news_ctx, gain_pct=gain_pct, filing_ctx=filing_ctx)
        msg = metered_create(None, model=MODEL, max_tokens=300, system=SYSTEM,
                             messages=[{"role": "user", "content": prompt}])
        text = msg.content[0].text if msg.content else ""
        decision = _parse_decision(text)
        if not decision:
            return None
        log_example(task="stock_analysis", system=SYSTEM, prompt=prompt, output=text,
                    model=MODEL, meta={"symbol": symbol, "action": "sell",
                                       "gain_pct": gain_pct,
                                       "sector": metrics.get("sector"),
                                       "source": "backfill_sell_balance"})
        return decision
    except Exception as e:
        print(f"    ! {symbol} gain={gain_pct}: {e}")
        return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--confirm", action="store_true",
                    help="actually make Claude calls (default is a free dry-run screen)")
    ap.add_argument("--sleep", type=float, default=1.0)
    args = ap.parse_args()

    market = get_market_context()
    print(f"market_trend={market.get('market_trend')} vix={market.get('vix')}\n")
    print("Screening candidates (yfinance only, no Claude calls)...\n")

    qualified: list[tuple[str, int]] = []
    for sym in CANDIDATES:
        try:
            m = get_stock_metrics(sym)
        except Exception as e:
            print(f"  {sym:6s} metrics error: {e}")
            continue
        n = non_gain_sell_rules_met(m, market)
        flag = "OK " if n >= 1 else "   "
        print(f"  {flag}{sym:6s} non-gain sell rules met: {n}"
              f"  (dist_to_high={m.get('distance_to_high_pct')}, "
              f"trailing_pe={m.get('trailing_pe')}, rev_growth={m.get('revenue_growth')})")
        if n >= 1:
            qualified.append((sym, n))

    calls = len(qualified) * len(HIGH_GAIN_SCENARIOS)
    print(f"\n{len(qualified)}/{len(CANDIDATES)} qualified -> {calls} Claude calls "
          f"({len(HIGH_GAIN_SCENARIOS)} gain scenarios each)")

    if not args.confirm:
        print("\nDRY RUN — nothing spent. Re-run with --confirm to execute.")
        return

    yes = no = 0
    for i, (sym, _) in enumerate(qualified, 1):
        print(f"[{i}/{len(qualified)}] {sym}")
        ensure_indexed(sym)
        for gp in HIGH_GAIN_SCENARIOS:
            d = run_one(sym, market, gp)
            if d == "YES":
                yes += 1
            elif d == "NO":
                no += 1
        time.sleep(args.sleep)

    total = yes + no
    print(f"\nDone. {total} logged — YES={yes} ({yes/total:.0%}) NO={no}" if total
          else "\nDone. nothing logged.")


if __name__ == "__main__":
    main()
