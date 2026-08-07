# RAG Upgrade & Path to a Self-Hosted Model

Status snapshot as of 2026-08-05. Two independent tracks: **RAG quality**
(short, isolated, can start now) and **fine-tuning to replace the Claude
API** (longer, gated by data/eval quality — not by infra).

---

## Current state

**RAG (`core/rag_index.py`, `core/filings.py`)** — V2, live. SQLite FTS5
BM25 lexical search over SEC 10-K/10-Q Risk Factors + MD&A, ~40 chunks per
ticker. Zero extra dependencies, near-zero memory. V1 (sentence-transformers
+ Chroma dense embeddings) was ripped out after it OOM-crash-looped the
Railway container — see the RAG incident writeup. That container was
512MB; it's now **8GB** (confirmed via `railway metrics`, current usage
~850MB under load), so the memory constraint that forced the FTS5-only
decision no longer applies at the same severity.

**Fine-tuning** — v1 proof-of-concept succeeded end-to-end on Google Colab
(free T4): QLoRA on `Qwen2.5-7B-Instruct-bnb-4bit`, ~400 distilled examples,
clean output-format adherence and no hallucinated numbers on a sanity-test
prompt. Not production quality — dataset is large-cap-skewed and
repetitive (100 tickers × 4 near-identical scenarios). A diversified v2
backfill script (11 sectors, market-cap tiers, buy + 5 sell scenarios,
~990 calls/run) is written but hasn't been run/retrained yet.
`core/distill_log.py` currently only logs `analyze_stock()` verdicts —
chat is not distilled.

**Infra** — Railway backend (8GB RAM, 8 vCPU, 500MB volume — currently
49% used by `universe.db`), Vercel frontend, no GPU on Railway. Training
compute is Google Colab (free T4), not local (WSL2 attempt abandoned —
blocked on Windows activation, not revisited).

---

## Track A — RAG upgrade

Isolated from the fine-tuning track; can be done independently.

**Step 1 has now been run, and it closed steps 2-4.** Measured on
2026-08-06 across all 73 indexed tickers, against the 11 retrieval queries
the app actually issues (`_FIELD_TOPICS` in `core/analysis.py`):

| | |
|---|---|
| queries returning nothing | 0 of 803 |
| mean pairwise Jaccard between different queries | 0.08 |
| query pairs returning disjoint chunks | 73% |
| distinct rank-1 chunks per ticker across 11 queries | 8.4 of 11 |

BM25 discriminates. Asking about margins returns the MD&A "Gross Margin"
discussion; asking about macro conditions returns Risk Factors. **Do not
add dense embeddings** — there is no ranking gap for them to close, and
they would reintroduce the torch memory footprint that caused the V1
incident in exchange for nothing measurable.

What the same measurement *did* find was a coverage gap: 12 of 73 tickers
had two or fewer of the four possible form/section combinations indexed,
because `extract_section` was silently dropping sections. Retrieval can
only rank what was indexed, which is why this never showed up as a bad
answer — just a thinner one. Fixed in `core/filings.py` (73 tickers
re-extracted: 68 gained, 0 regressed, 4021 → 4530 chunks), with the
formatting variations covered offline in `tests/test_filings_extraction.py`.

**Re-index — done.** `scripts/reindex_filings.py` was run against the
production volume on 2026-08-06: **71 tickers gained, 55 unchanged, 9
slightly reduced, 0 failed; 7,005 → 8,049 chunks in 62s.** 104 of 135
tickers now have all four form/section combinations. Note that clearing
`rag_fts_state.json` would *not* have been enough on its own — indexing is
triggered by a ticker being analysed, and with no traffic nothing would
have triggered it. Re-run the script after any change to
`core/filings.py`.

Remaining, in priority order:

1. **Widen the corpus, not the retrieval algorithm.** This is where the
   remaining headroom is, and the extraction findings support it: quality
   is bounded by what's indexed, not by how it's ranked. Earnings-call
   transcripts or 8-Ks alongside the 10-K/10-Q sections.
2. **Watch the disk volume, not RAM.** 434MB usable, 46% used after the
   re-index (up from 42%), mostly `universe.db`. The FTS index is ~39MB.
   Still comfortable, but it is the constraint that binds now.
3. **Consider a labelled retrieval eval** if the corpus widens — the
   diagnostic above measures whether queries *discriminate*, not whether
   the top chunk is the *right* one. That distinction only starts to
   matter once there are more document types to choose between.
4. **A known extraction imperfection** is documented in
   `core/filings.py`: where a filer punctuates cross-references exactly as
   headings (American Water), a prose mention can outrank the real
   heading, yielding a superset of the section. The obvious fix measures
   worse. Revisit only with a discriminator that survives the head-to-head
   harness.

### How to validate a change to `core/filings.py`

Compare **both extractors over the same freshly-fetched filing**, for
every ticker in the production index — not the new extractor against rows
already stored. Those rows were written at another time from possibly
different filings, so a "gain" can be nothing but a newer filing and a
real loss can hide completely. That mistake let a bug reach production
that cut Albertsons' MD&A by two thirds.

## Track B — Fine-tuning toward replacing Claude

Follow the sequencing already agreed on — don't skip ahead to a bigger
backfill or serving before data quality and eval are in place.

1. **Run the v2 diversified backfill** (script already written) and
   retrain QLoRA v2 on Colab. Qualitative sanity-check same as v1
   (format adherence, no fabricated numbers).
2. **Extend distillation logging to chat** (`core/chat.py`,
   `core/general_chat.py`) — a model meant to replace Claude end-to-end
   needs training coverage of conversational behavior, not just
   `analyze_stock` verdicts.
3. **Build a quantitative eval harness.** Replace "looks sane" with a
   held-out test set scored automatically: required fields present,
   no numbers in the output that don't appear in the RAG context/metrics
   provided, verdict consistent with `rules_met`. This is what lets v2/v3/v4
   be compared objectively instead of by hand.
4. **Once enough calls have aged 30+ days**, implement the outcome-curation
   join already scoped (`(symbol, action, date)` across `distill_log.jsonl`
   and the `ai_calls` track-record table) — train preferentially on
   verdicts the market actually proved right.
5. **Decide the serving path** — a separate decision from training, and
   still gated by "never load heavy inference in-process with the API
   server." Options: (a) local Ollama on the RTX 5070 for personal/dev use
   only; (b) a small standalone GPU inference service (RunPod/Modal/Fly GPU)
   that the Railway backend calls over HTTP, same pattern as the RAG
   architectural principle; (c) revisit WSL2 for cheap local training +
   serving if Windows activation ever gets resolved.
6. **Define concrete cutover criteria** before ever serving the model to
   real users: e.g. win-rate/alpha parity with Claude-generated verdicts on
   the existing AI track-record ledger over a rolling window. Run the
   fine-tuned model in **shadow mode** first — log its output alongside
   Claude's without serving it — before any user-facing switch.
7. **Check cost/latency, not just quality**, as a gate. A self-hosted model
   only makes sense if GPU rental stays meaningfully below current Claude
   spend and inference latency doesn't degrade the UX — measure this before
   sinking more time into dataset expansion.

---

## Sequencing

Track A (RAG) is small and can happen anytime — it doesn't block or get
blocked by Track B. Track B (fine-tuning → serving) is the long pole and
should proceed in order: diversify data → retrain v2 → build real eval →
extend distillation to chat → outcome curation → serving decision →
shadow mode → cutover. Resist skipping straight to "bigger backfill" or
"deploy the model" before the eval harness and shadow-mode steps exist —
that was already the mistake avoided once with the v1 PoC.

## Guardrails carried over from prior incidents

- Heavy compute (embedding models, fine-tuned-model inference) never runs
  in-process with the API server — separate thread pool at minimum,
  separate service for anything GPU-bound.
- RAG and fine-tuning are complementary, not substitutes: a served
  fine-tuned model still receives the same RAG-grounded prompt Claude gets
  today.
- Don't re-attempt WSL2 on this machine without first checking whether
  Windows has since been activated.
