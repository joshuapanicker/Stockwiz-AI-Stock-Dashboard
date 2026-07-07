"""
SQLite-backed persistent cache for the stock universe.

This is separate from the in-memory TTL cache (core/cache.py) because we need:
  - Persistence across server restarts (full universe scan takes ~30 min)
  - Query capability (filter by sector, PE, growth, etc.)
  - Lightweight reads without hitting yfinance for every request

Schema
------
universe_stocks(
    symbol       TEXT PRIMARY KEY,
    last_updated REAL,          -- unix timestamp
    close_price  REAL,
    low_52_week  REAL,
    high_52_week REAL,
    trailing_pe  REAL,
    forward_pe   REAL,
    profit_margin      REAL,
    operating_margin   REAL,
    revenue_growth     REAL,
    earnings_growth    REAL,
    market_cap         REAL,
    sector             TEXT,
    industry           TEXT,
    distance_to_low_pct  REAL,
    distance_to_high_pct REAL,
    closer_to_52w_low  INTEGER,  -- 0/1 bool
    fetch_error        TEXT       -- NULL if ok
)
"""

from __future__ import annotations

import json
import math
import os
import sqlite3
import time
from pathlib import Path
from typing import Any

# On hosted deploys, point UNIVERSE_DB_PATH at a persistent volume
# (e.g. /data/universe.db) so the cache survives redeploys. The repo's
# data/ dir stays the default for local dev.
DB_PATH = Path(os.getenv("UNIVERSE_DB_PATH") or (Path(__file__).parent.parent / "data" / "universe.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
UNIVERSE_FILE = Path(__file__).parent.parent / "data" / "universe.json"

# How long a cached record is considered fresh (24 hours)
UNIVERSE_RECORD_TTL = 86_400

COLUMNS = [
    "symbol", "last_updated", "close_price",
    "low_52_week", "high_52_week",
    "trailing_pe", "forward_pe",
    "profit_margin", "operating_margin",
    "revenue_growth", "earnings_growth",
    "market_cap", "sector", "industry",
    "distance_to_low_pct", "distance_to_high_pct",
    "closer_to_52w_low", "fetch_error",
]


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False, timeout=15)
    conn.row_factory = sqlite3.Row
    # WAL lets API reads proceed while the background fetcher writes —
    # essential now that the universe is ~6k symbols and writes are constant.
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def ensure_schema() -> None:
    with _connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS universe_stocks (
                symbol               TEXT PRIMARY KEY,
                last_updated         REAL,
                close_price          REAL,
                low_52_week          REAL,
                high_52_week         REAL,
                trailing_pe          REAL,
                forward_pe           REAL,
                profit_margin        REAL,
                operating_margin     REAL,
                revenue_growth       REAL,
                earnings_growth      REAL,
                market_cap           REAL,
                sector               TEXT,
                industry             TEXT,
                distance_to_low_pct  REAL,
                distance_to_high_pct REAL,
                closer_to_52w_low    INTEGER,
                fetch_error          TEXT
            )
        """)
        # Indexes for the screener's common filters/sorts at ~6k-row scale
        for idx in [
            "CREATE INDEX IF NOT EXISTS idx_universe_mcap ON universe_stocks(market_cap DESC)",
            "CREATE INDEX IF NOT EXISTS idx_universe_sector ON universe_stocks(sector)",
            "CREATE INDEX IF NOT EXISTS idx_universe_fpe ON universe_stocks(forward_pe)",
            "CREATE INDEX IF NOT EXISTS idx_universe_revg ON universe_stocks(revenue_growth)",
            "CREATE INDEX IF NOT EXISTS idx_universe_dlow ON universe_stocks(distance_to_low_pct)",
            "CREATE INDEX IF NOT EXISTS idx_universe_updated ON universe_stocks(last_updated)",
        ]:
            conn.execute(idx)
        conn.commit()


def get_universe_symbols() -> list[str]:
    """Return all symbols in universe.json (priority-ordered)."""
    data = json.loads(UNIVERSE_FILE.read_text())
    return data.get("symbols", [])


def upsert_stock(metrics: dict, error: str | None = None) -> None:
    """Write or update a stock record."""
    symbol = metrics.get("symbol") or ""
    if not symbol:
        return
    row = (
        symbol,
        time.time(),
        metrics.get("close_price"),
        metrics.get("low_52_week"),
        metrics.get("high_52_week"),
        metrics.get("trailing_pe"),
        metrics.get("forward_pe"),
        metrics.get("profit_margin"),
        metrics.get("operating_margin"),
        metrics.get("revenue_growth"),
        metrics.get("earnings_growth"),
        metrics.get("market_cap"),
        metrics.get("sector"),
        metrics.get("industry"),
        metrics.get("distance_to_low_pct"),
        metrics.get("distance_to_high_pct"),
        1 if metrics.get("closer_to_52w_low") else 0,
        error,
    )
    with _connect() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO universe_stocks VALUES
            (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, row)
        conn.commit()


# Symbols that errored (delisted tickers, dead SPACs) are retried far less
# often so refresh cycles aren't dominated by re-fetching dead names.
ERROR_RETRY_TTL = 3 * 86_400


def get_stale_symbols(max_age: float = UNIVERSE_RECORD_TTL) -> list[str]:
    """
    Return symbols that are missing or older than max_age seconds,
    in universe priority order (curated large caps first).
    """
    all_symbols = get_universe_symbols()
    now = time.time()
    with _connect() as conn:
        rows = conn.execute(
            """SELECT symbol FROM universe_stocks
               WHERE (fetch_error IS NULL AND last_updated > ?)
                  OR (fetch_error IS NOT NULL AND last_updated > ?)""",
            (now - max_age, now - ERROR_RETRY_TTL),
        ).fetchall()
    fresh = {r["symbol"] for r in rows}
    return [s for s in all_symbols if s not in fresh]


def get_cached_count() -> int:
    with _connect() as conn:
        return conn.execute(
            "SELECT COUNT(*) FROM universe_stocks WHERE fetch_error IS NULL"
        ).fetchone()[0]


def get_total_universe_size() -> int:
    return len(get_universe_symbols())


def row_to_metrics(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["closer_to_52w_low"] = bool(d.get("closer_to_52w_low"))
    d["date"] = "cached"
    return d


def query_universe(
    sector: str | None = None,
    min_market_cap: float | None = None,
    max_forward_pe: float | None = None,
    min_revenue_growth: float | None = None,
    min_profit_margin: float | None = None,
    near_52w_low_pct: float | None = None,   # distance_to_low_pct < X
    max_trailing_pe: float | None = None,
    min_earnings_growth: float | None = None,
    limit: int = 200,
    order_by: str = "market_cap DESC",
) -> list[dict]:
    """
    Filter the cached universe with structured criteria.
    Returns list of metric dicts, sorted and limited.
    """
    clauses: list[str] = ["fetch_error IS NULL", "close_price IS NOT NULL"]
    params: list[Any] = []

    if sector:
        clauses.append("LOWER(sector) = LOWER(?)")
        params.append(sector)
    if min_market_cap is not None:
        clauses.append("market_cap >= ?")
        params.append(min_market_cap)
    if max_forward_pe is not None:
        clauses.append("forward_pe IS NOT NULL AND forward_pe <= ?")
        params.append(max_forward_pe)
    if min_revenue_growth is not None:
        clauses.append("revenue_growth IS NOT NULL AND revenue_growth >= ?")
        params.append(min_revenue_growth)
    if min_profit_margin is not None:
        clauses.append("profit_margin IS NOT NULL AND profit_margin >= ?")
        params.append(min_profit_margin)
    if near_52w_low_pct is not None:
        clauses.append("distance_to_low_pct IS NOT NULL AND distance_to_low_pct <= ?")
        params.append(near_52w_low_pct)
    if max_trailing_pe is not None:
        clauses.append("trailing_pe IS NOT NULL AND trailing_pe <= ?")
        params.append(max_trailing_pe)
    if min_earnings_growth is not None:
        clauses.append("earnings_growth IS NOT NULL AND earnings_growth >= ?")
        params.append(min_earnings_growth)

    # Whitelist safe order_by columns
    safe_orders = {
        "market_cap DESC", "market_cap ASC",
        "revenue_growth DESC", "revenue_growth ASC",
        "forward_pe ASC", "forward_pe DESC",
        "distance_to_low_pct ASC", "distance_to_low_pct DESC",
        "profit_margin DESC", "profit_margin ASC",
        "close_price DESC", "close_price ASC",
        "earnings_growth DESC", "earnings_growth ASC",
    }
    safe_order = order_by if order_by in safe_orders else "market_cap DESC"

    where = " AND ".join(clauses)
    sql = f"""
        SELECT * FROM universe_stocks
        WHERE {where}
        ORDER BY {safe_order}
        LIMIT ?
    """
    params.append(limit)

    with _connect() as conn:
        rows = conn.execute(sql, params).fetchall()

    return [row_to_metrics(r) for r in rows]


def get_sectors() -> list[str]:
    """Return distinct non-null sectors in the cached universe."""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT DISTINCT sector FROM universe_stocks WHERE sector IS NOT NULL ORDER BY sector"
        ).fetchall()
    return [r["sector"] for r in rows]


# Initialize schema on import
ensure_schema()
