"""
RAG index for stock analysis — embeds SEC filing excerpts (Risk Factors,
MD&A) per ticker into a local vector store, so analyze_stock() can ground
its reasoning in real, current qualitative context instead of just
numeric fundamentals.

Uses a small CPU-friendly embedding model (no GPU required) and a local
persistent Chroma store — no external service, no per-query cost.

Performance contract (learned the hard way on Railway's small shared CPU):
  - NOTHING here may block a user-facing request. Indexing (SEC fetch +
    embedding) always happens on a background thread; request paths only
    read an already-built index or return empty context.
  - Only ONE indexing job runs at a time (_index_gate) so background
    embedding can't peg the whole container and starve API requests.
  - RAG_DISABLED=1 is a kill switch: skips the heavy imports entirely and
    every entry point returns empty — instant rollback to pre-RAG behavior.
"""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

# On hosted deploys, point RAG_DB_PATH at a persistent volume so the index
# survives redeploys — same convention as UNIVERSE_DB_PATH.
DB_PATH = Path(os.getenv("RAG_DB_PATH") or (Path(__file__).parent.parent / "data" / "rag_chroma"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# Lives NEXT TO the index (i.e. on the same persistent volume in prod) —
# if this tracked the repo dir instead, every deploy would wipe the
# "what's indexed" bookkeeping and force re-indexing everything.
_STATE_FILE = DB_PATH.parent / "rag_index_state.json"

# Persist the HuggingFace model cache next to the index too, so the ~130MB
# embedding model isn't re-downloaded on every deploy. Must be set before
# sentence_transformers is imported.
os.environ.setdefault("HF_HOME", str(DB_PATH.parent / "hf_cache"))
# Chroma phones telemetry home by default — no thanks.
os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")

_DISABLED = os.getenv("RAG_DISABLED") == "1"

if not _DISABLED:
    import chromadb
    from sentence_transformers import SentenceTransformer

    from core.filings import fetch_filing_sections

# Filings update quarterly — no need to re-fetch/re-embed more often than this.
REINDEX_TTL = 25 * 86_400

# Bound the embedding cost per filing section. Risk Factors sections can run
# 60k+ chars (~40 chunks); the tail chunks add little retrieval value but a
# lot of CPU time on a small host.
MAX_CHUNKS_PER_SECTION = int(os.getenv("RAG_MAX_CHUNKS_PER_SECTION", "20"))

_embedder = None
_client = None
_collection = None
_embedder_lock = threading.Lock()


def _get_embedder():
    global _embedder
    with _embedder_lock:
        if _embedder is None:
            # Keep torch from spawning a thread per visible core — on a small
            # shared host that thrashes and starves concurrent API requests.
            try:
                import torch
                torch.set_num_threads(max(1, min(4, (os.cpu_count() or 2) // 2)))
            except Exception:
                pass
            _embedder = SentenceTransformer("BAAI/bge-small-en-v1.5")
        return _embedder


def preload_embedder() -> None:
    """Load the embedding model off the request path (server startup).
    First call after a fresh volume also downloads it to the HF cache."""
    if _DISABLED:
        return
    try:
        _get_embedder()
    except Exception:
        pass


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

# Serialize indexing globally: one embed job at a time. Background threads
# for other tickers simply wait their turn instead of collectively pegging
# the CPU while user requests are in flight.
_index_gate = threading.Semaphore(1)


def index_ticker(symbol: str) -> int:
    """Fetch, chunk, and embed this ticker's latest filing sections.
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
            chunks = _chunk_text(sec["text"])[:MAX_CHUNKS_PER_SECTION]
            if not chunks:
                continue
            # One batched encode per section — dramatically faster than
            # embedding chunk-by-chunk.
            embeddings = embedder.encode(chunks, batch_size=16,
                                         show_progress_bar=False).tolist()
            collection.add(
                embeddings=embeddings,
                documents=chunks,
                metadatas=[{
                    "ticker": symbol, "form": sec["form"],
                    "section": sec["section"], "date": sec["date"],
                } for _ in chunks],
                ids=[f"{symbol}-{sec['form']}-{sec['section']}-{i}"
                     for i in range(len(chunks))],
            )
            count += len(chunks)

    state = _load_state()
    state[symbol] = time.time()
    _save_state(state)
    return count


def is_indexed(symbol: str) -> bool:
    """True if this ticker has a reasonably fresh index."""
    if _DISABLED:
        return False
    last = _load_state().get(symbol.strip().upper())
    return bool(last and (time.time() - last) < REINDEX_TTL)


def ensure_indexed(symbol: str) -> None:
    """(Re-)index a ticker if it's never been indexed or is stale.
    Blocking — only call from background threads, never a request path."""
    if _DISABLED or is_indexed(symbol):
        return
    try:
        index_ticker(symbol.strip().upper())
    except Exception:
        pass  # grounding is a bonus, not a hard requirement — never break analysis over it


def ensure_indexed_async(symbol: str) -> None:
    """Fire-and-forget indexing: a cold ticker gets indexed in the
    background so the NEXT analysis/chat about it is grounded, instead of
    stalling the current one for seconds of SEC fetching + embedding."""
    if _DISABLED or is_indexed(symbol):
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
    if _DISABLED:
        return []
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
    grounded in.

    Non-blocking: a ticker that isn't indexed yet returns ("", []) and gets
    indexed in the background — its first analysis is ungrounded but fast,
    the next one is grounded. (Blocking here used to hang analyses for the
    full SEC-fetch-and-embed duration on small hosts.)
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
    The user's own message is the retrieval query — free-text embeds well.
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
