"""
RAG index for stock analysis — retrieves SEC filing excerpts (Risk
Factors, MD&A) per ticker so analyze_stock() and the chats can ground
their reasoning in real, current qualitative context instead of just
numeric fundamentals.

Retrieval engine: SQLite FTS5 (BM25 lexical search), NOT dense embeddings.
The first version used sentence-transformers + Chroma; on the small hosted
container the torch stack's memory footprint (~0.5GB RSS) caused OOM
crash-loops that made the whole app unusable. For this corpus — two
filings per ticker, ~40 chunks — BM25 keyword matching retrieves well,
especially since the criteria→topic query translation (core/analysis.py)
deliberately produces literal filing vocabulary ("gross margin",
"net sales"). Zero extra dependencies, near-zero memory, instant queries.

Performance contract (learned the hard way):
  - NOTHING here may block a user-facing request. Indexing (SEC fetches)
    always happens on a background thread; request paths only read an
    already-built index or return empty context.
  - One indexing job at a time (_index_gate) — mostly to stay polite to
    SEC's rate limits now that indexing itself is cheap.
  - RAG_DISABLED=1 kill switch: every entry point returns empty.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import threading
import time
from pathlib import Path

# On hosted deploys, point RAG_DB_PATH at a persistent volume so the index
# survives redeploys — same convention as UNIVERSE_DB_PATH. The value may
# be a directory (the FTS database file is created inside it), which keeps
# existing RAG_DB_PATH=/data/rag_chroma deployments working unchanged.
_BASE = Path(os.getenv("RAG_DB_PATH") or (Path(__file__).parent.parent / "data" / "rag_chroma"))
_BASE.mkdir(parents=True, exist_ok=True)
DB_FILE = _BASE if _BASE.suffix == ".db" else _BASE / "fts.db"

# Fresh state filename: earlier state tracked the (now retired) embedding
# index — reusing it would mark tickers "indexed" that have no FTS rows.
_STATE_FILE = _BASE.parent / "rag_fts_state.json"

_DISABLED = os.getenv("RAG_DISABLED") == "1"

# Filings update quarterly — no need to re-fetch more often than this.
REINDEX_TTL = 25 * 86_400

MAX_CHUNKS_PER_SECTION = int(os.getenv("RAG_MAX_CHUNKS_PER_SECTION", "20"))

_db_lock = threading.Lock()
_schema_ready = False


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_FILE), check_same_thread=False, timeout=15)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_schema(conn: sqlite3.Connection) -> None:
    global _schema_ready
    if _schema_ready:
        return
    conn.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS filing_chunks USING fts5(
            ticker UNINDEXED, form UNINDEXED, section UNINDEXED,
            date UNINDEXED, text
        )
    """)
    conn.commit()
    _schema_ready = True


def _chunk_text(text: str, words_per_chunk: int = 400, overlap: int = 50) -> list[str]:
    """Word-based sliding window — keeps each excerpt small enough to be
    retrieved precisely; overlap prevents a fact being cut in half."""
    words = text.split()
    if len(words) <= words_per_chunk:
        return [text]
    chunks = []
    step = words_per_chunk - overlap
    for i in range(0, len(words), step):
        chunk = " ".join(words[i:i + words_per_chunk])
        if chunk:
            chunks.append(chunk)
        if i + words_per_chunk >= len(words):
            break
    return chunks


def _load_state() -> dict:
    try:
        return json.loads(_STATE_FILE.read_text())
    except Exception:
        return {}


def _save_state(state: dict) -> None:
    _STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    _STATE_FILE.write_text(json.dumps(state))


# Guard against two callers indexing the same ticker simultaneously, and
# serialize indexing globally (politeness to SEC + zero CPU contention).
_inflight: set[str] = set()
_inflight_lock = threading.Lock()
_index_gate = threading.Semaphore(1)


def index_ticker(symbol: str) -> int:
    """Fetch this ticker's latest filing sections and index the chunks.
    Returns the number of chunks indexed."""
    if _DISABLED:
        return 0
    symbol = symbol.strip().upper()
    with _inflight_lock:
        if symbol in _inflight:
            return 0  # someone else is already indexing this ticker
        _inflight.add(symbol)
    try:
        with _index_gate:
            return _index_ticker_inner(symbol)
    finally:
        with _inflight_lock:
            _inflight.discard(symbol)


def _index_ticker_inner(symbol: str) -> int:
    from core.filings import fetch_filing_sections
    sections = fetch_filing_sections(symbol)

    rows: list[tuple] = []
    for sec in sections:
        for chunk in _chunk_text(sec["text"])[:MAX_CHUNKS_PER_SECTION]:
            # Skip the forward-looking-statements legal boilerplate: it's
            # packed with generic finance words ("trends", "demand",
            # "outlook") so it ranks high for almost any query, while
            # containing zero actual information to ground on.
            if "forward-looking statements" in chunk.lower():
                continue
            rows.append((symbol, sec["form"], sec["section"], sec["date"], chunk))

    with _db_lock:
        with _connect() as conn:
            _ensure_schema(conn)
            # Clear this ticker's old chunks so stale excerpts from a
            # previous filing don't linger alongside the fresh ones.
            conn.execute("DELETE FROM filing_chunks WHERE ticker = ?", (symbol,))
            if rows:
                conn.executemany(
                    "INSERT INTO filing_chunks (ticker, form, section, date, text) VALUES (?,?,?,?,?)",
                    rows,
                )
            conn.commit()

    state = _load_state()
    state[symbol] = time.time()
    _save_state(state)
    return len(rows)


def is_indexed(symbol: str) -> bool:
    """True if this ticker has a reasonably fresh index."""
    if _DISABLED:
        return False
    last = _load_state().get(symbol.strip().upper())
    return bool(last and (time.time() - last) < REINDEX_TTL)


def ensure_indexed(symbol: str) -> None:
    """(Re-)index a ticker if it's never been indexed or is stale.
    Blocking on SEC fetches — only call from background threads."""
    if _DISABLED or is_indexed(symbol):
        return
    try:
        index_ticker(symbol.strip().upper())
    except Exception:
        pass  # grounding is a bonus, not a hard requirement — never break analysis over it


def ensure_indexed_async(symbol: str) -> None:
    """Fire-and-forget indexing: a cold ticker gets indexed in the
    background so the NEXT analysis/chat about it is grounded, instead of
    stalling the current one."""
    if _DISABLED or is_indexed(symbol):
        return
    threading.Thread(target=ensure_indexed, args=(symbol,), daemon=True).start()


_WORD_RE = re.compile(r"[A-Za-z][A-Za-z\-]{2,}")
_STOPWORDS = {
    "and", "the", "for", "with", "are", "was", "has", "have", "how", "what",
    "their", "them", "they", "this", "that", "its", "his", "her", "our",
    "your", "about", "related", "recent", "holding", "doing",
}


def _fts_query(query: str) -> str | None:
    """Turn free text into an FTS5 OR-query over the text column.

    Includes adjacent-word phrases ("gross margin", "net sales") alongside
    single tokens: a chunk containing the exact phrase matches the phrase
    term AND both word terms, so BM25 ranks it well above chunks that just
    scatter the same words — which is what keeps generic finance
    boilerplate (packed with common words) out of the top ranks.
    Everything is quoted so user text can't break the match syntax.
    """
    words = _WORD_RE.findall(query.lower())
    terms: list[str] = []
    for a, b in zip(words, words[1:]):
        if a not in _STOPWORDS and b not in _STOPWORDS:
            phrase = f'"{a} {b}"'
            if phrase not in terms:
                terms.append(phrase)
    for w in words:
        single = f'"{w}"'
        if w not in _STOPWORDS and single not in terms:
            terms.append(single)
    if not terms:
        return None
    return "text:(" + " OR ".join(terms[:24]) + ")"


def retrieve_context(symbol: str, query: str, k: int = 3) -> list[dict]:
    """
    Top-k most relevant indexed chunks for this ticker (BM25), diversified
    by section: Risk Factors "summary" paragraphs are topic-dense and match
    almost any query, crowding out the quantitative MD&A discussion — so
    retrieval casts a wider net, caps each section at 2 chunks, and
    guarantees at least one MD&A chunk when one is available.
    """
    if _DISABLED:
        return []
    match = _fts_query(query)
    if not match:
        return []
    try:
        with _connect() as conn:
            _ensure_schema(conn)
            rows = conn.execute(
                """SELECT ticker, form, section, date, text,
                          bm25(filing_chunks) AS score
                   FROM filing_chunks
                   WHERE filing_chunks MATCH ? AND ticker = ?
                   ORDER BY score LIMIT ?""",
                (match, symbol.strip().upper(), max(k * 4, 12)),
            ).fetchall()
    except Exception:
        return []
    candidates = [dict(r) for r in rows]

    selected: list[dict] = []
    per_section: dict[str, int] = {}
    for c in candidates:
        section = c.get("section", "")
        if per_section.get(section, 0) >= 2:
            continue
        selected.append(c)
        per_section[section] = per_section.get(section, 0) + 1
        if len(selected) >= k:
            break

    # MD&A carries the quantitative discussion (actual revenue/margin
    # figures) — if it exists in the candidates, make sure it's represented.
    if selected and not any(c.get("section") == "mda" for c in selected):
        mda = next((c for c in candidates if c.get("section") == "mda"), None)
        if mda:
            selected[-1] = mda

    return selected


def _section_label(section: str) -> str:
    return "Risk Factors" if section == "risk_factors" else "MD&A"


def build_filing_context_with_sources(symbol: str, query: str | None = None) -> tuple[str, list[dict]]:
    """
    Grounding block for the analysis prompt: labeled excerpts from the
    ticker's most recent 10-K/10-Q, plus a deduplicated source list
    ({form, date, section}) suitable for showing users what a verdict was
    grounded in.

    Non-blocking: a ticker that isn't indexed yet returns ("", []) and gets
    indexed in the background — its first analysis is ungrounded but fast,
    the next one is grounded.
    """
    if not is_indexed(symbol):
        ensure_indexed_async(symbol)
        return "", []
    q = query or f"{symbol} business risks, recent performance, and outlook"
    chunks = retrieve_context(symbol, q, k=3)
    if not chunks:
        return "", []
    lines = ["Recent SEC filing excerpts (context — not exhaustive):"]
    sources: list[dict] = []
    for c in chunks:
        label = _section_label(c["section"])
        lines.append(f"- [{c['form']} filed {c['date']}, {label}] {c['text']}")
        src = {"form": c["form"], "date": c["date"], "section": label}
        if src not in sources:
            sources.append(src)
    return "\n".join(lines), sources


def build_filing_context(symbol: str, query: str | None = None) -> str:
    return build_filing_context_with_sources(symbol, query)[0]


def build_chat_filing_context(tickers: list[str], query: str,
                              per_ticker_k: int = 2, max_chars: int = 700) -> str:
    """
    Non-blocking grounding for chat: uses only ALREADY-indexed tickers so a
    cold ticker never stalls the reply — it's indexed in the background for
    the next message instead. Chunks are truncated (chat replies are short;
    full 400-word excerpts would balloon the prompt for little gain).
    The user's own message is the retrieval query.
    """
    if _DISABLED:
        return ""
    blocks: list[str] = []
    for sym in [t.strip().upper() for t in tickers][:2]:
        if not is_indexed(sym):
            ensure_indexed_async(sym)
            continue
        chunks = retrieve_context(sym, query, k=per_ticker_k)
        if not chunks:
            continue
        lines = [f"{sym} — excerpts from recent SEC filings:"]
        for c in chunks:
            text = c["text"][:max_chars] + ("..." if len(c["text"]) > max_chars else "")
            lines.append(f"- [{c['form']} filed {c['date']}, {_section_label(c['section'])}] {text}")
        blocks.append("\n".join(lines))
    return ("\n\n" + "\n\n".join(blocks)) if blocks else ""
