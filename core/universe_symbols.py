"""
Universe symbol list builder.

Expands the stock universe from a curated ~500 list to every US-listed
common stock (~6,000 tickers) using the official NASDAQ Trader symbol
directories — the same listing source brokerages and market-data vendors
build their coverage from:

    https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt   (NASDAQ)
    https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt    (NYSE, NYSE American/AMEX, etc.)

Filtering keeps common equities and drops ETFs, test issues, warrants,
rights, units, preferred shares, and structured notes so screening results
stay meaningful.

The merged list is cached in data/universe.json:

    {
      "updated": <unix ts>,
      "source": "nasdaqtrader",
      "core_symbols": [...],   # original curated list — fetched first
      "symbols": [...]         # full prioritized universe
    }

Refreshes weekly in the background; falls back to the cached/bundled list
whenever the download fails, so the app never loses its universe.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

import requests

UNIVERSE_FILE = Path(__file__).parent.parent / "data" / "universe.json"

SYMBOL_DIR_URLS = [
    "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt",
    "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt",
]

# Refresh the listing directory weekly
SYMBOL_LIST_TTL = 7 * 86_400

# Security-name markers for non-common-stock instruments
_EXCLUDE_NAME = re.compile(
    r"warrant|right(s)?\b|\bunit(s)?\b|preferred|preference|depositary|"
    r"%|\bnote(s)?\b|debenture|trust preferred|fixed[- ]rate",
    re.IGNORECASE,
)


def _parse_symbol_dir(text: str, is_nasdaq: bool) -> list[str]:
    """Parse one pipe-delimited NASDAQ Trader symbol directory file."""
    symbols: list[str] = []
    lines = text.strip().splitlines()
    if len(lines) < 2:
        return symbols
    header = [h.strip() for h in lines[0].split("|")]
    idx = {name: i for i, name in enumerate(header)}

    sym_col = "Symbol" if is_nasdaq else "ACT Symbol"
    for line in lines[1:]:
        if line.startswith("File Creation Time"):
            continue
        parts = line.split("|")
        if len(parts) < len(header):
            continue

        def col(name: str) -> str:
            i = idx.get(name)
            return parts[i].strip() if i is not None and i < len(parts) else ""

        symbol = col(sym_col)
        if not symbol:
            continue
        # Skip test issues and ETFs
        if col("Test Issue") == "Y" or col("ETF") == "Y":
            continue
        # NYSE file: exchange P (Arca) and Z (BATS) list mostly ETPs
        if not is_nasdaq and col("Exchange") in ("P", "Z"):
            continue
        # Skip non-common instrument classes encoded in the symbol:
        # "$" marks preferred, "=" units, "^"/"+" rights & warrants, "#" when-issued
        if any(c in symbol for c in "$=^+#"):
            continue
        # Skip anything whose security name marks it as a non-common instrument
        if _EXCLUDE_NAME.search(col("Security Name")):
            continue

        # yfinance uses "-" for share classes (BRK.B -> BRK-B)
        symbols.append(symbol.replace(".", "-"))

    return symbols


def _download_listed_symbols(timeout: float = 30.0) -> list[str]:
    """Download and merge both symbol directories. Raises on failure."""
    merged: list[str] = []
    for url in SYMBOL_DIR_URLS:
        resp = requests.get(url, headers={"User-Agent": "stockwiz/1.0"}, timeout=timeout)
        resp.raise_for_status()
        merged.extend(_parse_symbol_dir(resp.text, is_nasdaq="nasdaqlisted" in url))
    # Dedupe, preserve order
    seen: set[str] = set()
    out: list[str] = []
    for s in merged:
        if s not in seen:
            seen.add(s)
            out.append(s)
    if len(out) < 1000:  # sanity check — a valid directory has thousands
        raise ValueError(f"symbol directory looked truncated ({len(out)} symbols)")
    return out


# In-memory cache: this file only changes when refresh_universe_symbols()
# writes it (at most a few times a day), but /api/universe/status polls it
# every 5s from every connected client — re-reading and re-parsing a
# ~5,700-entry JSON file that often added real, avoidable CPU/memory churn
# under concurrent load. Short TTL keeps it fresh without the per-poll cost.
_file_cache: dict | None = None
_file_cache_time = 0.0
_FILE_CACHE_TTL = 30.0  # seconds


def _read_universe_file() -> dict:
    global _file_cache, _file_cache_time
    now = time.time()
    if _file_cache is not None and (now - _file_cache_time) < _FILE_CACHE_TTL:
        return _file_cache
    try:
        data = json.loads(UNIVERSE_FILE.read_text())
        if isinstance(data, dict) and data.get("symbols"):
            _file_cache, _file_cache_time = data, now
            return data
    except Exception:
        pass
    fallback = {"updated": 0, "source": "none", "symbols": [], "core_symbols": []}
    _file_cache, _file_cache_time = fallback, now
    return fallback


def refresh_universe_symbols(force: bool = False) -> dict:
    """
    Ensure data/universe.json holds the full US-listed universe.
    Downloads the listing directories when the cached list is older than
    SYMBOL_LIST_TTL (or force=True). Always safe to call — falls back to
    the existing file on any failure. Returns the current universe dict.
    """
    current = _read_universe_file()
    fresh_enough = (
        current.get("source") == "nasdaqtrader"
        and time.time() - float(current.get("updated") or 0) < SYMBOL_LIST_TTL
    )
    if fresh_enough and not force:
        return current

    # The original curated list (S&P-scale large caps) stays first in fetch
    # priority so the most-watched names are always populated within minutes.
    core = current.get("core_symbols") or current.get("symbols") or []

    try:
        listed = _download_listed_symbols()
    except Exception:
        return current  # keep whatever we have

    core_set = set(core)
    prioritized = list(core) + sorted(s for s in listed if s not in core_set)

    data = {
        "updated": time.time(),
        "source": "nasdaqtrader",
        "core_symbols": core,
        "symbols": prioritized,
    }
    try:
        UNIVERSE_FILE.write_text(json.dumps(data))
    except Exception:
        pass
    return data
