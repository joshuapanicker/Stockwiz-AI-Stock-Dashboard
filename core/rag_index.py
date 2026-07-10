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


def index_ticker(symbol: str) -> int:
    """Fetch, chunk, and embed this ticker's latest filing sections.
    Returns the number of chunks indexed."""
    symbol = symbol.strip().upper()
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


def ensure_indexed(symbol: str) -> None:
    """Lazily (re-)index a ticker if it's never been indexed or is stale.
    Runs synchronously — the first analysis of a new ticker pays this cost
    once (SEC fetch + embedding), then it's skipped for REINDEX_TTL."""
    symbol = symbol.strip().upper()
    state = _load_state()
    last = state.get(symbol)
    if last and (time.time() - last) < REINDEX_TTL:
        return
    try:
        index_ticker(symbol)
    except Exception:
        pass  # grounding is a bonus, not a hard requirement — never break analysis over it


def retrieve_context(symbol: str, query: str, k: int = 3) -> list[dict]:
    """Top-k most relevant indexed chunks for this ticker."""
    try:
        collection = _get_collection()
        embedder = _get_embedder()
        results = collection.query(
            query_embeddings=[embedder.encode(query).tolist()],
            n_results=k,
            where={"ticker": symbol.strip().upper()},
        )
    except Exception:
        return []
    docs = (results.get("documents") or [[]])[0]
    metas = (results.get("metadatas") or [[]])[0]
    return [{"text": d, **m} for d, m in zip(docs, metas)]


def build_filing_context(symbol: str, query: str | None = None) -> str:
    """
    Grounding block for the analysis prompt: labeled excerpts from the
    ticker's most recent 10-K/10-Q, or "" if nothing is indexed/available.
    Labeled with source + date so both the model and anyone auditing a
    verdict can see exactly what it was grounded in.
    """
    ensure_indexed(symbol)
    q = query or f"{symbol} business risks, recent performance, and outlook"
    chunks = retrieve_context(symbol, q, k=3)
    if not chunks:
        return ""
    lines = ["Recent SEC filing excerpts (context — not exhaustive):"]
    for c in chunks:
        label = "Risk Factors" if c["section"] == "risk_factors" else "MD&A"
        lines.append(f"- [{c['form']} filed {c['date']}, {label}] {c['text']}")
    return "\n".join(lines)
