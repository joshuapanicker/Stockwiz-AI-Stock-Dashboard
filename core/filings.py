"""
SEC EDGAR filing fetcher — pulls Risk Factors (Item 1A) and MD&A
(Item 7 for 10-K / Item 2 for 10-Q) sections from a company's most recent
10-K and 10-Q, for RAG grounding in stock analysis.

Free, no API key. SEC does require a descriptive User-Agent identifying
the requester (SEC_EDGAR_CONTACT env var) per its fair-access policy —
set this to "YourApp yourreal@email.com", or requests get rate-limited
or blocked.

Section extraction is best-effort regex over the filing's plain text.
Filers format 10-Ks/10-Qs inconsistently, so a section that can't be
confidently isolated is skipped rather than indexed as garbage.
"""

from __future__ import annotations

import html
import os
import re
import threading
import time
from dataclasses import dataclass

import httpx
from lxml import html as lxml_html

from core.cache import fetch_through

_CONTACT = os.getenv("SEC_EDGAR_CONTACT", "StockWiz research@example.com")
_HEADERS = {"User-Agent": _CONTACT}

_TICKER_MAP_TTL = 7 * 86_400   # SEC's ticker list barely changes
_SUBMISSIONS_TTL = 86_400      # recheck for new filings daily

_throttle_lock = threading.Lock()
_last_request = 0.0
_MIN_INTERVAL = 0.15  # stay well under SEC's ~10 req/s fair-use limit


def _throttled_get(url: str) -> httpx.Response:
    global _last_request
    with _throttle_lock:
        wait = _MIN_INTERVAL - (time.time() - _last_request)
        if wait > 0:
            time.sleep(wait)
        _last_request = time.time()
    resp = httpx.get(url, headers=_HEADERS, timeout=10.0)
    resp.raise_for_status()
    return resp


def _fetch_ticker_map() -> dict[str, str]:
    """symbol -> zero-padded 10-digit CIK"""
    resp = _throttled_get("https://www.sec.gov/files/company_tickers.json")
    data = resp.json()
    return {row["ticker"].upper(): str(row["cik_str"]).zfill(10) for row in data.values()}


def get_cik(symbol: str) -> str | None:
    mapping = fetch_through("sec:ticker_map", _TICKER_MAP_TTL, _fetch_ticker_map)
    return mapping.get(symbol.strip().upper())


@dataclass
class Filing:
    form: str          # "10-K" or "10-Q"
    filing_date: str
    accession: str
    primary_doc: str
    cik: str

    @property
    def url(self) -> str:
        acc_no_dash = self.accession.replace("-", "")
        cik_int = str(int(self.cik))
        return f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_no_dash}/{self.primary_doc}"


def _fetch_submissions(cik: str) -> dict:
    resp = _throttled_get(f"https://data.sec.gov/submissions/CIK{cik}.json")
    return resp.json()


def get_recent_filings(symbol: str, forms: tuple[str, ...] = ("10-K", "10-Q"),
                       limit: int = 1) -> list[Filing]:
    """Most recent filing of each requested form type for a ticker."""
    cik = get_cik(symbol)
    if not cik:
        return []
    data = fetch_through(f"sec:submissions:{cik}", _SUBMISSIONS_TTL,
                         lambda: _fetch_submissions(cik))
    recent = data.get("filings", {}).get("recent", {})
    forms_list = recent.get("form", [])
    seen: set[str] = set()
    out: list[Filing] = []
    for i, form in enumerate(forms_list):
        if form in forms and form not in seen:
            out.append(Filing(
                form=form,
                filing_date=recent["filingDate"][i],
                accession=recent["accessionNumber"][i],
                primary_doc=recent["primaryDocument"][i],
                cik=cik,
            ))
            seen.add(form)
        if len(seen) >= len(forms):
            break
    return out


def _strip_html(raw: str) -> str:
    try:
        tree = lxml_html.fromstring(raw)
        text = tree.text_content()
    except Exception:
        text = re.sub(r"<[^>]+>", " ", raw)
    # SEC's iXBRL-tagged filings can leave numeric entities (&#160;, &#8217;)
    # un-decoded as literal text after tag-stripping, which breaks "Item 1A"
    # / "Risk Factors" adjacency in the section regexes below. Unescape
    # twice to also handle the occasional double-escaped entity.
    text = html.unescape(html.unescape(text))
    return re.sub(r"\s+", " ", text).strip()


# Item boundaries differ between 10-K and 10-Q. Patterns are intentionally
# loose (case-insensitive) since filers format these headers inconsistently.
_SECTION_BOUNDARIES = {
    ("10-K", "risk_factors"): (r"item\s+1a\.?\s+risk\s+factors", r"item\s+1b\.?\s"),
    ("10-K", "mda"):          (r"item\s+7\.?\s+management.s\s+discussion", r"item\s+7a\.?\s"),
    ("10-Q", "risk_factors"): (r"item\s+1a\.?\s+risk\s+factors", r"item\s+2\.?\s"),
    ("10-Q", "mda"):          (r"item\s+2\.?\s+management.s\s+discussion", r"item\s+3\.?\s"),
}


_GENERIC_ITEM_PATTERN = re.compile(r"item\s+\d+[a-c]?\.?\s", re.IGNORECASE)
_TOC_WINDOW = 600
_TOC_DENSITY_THRESHOLD = 3  # 3+ other "Item N" mentions nearby = a TOC listing


def extract_section(text: str, form: str, section: str) -> str | None:
    key = (form, section)
    if key not in _SECTION_BOUNDARIES:
        return None
    start_pat, end_pat = _SECTION_BOUNDARIES[key]
    start_matches = list(re.finditer(start_pat, text, re.IGNORECASE))
    if not start_matches:
        return None

    # A table-of-contents listing crams several "Item N" headings into a
    # small window (just page numbers between them); a real section body
    # has at most an occasional cross-reference to another item nearby.
    # Prefer whichever candidate has the FEWEST other "Item N" mentions in
    # the following window, i.e. isn't part of a dense TOC listing.
    best_start, best_density = None, None
    for m in start_matches:
        window = text[m.end(): m.end() + _TOC_WINDOW]
        density = len(_GENERIC_ITEM_PATTERN.findall(window))
        if best_density is None or density < best_density:
            best_start, best_density = m.start(), density

    if best_start is None or best_density >= _TOC_DENSITY_THRESHOLD:
        return None  # even the best candidate still looks like a TOC listing

    end_match = re.search(end_pat, text[best_start + 20:], re.IGNORECASE)
    end = best_start + 20 + end_match.start() if end_match else min(best_start + 20_000, len(text))
    section_text = text[best_start:end].strip()
    return section_text if len(section_text) > 200 else None


def fetch_filing_sections(symbol: str) -> list[dict]:
    """
    Returns a list of {form, date, section, text} — one entry per
    successfully-extracted section from the ticker's most recent 10-K/10-Q.
    Best-effort: skips whatever it can't cleanly parse rather than failing.
    """
    results: list[dict] = []
    for filing in get_recent_filings(symbol):
        try:
            resp = _throttled_get(filing.url)
        except Exception:
            continue
        text = _strip_html(resp.text)
        for section in ("risk_factors", "mda"):
            extracted = extract_section(text, filing.form, section)
            if extracted:
                results.append({
                    "form": filing.form,
                    "date": filing.filing_date,
                    "section": section,
                    "text": extracted,
                })
    return results
