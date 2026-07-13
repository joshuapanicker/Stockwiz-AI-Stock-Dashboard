# Stockbrook Landing Redesign — Design Plan

*Plan only. No code changes until approved. Built against the frontend-design
skill methodology: ground every choice in the subject matter, spend boldness
in one place, critique before building.*

---

## 1. The Concept: "Signal from Noise"

The most characteristic thing in Stockbrook's world is not a chart or a
dashboard screenshot — it's **the moment 5,700 flickering tickers collapse
into one clear verdict**. That's literally what the product does: universe →
criteria engine → Claude reasoning → BUY/SELL, streamed token by token.

The entire landing page is that pipeline, told once, cinematically, with
**real data** — because unlike every competitor, Stockbrook's backend can
actually feed its own landing page (`/api/market`, universe signals, the
public AI Track Record). No mockups. The page IS the product running.

**The narrative arc of the page: NOISE → FILTER → REASONING → VERDICT → PROOF.**

---

## 2. Signature Element (the one bold risk)

### The Live Ticker Field hero
A full-viewport canvas of hundreds of dim ticker cells (symbol + price +
change) flickering like a trading floor — the *noise*. Then, on load:

1. A spotlight lens sweeps the field (follows cursor on desktop).
2. Cells under the lens get **stamped** in real time: `PASS` (green) /
   `FAIL` (red) — the criteria engine visualized.
3. One cell ignites, expands into a glass verdict card, and **Claude's
   reasoning types itself out token-by-token** (violet caret — the app's
   actual SSE streaming aesthetic), ending with a stamped verdict:
   `BUY — 6/7 rules met`.
4. The card cycles to a new ticker every ~8s. Prices in the field are real
   (seeded from the public universe endpoint at build/load; graceful static
   fallback).

This is the only place the page goes maximal. Everything after is
disciplined so the hero stays the memory.

**Headline over the field:**
> **5,700 stocks. One verdict.**
> Live market data, your rules, and Claude reasoning over every position —
> in plain English, as it streams.

(Kills "Screen smarter. Invest better. Act with clarity." — three generic
imperatives any fintech could ship.)

---

## 3. Motion System — choreographed, not decorated

One master principle: **motion always depicts the pipeline** (data flowing,
rules stamping, text streaming). Never motion for motion's sake.

| Moment | Animation | Mechanism |
|---|---|---|
| Hero ticker field | Per-cell price flicker, cursor spotlight, PASS/FAIL stamps | `<canvas>` (GPU-cheap at hundreds of cells), rAF loop, pauses off-screen |
| Claude verdict card | Token-by-token type-on with violet caret; verdict stamps with a 1.04→1.0 scale "thunk" | CSS transform/opacity + JS text scheduler |
| Scroll: "The Pipeline" section | Scroll-scrubbed sequence (see §6.3): universe grid → rows collapse → checklist stamps → reasoning streams → verdict | Sticky container + scroll progress mapped to timeline (upgrade of the existing `ScrollFeatureShowcase` scaffold — keep its architecture, replace its content) |
| Numbers everywhere | Odometer-style roll (existing `Counter`, upgraded with ease-out and mono digits) | rAF |
| Track Record rows | Slide in ledger-style, one rule line at a time; returns count up; green/red settle | IntersectionObserver + stagger |
| CTA buttons | Magnetic pull within 60px radius + spring release | transform only |
| Section transitions | Content "collapses into data" — outgoing section's elements briefly become ticker cells that flow into the next section's rail | shared canvas layer, opacity handoff |
| Ambient | Subtle scanline drift across glass panels (2% opacity) instead of floating orbs | CSS animation |

**Guardrails (non-negotiable):**
- Animate `transform`/`opacity` only; canvas for anything with >20 moving nodes.
- Every rAF loop pauses via IntersectionObserver when off-screen.
- Full `prefers-reduced-motion` path: static hero with one pre-rendered
  verdict card, no scroll scrubbing (sections become plain stacked blocks),
  counters render final values.
- Mobile: ticker field drops to ~60 cells, no cursor lens (auto-sweep), scroll
  sections fall back to swipe cards.
- LCP budget: headline + CTA render before canvas hydrates (canvas is
  progressive enhancement over a static gradient).
- Dependencies: framer-motion (already ecosystem-standard, MIT) + native
  canvas. No GSAP, no lottie, no three.js — nothing heavier is justified.

---

## 4. Typography — two voices

The subject has exactly two voices, so the type system encodes them:

| Voice | Face | Used for |
|---|---|---|
| **The market (machine)** | IBM Plex Mono | Every number, ticker, price, stat, PASS/FAIL stamp, table. Tabular figures always. |
| **The judgment (human/AI)** | Instrument Serif — *italic* for Claude's words | Display headlines and any sentence that represents reasoning/verdicts |
| UI connective tissue | Inter (already in app) | Body, buttons, nav, captions |

Rule: **if it's data, it's mono; if it's judgment, it's serif; violet =
Claude speaking.** This one rule makes the page instantly recognizable and
matches the Pulse direction (violet = AI) already established on iOS.

Scale: display clamp(3.5rem→6.5rem) with tight leading; oversized ledger
numerals (§6) at 8rem+, 8% opacity, mono.

---

## 5. Color Tokens (deep-space glass, sharpened)

```
--bg:          #06080D   (deeper than current #0B0D12 — more contrast headroom)
--surface:     rgba(255,255,255,0.03) + 1px rgba(255,255,255,0.07) border (glass)
--signal:      #2EE6A8   (pulse green — ONLY means pass/up/go)
--danger:      #FF5C5C   (ONLY means fail/down)
--claude:      #8B5CF6   (violet — ONLY marks AI reasoning moments)
--watch:       #FFAC26   (amber — watchlist/neutral states)
--ink:         #F2F5F9 / --ink-dim: rgba(242,245,249,0.55)
```

Discipline rule: green and red are **semantic, never decorative**. The
current page uses green as a brand wash everywhere; the redesign reserves it
for meaning, which makes every green stamp feel earned. Violet appears only
when Claude is "speaking" — so users learn the association before they ever
open the app (same trick the iOS Pulse design uses).

---

## 6. Section-by-Section Blueprint

### 6.1 Nav
Minimal glass bar. Logo, three anchors, one CTA. A **live SPY/VIX micro-ticker**
(mono, real data from `/api/market`) sits center-nav — the first hint that
this page is alive. Keep current auth-scroll behavior.

### 6.2 Hero
The Ticker Field (§2). Below the fold line: proof strip replacing the current
generic stats card —

```
5,700+ listings scanned  ·  200K free AI tokens/mo  ·  every verdict graded at 30/90/180d
```

All three are true and mono-typeset. (Kills "4 strategy presets / 6 chart
types" — inventory, not proof.)

### 6.3 The Pipeline (scroll-scrubbed, replaces ScrollFeatureShowcase content)
Sticky viewport, scroll progress scrubs a 4-act timeline. Reuses the existing
sticky/progress architecture (already built and working) with new acts:

- **Act 1 — Noise:** dense universe grid, mono, flickering.
- **Act 2 — Filter:** user's criteria appear as a checklist; grid rows
  visibly dim/collapse as rules stamp PASS/FAIL. `5,700 → 23`.
- **Act 3 — Reasoning:** one stock expands; real filing/news lines slide in
  as citation chips; Claude's analysis streams in serif italic, violet caret.
- **Act 4 — Verdict:** `BUY — 6/7 rules met` stamps; card flips to show the
  Track Record hook: *"and we remember every call we make."*

Left rail keeps the current progress dots + labels (they work); the acts get
oversized ledger numerals `01 02 03 04` in background mono.

### 6.4 Track Record — "We grade our own calls" (NEW, the trust section)
No competitor shows this. Pull the real public scoreboard (`/api/track-record`):
recent verdicts with actual 30/90/180-day returns vs SPY, wins green, losses
red, **losses shown honestly** — honesty is the flex. Ledger table styling,
rows animate in like journal entries. One serif pull-quote:
*"Every verdict is logged with the price at that moment. Then reality grades it."*

### 6.5 Instruments (features grid, restrained)
Six cards, current content mostly fine, restyled: glass, mono ticker-chip
icons instead of generic lucide-in-a-box, hover = the card's metric does a
tiny live flicker. No entrance animation beyond a single stagger — the page
has already spent its boldness.

### 6.6 Pricing
Keep structure. Free card gets the mono proof treatment (`$0 — 200K tokens/mo,
bring your own key for unlimited`). Pro stays "coming soon" with violet chip.

### 6.7 CTA + Auth
Keep the working AuthForm untouched functionally; restyle wrapper: the ticker
field returns behind the form at 10% intensity — the noise you're about to
tame. Headline (serif): *"The market never stops talking. Hear what matters."*

### 6.8 Footer
Current footer is fine; add the live SPY micro-ticker again (bookend).

---

## 7. Copy Voice

Rules: active, specific, numbers over adjectives, zero filler.

| Current | Redesign |
|---|---|
| "AI-Powered Stock Intelligence" (badge) | `LIVE · reading 5,700 tickers` (mono badge, pulsing dot) |
| "Screen smarter. Invest better. Act with clarity." | **"5,700 stocks. One verdict."** |
| "Join other Investors on Stockbrook" | "Every call graded in public — see the track record ↓" |
| "See it in action" | "How a verdict gets made" |
| "Ready to invest smarter?" | "The market never stops talking. Hear what matters." |

---

## 8. Self-Critique (per the skill: is this plan specific to THIS product?)

- ✅ The ticker-field hero is only possible because Stockbrook *has* a live
  universe API — a template couldn't ship it. Risk justified by subject.
- ✅ Two-voice typography encodes the product's actual duality (data vs
  reasoning) — not an aesthetic imported from Dribbble.
- ✅ The Track Record section is a real structural differentiator, not decor.
- ✅ Violet-as-Claude matches the established Pulse identity (iOS) → this
  page starts unifying the brand instead of forking it.
- ⚠️ Biggest failure mode: hero becomes a laggy gimmick. Mitigation: canvas +
  strict budgets + static LCP fallback (§3 guardrails).
- ⚠️ Second failure mode: over-animation everywhere else dilutes the hero.
  Mitigation: sections 6.4–6.8 are deliberately quiet.

---

## 9. Build Order (when approved — est. 3 sessions)

1. Tokens + type system + nav/hero static layer (LCP-safe).
2. Canvas ticker field + verdict card typewriter.
3. Pipeline scroll acts (retrofit ScrollFeatureShowcase).
4. Track Record section wired to real API.
5. Restyle instruments/pricing/CTA/footer + reduced-motion & mobile passes.
6. Lighthouse + reduced-motion + mobile QA, then ship behind one commit.
