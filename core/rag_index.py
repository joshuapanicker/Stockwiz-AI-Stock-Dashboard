"""
RAG index for stock analysis — embeds SEC filing excerpts (Risk Factors,
MD&A) per ticker into a local vector store, so analyze_stock() can ground
its reasoning in real, current qualitative context instead of just
numeric fundamentals.

Uses a small CPU-friendly embedding model (no GPU required) and a local
persistent Chroma store — no external service, no per-query cost.
"""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

import chromadb
from sentence_transformers import SentenceTransformer

from core.filings import fetch_filing_sections

# On hosted deploys, point RAG_DB_PATH at a persistent volume so the index
# survives redeploys — same convention as UNIVERSE_DB_PATH.
DB_PATH = Path(os.getenv("RAG_DB_PATH") or (Path(__file__).parent.parent / "data" / "rag_chroma"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

_STATE_FILE = Path(__file__).parent.parent / "data" / "rag_index_state.json"

# Filings update quarterly — no need to re-fetch/re-embed more often than this.
REINDEX_TTL = 25 * 86_400

_embedder: SentenceTransformer | None = None
_client = None
_collection = None


def _get_embedder() -> SentenceTransformer:
    global _embedder
    if _embedder is None:
        _embedder = SentenceTransformer("BAAI/bge-small-en-v1.5")
    return _embedder


def _get_collection():
    global _client, _collection
    if _collection is None:
        _client = chromadb.PersistentClient(path=str(DB_PATH))
        _collection = _client.get_or_create_collection("filings")
    return _collection


def _chunk_text(text: str, words_per_chunk: int = 400, overlap: int = 50) -> list[str]:
    """Word-based sliding window — approximates ~300-500 token chunks
    without needing the target model's own tokenizer."""
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


# Guard against two callers indexing the same ticker simultaneously
# (e.g. an analysis and a chat message about the same stock) — duplicate
# chunk ids would make Chroma's add() raise mid-index.
_inflight: set[str] = set()
_inflight_lock = threading.Lock()


def index_ticker(symbol: str) -> int:
    """Fetch, chunk, and embed this ticker's latest filing sections.
    Returns the number of chunks indexed."""
    symbol = symbol.strip().upper()
    with _inflight_lock:
        if symbol in _inflight:
            return 0  # someone else is already indexing this ticker
        _inflight.add(symbol)
    try:
        return _index_ticker_inner(symbol)
    finally:
        with _inflight_lock:
            _inflight.discard(symbol)


def _index_ticker_inner(symbol: str) -> int:
    sections = fetch_filing_sections(symbol)

    collection = _get_collection()
    # Clear this ticker's old chunks first so stale excerpts from a
    # previous filing don't linger alongside the fresh ones.
    try:
        collection.delete(where={"ticker": symbol})
    except Exception:
        pass

    count = 0
    if sections:
        embedder = _get_embedder()
        for sec in sections:
            chunks = _chunk_text(sec["text"])
            for i, chunk in enumerate(chunks):
                embedding = embedder.encode(chunk).tolist()
                collection.add(
                    embeddings=[embedding],
                    documents=[chunk],
                    metadatas=[{
                        "ticker": symbol, "form": sec["form"],
                        "section": sec["section"], "date": sec["date"],
                    }],
                    ids=[f"{symbol}-{sec['form']}-{sec['section']}-{i}"],
                )
                count += 1

    state = _load_state()
    state[symbol] = time.time()
    _save_state(state)
    return count


def is_indexed(symbol: str) -> bool:
    """True if this ticker has a reasonably fresh index."""
    last = _load_state().get(symbol.strip().upper())
    return bool(last and (time.time() - last) < REINDEX_TTL)


def ensure_indexed(symbol: str) -> None:
    """Lazily (re-)index a ticker if it's never been indexed or is stale.
    Runs synchronously — the first analysis of a new ticker pays this cost
    once (SEC fetch + embedding), then it's skipped for REINDEX_TTL."""
    if is_indexed(symbol):
        return
    try:
        index_ticker(symbol.strip().upper())
    except Exception:
        pass  # grounding is a bonus, not a hard requirement — never break analysis over it


def ensure_indexed_async(symbol: str) -> None:
    """Fire-and-forget indexing for latency-sensitive callers (chat): a cold
    ticker gets indexed in the background so the NEXT message about it is
    grounded, instead of stalling the current reply for several seconds."""
    if is_indexed(symbol):
        return
    threading.Thread(target=ensure_indexed, args=(symbol,), daemon=True).start()


def retrieve_context(symbol: str, query: str, k: int = 3) -> list[dict]:
    """
    Top-k most relevant indexed chunks for this ticker, diversified by
    section. Risk Factors sections contain topic-dense "summary" paragraphs
    that sit close to almost ANY query in embedding space and would crowd
    out the quantitative MD&A discussion — so retrieval casts a wider net,
    caps each section at 2 chunks, and guarantees at least one MD&A chunk
    when one is available.
    """
    try:
        collection = _get_collection()
        embedder = _get_embedder()
        results = collection.query(
            query_embeddings=[embedder.encode(query).tolist()],
            n_results=max(k * 4, 12),
            where={"ticker": symbol.strip().upper()},
        )
    except Exception:
        return []
    docs = (results.get("documents") or [[]])[0]
    metas = (results.get("metadatas") or [[]])[0]
    candidates = [{"text": d, **m} for d, m in zip(docs, metas)]

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
    grounded in. Returns ("", []) if nothing is indexed/available.
    """
    ensure_indexed(symbol)
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
    The user's own message is the retrieval query — free-text embeds well.
    """
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
