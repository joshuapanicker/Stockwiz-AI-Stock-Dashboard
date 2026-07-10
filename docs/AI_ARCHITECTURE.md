# StockWiz AI Architecture — Implementation & Design Decisions

Personal reference doc: what was built, why it was built that way, and the
tradeoffs behind each decision. Written for later recall (interviews,
design discussions, future iterations).

---

## 1. The big picture

StockWiz has three AI surfaces, all currently powered by Claude Haiku
(`claude-haiku-4-5`):

1. **Stock verdicts** (`core/analysis.py`) — given live fundamentals + a
   rule-based criteria evaluation, produce a structured buy/sell decision
   (Decision, Summary, Reasoning bullets) that references only provided data.
2. **Market Assistant chat** (`core/general_chat.py`) — free-form market Q&A
   with live SPY/VIX context and per-ticker data injected when tickers are
   detected in the message.
3. **Universe search agent** (`core/universe_agent.py`) — natural language →
   structured SQL filters over a local stock universe, plus a streamed
   summary of results.

The long-term goal is to reduce dependence on the Claude API with a
self-trained model. The strategy has two legs, deliberately sequenced:

- **RAG first** (done): ground the AI in real, current documents. Fixes the
  actual credibility gap (hallucinated/stale specifics), and — critically —
  means the training data collected later already contains grounded prompts.
- **Fine-tuning second** (data collection live, training pending): QLoRA
  fine-tune of an open 7-8B model (Qwen2.5-7B-Instruct or Llama-3.1-8B) on
  distilled (prompt, output) pairs, trained locally on a 12GB-VRAM consumer
  GPU using Unsloth.

Why this order matters: if you fine-tune first and add RAG later, your
training set taught the model to answer from *ungrounded* prompts — you'd
have to throw the dataset away and re-collect. RAG-first means every logged
example teaches "reason over retrieved context," which is the behavior the
final system needs.

---

## 2. RAG pipeline

### 2.1 Source: SEC EDGAR filings (`core/filings.py`)

**Decision: start with 10-K/10-Q Risk Factors + MD&A only.**
- Free, no API key, canonical (the company's own words, legally binding).
- Risk Factors = the qualitative risk picture; MD&A = management's own
  explanation of the quantitative results. Together they cover what the
  numeric screener metrics can't express.
- Deliberately narrow: no news feeds, no transcripts at first. Start with
  the highest-signal, zero-cost source; add breadth later.

**Notable engineering problems actually hit (good interview stories):**

1. **HTML entity decoding bug.** SEC's iXBRL-tagged filings left numeric
   entities (`&#160;`, `&#8217;`) as literal text after tag-stripping, which
   silently broke regex adjacency between "Item 1A" and "Risk Factors."
   Nothing errored — extraction just returned nothing. Fix: double
   `html.unescape()` after `lxml` text extraction. Lesson: silent
   data-quality failures in ingestion look identical to "no data exists."

2. **Table-of-contents vs. real section.** "Item 1A. Risk Factors" appears
   multiple times per filing (TOC, cross-references, actual section). First
   attempt ("take the last match") failed. Second attempt ("largest gap to
   the next Item heading") also failed on real documents. Working heuristic:
   **density** — a TOC crams several "Item N" headings into a small window
   (only page numbers between them), while a real section body has at most
   an occasional cross-reference nearby. Pick the candidate with the fewest
   neighboring Item headings. Lesson: test extraction against real documents
   early; the first two "obvious" heuristics both failed on Apple's actual
   10-K.

3. **SEC fair-access compliance.** Descriptive User-Agent required
   (`SEC_EDGAR_CONTACT` env var), plus a global request throttle (~0.15s
   min interval, well under SEC's ~10 req/s limit) shared across threads.

### 2.2 Chunking (`core/rag_index.py`)

~400 words per chunk with 50-word overlap (sliding window on words, not
tokens — approximates the 300-500 token target without needing the target
model's tokenizer). The overlap prevents a fact from being cut in half at a
chunk boundary and lost to retrieval.

### 2.3 Embeddings

**Decision: `BAAI/bge-small-en-v1.5` via sentence-transformers, on CPU.**
- Small enough to run on the API server with no GPU — embedding a filing's
  ~50 chunks takes seconds, queries are single-embed.
- Deployment note: `requirements.txt` pins the **CPU-only PyTorch wheel**
  via `--extra-index-url https://download.pytorch.org/whl/cpu` — otherwise
  pip pulls the multi-GB CUDA build onto Railway for nothing.

### 2.4 Vector store

**Decision: Chroma, local + persistent — not a hosted vector DB.**
- Zero external service, zero per-query cost, one `pip install`.
- Fits the app's existing pattern (SQLite universe cache on a persistent
  volume); `RAG_DB_PATH` env var mirrors the `UNIVERSE_DB_PATH` convention.
- At this scale (dozens-to-hundreds of tickers × ~50 chunks each), a
  dedicated vector database service would be pure overhead.
- Metadata on every chunk: `{ticker, form, section, date}` — this is what
  enables both per-ticker filtering (`where={"ticker": ...}` so TSLA chunks
  can never leak into an AAPL analysis) and source attribution in the UI.

### 2.5 Indexing strategy

**Decision: lazy per-ticker indexing with a 25-day TTL — not batch
pre-indexing of the full universe.**
- First analysis of a ticker pays a one-time cost (SEC fetch + embed),
  cached for 25 days (filings update quarterly; 25 days keeps a freshly
  filed 10-Q from waiting a full cycle).
- Rejected alternative: a background pre-indexer over all ~5,700 universe
  tickers (mirroring the metrics fetcher). ~40+ min of throttled SEC
  fetches plus hours of CPU embedding, mostly for micro-caps nobody ever
  analyzes. Usage concentrates on well-known names; lazy = pay only for
  what's used.
- Concurrency guard: an in-flight set around `index_ticker()` prevents an
  analysis and a chat message about the same ticker from double-indexing
  (duplicate chunk IDs would make Chroma's `add()` raise mid-index).

### 2.6 Failure philosophy: fail open, always

Grounding is a bonus, never a requirement. Every RAG entry point swallows
its own exceptions and returns empty context: DNS hiccup, SEC outage,
missing dependency, unindexed ticker — the analysis/chat proceeds exactly
as it did pre-RAG. The heavy imports (sentence-transformers, chromadb) are
lazy so even a broken install can't take down `core.analysis` importers.
Same philosophy as the MX-record email check (fail open on DNS timeouts)
and the distillation logger (never raises).

---

## 3. Criteria-driven retrieval (the interesting part)

### 3.1 The problem with the naive version

V1 used one static query for every analysis: *"business risks, recent
performance, and outlook."* A sell verdict triggered by collapsing revenue
retrieved the same excerpts as a buy analysis blocked on margins.

### 3.2 Deriving the query from the decision

The retrieval query is now built from the rules the decision actually
hinges on:
- **Sell analysis** → the *triggered* rules (those are the concerns).
- **Buy analysis** → the *failing* rules (those block the thesis).

### 3.3 Two retrieval-quality problems found by testing (not theory)

1. **Vocabulary mismatch.** Embedding raw screener language ("Forward PE
   under 25") retrieved garbage — filings never say "PE." Fix: a
   field→topic translation map into filing-domain language
   (`forward_pe` → "expected earnings, guidance, and profitability
   outlook"; `profit_margin` → "gross margin, cost pressures, and
   pricing"). This required adding each rule's `field` to the criteria
   evaluation output. Lesson: embedding similarity only works when both
   sides speak roughly the same dialect.

2. **Hub chunks.** Risk Factors sections contain topic-dense "summary"
   paragraphs (semicolon lists naming ten risk categories) that sit close
   to *every* query in embedding space, crowding the genuinely relevant
   quantitative MD&A content out of the top-k. Fix: cast a 4× wider net,
   cap each section at 2 chunks, and guarantee at least one MD&A chunk
   when available. Verified: a margin-driven query then surfaced Apple's
   actual gross-margin table; a revenue-driven one surfaced the
   iPhone/Services net-sales discussion. (This is a lightweight version of
   what rerankers/MMR solve; a cross-encoder rerank is the known upgrade
   path if bad retrievals show up in practice.)

### 3.4 Pipeline reordering: warm vs. retrieve

The retrieval query depends on criteria results, but criteria depend on
metrics — while the slow half of RAG (SEC fetch + embedding) doesn't depend
on anything. So the parallel prefetch block only **warms the index**
(`ensure_indexed`), and the actual **retrieval** runs after criteria
evaluation, when the query can be specific. Warm-up runs concurrently with
metrics/news fetches; the post-criteria lookup is a single query embed +
local vector search (fast). Latency cost of task-specific retrieval: ~zero.

---

## 4. Chat grounding: the latency constraint changes the design

Chat is stream-based — the user watches for the first token. A cold ticker
would stall the reply for seconds of SEC fetching + embedding. So chat
grounding is **non-blocking by design**:

- Already-indexed ticker → retrieve and inject excerpts.
- Cold ticker → return no context *this* turn, fire a background indexing
  thread, and the *next* message about it is grounded. (Measured: cold
  path returns in ~0ms.)

Other chat-specific choices:
- **The user's message is the retrieval query.** Free-form questions
  ("how are their margins holding up?") embed well — no synthesized query
  needed, unlike verdicts where the "query" had to be derived from
  criteria.
- **Chunks truncated to ~700 chars** — chat replies are capped at ~150-200
  words; full 400-word excerpts would balloon prompt tokens for little
  gain. Verdict prompts use full chunks.
- Both chat system prompts instruct the model to **cite the filing** when
  drawing on an excerpt.

---

## 5. Attribution as a product feature

Every retrieved chunk carries its provenance into the prompt
(`[10-Q filed 2026-05-01, MD&A] ...`), and the analyze API returns a
deduplicated `grounding_sources` list that the UI renders as chips under
the AI verdict ("Grounded in: 10-Q · MD&A · 2026-05-01").

Why this matters beyond accuracy: it converts invisible infrastructure
into visible trust. A user (or interviewer) can see that a verdict was
informed by *specific, checkable documents* — the concrete differentiator
between "thin ChatGPT wrapper" and a grounded system. It also makes bad
retrievals auditable during development.

---

## 6. Distillation logging (`core/distill_log.py`)

Every fresh (non-cached) verdict call appends one JSONL record: the exact
system prompt, the full user prompt (fundamentals + criteria + news + RAG
context), and Claude's output, plus metadata (symbol, action, gain_pct,
model, timestamp).

Design choices:
- **Chat-messages format** (`[{role: system}, {role: user}, {role:
  assistant}]`) — the shape Unsloth/TRL consume directly, so the log file
  *is* the training dataset, no conversion step.
- **This is knowledge distillation**: training a small model to imitate a
  stronger model's outputs on one narrow task, using data generated as a
  free by-product of normal app usage — sidesteps the usual hardest
  problem (dataset curation).
- Cached responses aren't logged (no duplicates); empty outputs skipped;
  thread-safe append; never raises; `DISTILL_LOG_DISABLED=1` to opt out.
- **Ops gotcha**: on Railway the disk is ephemeral — `DISTILL_LOG_PATH`
  must point at the persistent volume or the dataset is wiped per deploy.

---

## 7. The fine-tuning plan (next phase, not yet executed)

- **Task-specific, not general**: the fine-tune targets the verdict task
  only. A generalist frontier model spreads capacity across everything; a
  small model fine-tuned on thousands of examples of exactly one
  format/task can plausibly match it *on that task* — the well-established
  "specialist beats generalist on its own benchmark" pattern. No claim of
  beating Haiku in general.
- **Method: QLoRA** (4-bit quantized base + low-rank adapters) — fits an
  8B model comfortably in 12GB VRAM (RTX 5070). Full fine-tuning needs
  80GB+ class hardware; pretraining from scratch was ruled out entirely
  (eight-figure compute).
- **Stack**: WSL2 + Ubuntu (bitsandbytes/flash-attention are Linux-first),
  Unsloth as the training framework (memory-efficient single-GPU QLoRA,
  beginner-friendly), base model Qwen2.5-7B-Instruct or
  Llama-3.1-8B-Instruct, LoRA rank 16-32 to start.
- **Evaluation**: hold out ~10% of logged examples; compare fine-tuned
  outputs side-by-side against Claude's real outputs for the same inputs —
  judging reasoning quality and format discipline, not string equality.
- **Rollout intent**: run the fine-tuned model alongside Claude and route
  by measured quality (the app's AI track-record logging provides the
  measurement), rather than a hard cutover.

---

## 8. Related supporting systems (quick reference)

- **AI track record** (`core/track_record.py`): every buy/sell verdict is
  logged with price-at-call and later scored against real price history —
  a public, unfakeable report card. Forward-looking (no backtest/lookahead
  bias), zero-cost, accumulates credibility over time.
- **Criteria engine** (`core/criteria.py`): user-configurable rule sets
  evaluated deterministically; the AI narrates and contextualizes rule
  outcomes rather than inventing its own thresholds. Rule `field`s became
  the key for retrieval-query translation (§3.3).
- **Credit metering** (`core/credits.py`): per-user monthly token
  allowance on the shared key, bring-your-own-key opt-out — the cost
  -control system the fine-tuned model would eventually relieve.
- **Universe agent symbol filters** (`core/universe_agent.py`):
  deterministic ticker detection runs alongside LLM filter extraction so
  the LLM is never a single point of failure for "show me SMCI" — same
  defense-in-depth philosophy as RAG's fail-open behavior.

---

## 9. One-paragraph interview summary

> StockWiz's AI layer grounds a frontier LLM (Claude Haiku) in live SEC
> filings via a local RAG pipeline: EDGAR 10-K/10-Q sections are extracted
> (with density-based TOC-vs-body disambiguation), chunked with overlap,
> embedded on CPU (bge-small), and stored in a local Chroma index with
> per-ticker metadata. Retrieval is task-aware — the query is derived from
> whichever screening rules the decision hinges on, translated from
> screener vocabulary into filing-domain language — and diversity-selected
> so topic-dense "hub" chunks can't crowd out quantitative MD&A content.
> Grounding is non-blocking on latency-sensitive chat paths, fails open
> everywhere, and carries provenance end-to-end so the UI can show users
> exactly which filings informed each verdict. Every grounded (prompt,
> output) pair is logged in chat format as a free distillation dataset for
> a planned QLoRA fine-tune of a 7-8B open model — sequenced deliberately
> so the future specialist model learns to reason over retrieved context
> from day one.
