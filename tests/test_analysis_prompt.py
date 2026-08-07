"""Invariants of the analyze_stock prompt.

These are cheap, offline, and deterministic — no API calls. They exist
because the prompt is production behaviour that nothing else guards: a
one-line wording change silently altered verdicts on borderline stocks
(see the comment above `_build_prompt`), and the only reason it was caught
was a hand-rolled A/B that no longer exists. The live behavioural half of
that check lives in `tests/eval_analysis_live.py`, which costs money and is
opt-in; everything provable without the model belongs here.

    py -3 -m pytest tests/test_analysis_prompt.py
"""

from __future__ import annotations

import pytest

from core.analysis import _build_prompt, _build_retrieval_query, _parse_decision
from core.criteria import evaluate_criteria


def make_criteria(rules_met: int, rules_total: int = 5, min_required: int = 2,
                  passed: bool | None = None) -> dict:
    """A criteria_result shaped like evaluate_criteria's, with the first
    `rules_met` rules passing."""
    return {
        "passed": (rules_met >= min_required) if passed is None else passed,
        "rules_met": rules_met,
        "rules_total": rules_total,
        "min_required": min_required,
        "details": [
            {"id": f"rule_{i}", "field": "revenue_growth",
             "description": f"Rule {i}", "passed": i < rules_met}
            for i in range(rules_total)
        ],
    }


METRICS = {
    "symbol": "NVDA", "date": "2026-08-06", "close_price": 182.4,
    "low_52_week": 86.6, "high_52_week": 195.0, "trailing_pe": 52.1,
    "forward_pe": 31.4, "revenue_growth": 0.85, "earnings_growth": 2.14,
    "profit_margin": 0.63, "operating_margin": 0.58,
    "distance_to_low_pct": 1.106, "distance_to_high_pct": 0.065,
}
MARKET = {"market_trend": "bullish", "vix": 14.2}


def build(action="sell", **kw):
    criteria = kw.pop("criteria", make_criteria(2))
    return _build_prompt("NVDA", action, criteria, METRICS, MARKET, **kw)


# --- threshold status -------------------------------------------------------
# The defect this guards: at 2-of-5-need-2 the model read the low fraction as
# a failure and wrote "insufficient criteria met (2/5)", contradicting the
# checklist the UI renders beside the verdict.

def test_met_threshold_is_stated_as_met():
    prompt = build(criteria=make_criteria(2))
    assert "Criteria threshold MET" in prompt
    assert "NOT MET" not in prompt


def test_unmet_threshold_is_stated_as_not_met():
    prompt = build(criteria=make_criteria(1))
    assert "Criteria threshold NOT MET" in prompt


def test_raw_counts_survive_alongside_the_verdict():
    """The verdict must not replace the numbers — the model still needs to
    reason about how comfortably the threshold was cleared."""
    prompt = build(criteria=make_criteria(2))
    assert "2 of 5 rules passed" in prompt
    assert "2 required" in prompt


def test_footer_forbids_misdescribing_the_threshold():
    assert "never call the criteria insufficient or unmet" in build().lower()


def test_footer_does_not_editorialise_about_the_verdict():
    """A previous revision added "deciding against the action anyway is
    fine" to make clear the model kept its judgment. It read as an
    invitation instead: AAPL at 4-of-5-need-4 went from a stable YES to
    3 NO / 2 YES over five identical runs. The footer may constrain how the
    threshold is *described* and nothing about which verdict to reach.
    """
    footer = build().rsplit("Rules:", 1)[1].lower()
    for phrase in ("decide", "deciding", "anyway", "is fine", "free to"):
        assert phrase not in footer, f"footer editorialises: {phrase!r}"


@pytest.mark.parametrize("met,expected", [(0, "NOT MET"), (1, "NOT MET"),
                                          (2, "MET"), (5, "MET")])
def test_threshold_tracks_min_required(met, expected):
    prompt = build(criteria=make_criteria(met))
    assert f"Criteria threshold {expected}" in prompt


def test_engine_passed_flag_agrees_with_its_own_counts():
    """The UI shows the checklist; the prompt shows `passed`. If those two
    ever disagree the user sees a self-contradictory screen regardless of
    what the model says — so assert it against the real evaluator, not a
    fixture."""
    for action in ("buy", "sell"):
        for gain in (0.0, 0.5, 1.2):
            r = evaluate_criteria(action, METRICS, MARKET, gain_pct=gain)
            assert r["passed"] == (r["rules_met"] >= r["min_required"]), (
                f"{action} @gain={gain}: passed={r['passed']} but "
                f"{r['rules_met']}/{r['min_required']}")


# --- prompt contents --------------------------------------------------------

def test_rule_checklist_marks_pass_and_fail():
    prompt = build(criteria=make_criteria(2))
    assert prompt.count("[PASS]") == 2
    assert prompt.count("[FAIL]") == 3


def test_gain_pct_included_only_when_supplied():
    assert "position_gain_pct" in build(gain_pct=0.42)
    assert "position_gain_pct" not in build()


def test_absent_news_is_declared_not_silently_dropped():
    """The system prompt tells the model to say "missing" rather than
    invent; it can only do that if absence is visible in the prompt."""
    assert "(no recent news available)" in build(news_ctx="")


def test_filing_context_is_embedded_when_present():
    assert "10-K excerpt about margins" in build(
        filing_ctx="Recent SEC filing excerpts:\n- 10-K excerpt about margins")


def test_required_output_fields_are_specified():
    prompt = build()
    for field in ("Symbol:", "Action:", "Decision:", "Date:", "Summary:",
                  "Reasoning:"):
        assert field in prompt


# --- decision parsing -------------------------------------------------------
# _parse_decision feeds the public track-record ledger; a miss silently
# drops the call rather than logging it wrong, so the cases matter.

@pytest.mark.parametrize("text,expected", [
    ("Decision: YES", "YES"),
    ("Decision: NO", "NO"),
    ("decision: yes", "YES"),
    ("Symbol: NVDA\nAction: SELL\nDecision:   NO\nDate: 2026-08-06", "NO"),
    ("Summary: no decision here", None),
    ("", None),
])
def test_parse_decision(text, expected):
    assert _parse_decision(text) == expected


# --- retrieval query --------------------------------------------------------

def test_sell_retrieval_targets_triggered_rules():
    """A sell hinges on what fired; a buy on what's blocking it."""
    criteria = {"details": [
        {"field": "profit_margin", "passed": True},
        {"field": "forward_pe", "passed": False},
    ]}
    assert "margin" in _build_retrieval_query("NVDA", "sell", criteria)
    assert "guidance" in _build_retrieval_query("NVDA", "buy", criteria)


def test_retrieval_query_falls_back_when_nothing_triggered():
    criteria = {"details": [{"field": "profit_margin", "passed": False}]}
    assert _build_retrieval_query("NVDA", "sell", criteria)
