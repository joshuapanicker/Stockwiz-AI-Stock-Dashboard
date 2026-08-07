"""Re-extract and re-index SEC filings for every ticker already in the index.

Needed whenever `core/filings.py` changes how sections are cut out of a
filing: the stored chunks were produced by the *old* extractor and nothing
re-reads them on its own. The normal path only re-indexes a ticker when
somebody analyses it and its 25-day TTL has expired, so on an app with
little traffic an extraction fix would take weeks to show up, or never.

Calls `index_ticker()` directly, which ignores the TTL and replaces a
ticker's rows in one transaction (delete + insert), so this is safe to
re-run and safe to interrupt — a ticker is either fully old or fully new,
never half-written.

Free: SEC EDGAR only, no Claude API calls.

    python scripts/reindex_filings.py --dry-run   # show what would change
    python scripts/reindex_filings.py --limit 5   # try a few first
    python scripts/reindex_filings.py

On Railway, run it on the container so it writes to the real volume —
`railway run` would execute locally against a local path instead:

    railway ssh "python scripts/reindex_filings.py"
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core import rag_index  # noqa: E402


def counts_by_ticker() -> dict[str, int]:
    conn = rag_index._connect()
    rag_index._ensure_schema(conn)
    return dict(conn.execute(
        "SELECT ticker, count(*) FROM filing_chunks GROUP BY ticker").fetchall())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, help="only the first N tickers")
    ap.add_argument("--tickers", help="comma-separated list instead of the index")
    ap.add_argument("--dry-run", action="store_true",
                    help="report current counts and exit without writing")
    args = ap.parse_args()

    if rag_index._DISABLED:
        print("RAG_DISABLED=1 — nothing to do", file=sys.stderr)
        return 2

    before = counts_by_ticker()
    if args.tickers:
        tickers = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
    else:
        tickers = sorted(before)
    if args.limit:
        tickers = tickers[:args.limit]

    print(f"index: {rag_index.DB_FILE}")
    print(f"{len(before)} tickers indexed, {sum(before.values())} chunks total")
    if args.dry_run:
        print("\n--dry-run, not writing")
        return 0
    print(f"re-indexing {len(tickers)}\n")

    started = time.time()
    gained = lost = same = failed = 0
    for i, ticker in enumerate(tickers, 1):
        was = before.get(ticker, 0)
        try:
            now = rag_index.index_ticker(ticker)
        except Exception as exc:                      # keep going; one bad
            failed += 1                               # filing must not stop
            print(f"[{i}/{len(tickers)}] {ticker:<6} FAILED: {exc}")
            continue
        if now > was:
            gained += 1
            flag = "+"
        elif now < was:
            lost += 1
            flag = "-"
        else:
            same += 1
            flag = " "
        print(f"[{i}/{len(tickers)}] {ticker:<6} {was:>3} -> {now:>3} {flag}",
              flush=True)

    after = counts_by_ticker()
    print(f"\n{'=' * 52}")
    print(f"gained {gained}   unchanged {same}   lost {lost}   failed {failed}")
    print(f"chunks {sum(before.values())} -> {sum(after.values())}")
    print(f"took {time.time() - started:.0f}s")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
