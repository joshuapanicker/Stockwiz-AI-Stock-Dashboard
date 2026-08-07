"""Section extraction from 10-K/10-Q text.

Every case here is a formatting variation taken from a real filing that the
extractor previously got wrong — silently, by indexing a fraction of a
section or none of it. Retrieval quality is bounded by what gets indexed,
so an extraction miss is invisible at query time: BM25 simply ranks over
whatever made it in. These run offline against synthetic text so they stay
fast and don't depend on SEC availability or on filings that will be
superseded next quarter.

    py -3 -m pytest tests/test_filings_extraction.py
"""

from __future__ import annotations

import pytest

from core.filings import extract_section

FILLER = ("The Company's results reflect demand across its principal "
          "markets, partially offset by higher input costs and unfavorable "
          "foreign currency movements during the period presented. ") * 6

RISK_BODY = ("We face a variety of risks that are substantial and inherent "
             "in our businesses, including market, liquidity, credit and "
             "operational risks described below. ") * 6


def toc() -> str:
    """A table of contents — every item heading, page numbers between."""
    return ("Table of Contents Item 1. Business 4 Item 1A. Risk Factors 14 "
            "Item 1B. Unresolved Staff Comments 29 Item 1C. Cybersecurity 29 "
            "Item 2. Properties 31 Item 7. Management's Discussion and "
            "Analysis of Financial Condition and Results of Operations 23 "
            "Item 7A. Quantitative and Qualitative Disclosures About Market "
            "Risk 57 Item 8. Financial Statements 58 ")


# --- the section body is found, not its table-of-contents entry -------------

def test_prefers_body_over_table_of_contents():
    text = toc() + "PART I Item 1A. Risk Factors " + RISK_BODY + \
        "Item 1B. Unresolved Staff Comments None. Item 1C. Cybersecurity"
    got = extract_section(text, "10-K", "risk_factors")
    assert got is not None
    assert "substantial and inherent" in got
    assert "Table of Contents" not in got


def test_toc_only_filing_yields_nothing():
    """No body heading anywhere — indexing the contents listing as if it
    were the section would be worse than having no grounding at all."""
    assert extract_section(toc(), "10-K", "risk_factors") is None


def test_body_heading_may_cite_other_items_in_its_opening():
    """Alphabet's MD&A opens by pointing the reader at other items. Those
    cross-references have to be tolerated or the real section is discarded
    as if it were a contents listing — the window is deliberately short so
    that an opening sentence like this one stays under the limit while a
    genuine listing, whose entries are only a page number apart, does not.
    """
    text = toc() + (
        "Item 7. Management's Discussion and Analysis of Financial Condition "
        "and Results of Operations Please read the following discussion "
        "together with our consolidated financial statements and the related "
        "notes, as well as the risks described under Item 1A. Risk Factors "
        "and the selected financial data appearing under Item 6 above. ") + \
        FILLER + \
        "Item 7A. Quantitative and Qualitative Disclosures About Market Risk " \
        "Our exposure to market risk relates primarily to interest rates."
    got = extract_section(text, "10-K", "mda")
    assert got is not None and "Please read the following" in got


# --- headings mangled by the filer's HTML -----------------------------------

def test_letter_spacing_inside_a_heading():
    """Microsoft's 10-K renders "ITEM 1A. RIS K FACTORS" once tags are
    stripped — each run of letters is its own styled span."""
    text = toc() + "PART I ITEM 1A. RIS K FACTORS " + RISK_BODY + \
        "Item 1B. Unresolved Staff Comments None. Item 1C. Cybersecurity"
    got = extract_section(text, "10-K", "risk_factors")
    assert got is not None and "substantial and inherent" in got


def test_heading_split_across_a_line_break():
    text = toc() + "PART I Item 1A.\nRisk\nFactors\n" + RISK_BODY + \
        "Item 1B. Unresolved Staff Comments None. Item 1C. Cybersecurity"
    assert extract_section(text, "10-K", "risk_factors") is not None


def test_colon_after_the_item_number():
    """Shopify punctuates with a colon rather than a period."""
    text = toc() + "Item 1A: Risk Factors " + RISK_BODY + \
        "Item 1B: Unresolved Staff Comments None. Item 1C: Cybersecurity"
    assert extract_section(text, "10-K", "risk_factors") is not None


def test_mda_heading_without_an_item_prefix():
    """Shopify heads its MD&A with the bare title."""
    text = toc() + (
        "Management's Discussion and Analysis of Financial Condition and "
        "Results of Operations In this MD&A, ") + FILLER + \
        "Item 7A. Quantitative and Qualitative Disclosures About Market Risk " \
        "Our exposure to interest rate risk is limited."
    got = extract_section(text, "10-K", "mda")
    assert got is not None and "In this MD&A" in got


@pytest.mark.parametrize("heading", [
    "Item 7A. Quantitative and Qualitative Disclosures About Market Risk",
    "Item 7A. Quantitative and Qualitative Disclosure About Market Risk",   # AMD
    "Item 7A. Qualitative and Quantitative Disclosures About Market Risk",  # NOW
])
def test_end_heading_wording_variants(heading):
    text = toc() + ("Item 7. Management's Discussion and Analysis of "
                    "Financial Condition and Results of Operations ") + \
        FILLER + heading + " Our exposure to market risk is described here."
    got = extract_section(text, "10-K", "mda")
    assert got is not None
    assert "unfavorable foreign currency" in got
    assert "exposure to market risk is described" not in got


# --- the section ends at the right place ------------------------------------

def test_cross_reference_does_not_end_the_section():
    """Microsoft's 10-Q MD&A opens by pointing at "Item 3 of this Form
    10-Q"; taking that as the boundary cut the section to one chunk."""
    text = toc() + (
        "Item 2. Management's Discussion and Analysis of Financial Condition "
        "and Results of Operations Refer to Item 3 of this Form 10-Q for "
        "market risk disclosures. ") + FILLER + \
        "Item 3. Quantitative and Qualitative Disclosures About Market Risk " \
        "We are exposed to interest rate risk."
    got = extract_section(text, "10-Q", "mda")
    assert got is not None
    assert "unfavorable foreign currency" in got, "truncated at the pointer"


def test_contents_listing_does_not_end_the_section():
    """Goldman's MD&A opens with its own contents block, listing "Item 7A
    ... Market Risk 135" — as a boundary that truncated the whole MD&A."""
    text = toc() + (
        "Item 7. Management's Discussion and Analysis of Financial Condition "
        "and Results of Operations Index Page No. Introduction 45 "
        "Item 7A. Quantitative and Qualitative Disclosures About Market Risk "
        "135 Item 8. Financial Statements 140 Risk Management 128 ") + \
        FILLER + \
        "Item 7A. Quantitative and Qualitative Disclosures About Market Risk " \
        "Interest rate risk. Our exposure relates to our investment portfolio."
    got = extract_section(text, "10-K", "mda")
    assert got is not None
    assert "unfavorable foreign currency" in got, "truncated at the listing"


def test_one_line_next_section_is_still_a_valid_boundary():
    """Item 1B is usually a single sentence with Item 1C right behind it.
    That crowding must not be mistaken for a contents listing, or the
    section runs past its end."""
    text = toc() + "PART I Item 1A. Risk Factors " + RISK_BODY + (
        "Item 1B. Unresolved Staff Comments There are no material unresolved "
        "written comments received from the SEC staff. Item 1C. Cybersecurity "
        "We maintain a cybersecurity risk management program.")
    got = extract_section(text, "10-K", "risk_factors")
    assert got is not None
    assert "substantial and inherent" in got
    assert "cybersecurity risk management program" not in got


def test_hyphen_between_item_number_and_title():
    """Albertsons writes "Item 1B - Unresolved Staff Comments"."""
    text = toc() + "PART I Item 1A - Risk Factors " + RISK_BODY + (
        "Item 1B - Unresolved Staff Comments None. Item 1C - Cybersecurity")
    got = extract_section(text, "10-K", "risk_factors")
    assert got is not None and "substantial and inherent" in got


def test_unrecognised_end_wording_falls_back_to_the_item_number():
    """The next section's *title* can be worded in ways these patterns
    don't anticipate. When that happens the boundary has to fall back to
    the bare item number, which is what the extractor did before 2026-08.
    Giving up and truncating at the size cap instead is far worse: it cut
    Albertsons' 148k-character MD&A down to 23k, losing most of it while
    still looking like a successful extraction.
    """
    body = FILLER * 40      # must exceed the cap or the test proves nothing
    assert len(body) > 30_000, "fixture too small to distinguish the two"
    text = toc() + ("Item 7. Management's Discussion and Analysis of "
                    "Financial Condition and Results of Operations ") + body + \
        "Item 7A. Market Risk Disclosures Our exposure is described here."
    got = extract_section(text, "10-K", "mda")
    assert got is not None
    assert "Market Risk Disclosures" not in got, "ran past the boundary"
    assert len(got) > 30_000, "truncated at the cap instead of the boundary"


def test_missing_end_heading_caps_rather_than_runs_away():
    text = toc() + "PART I Item 1A. Risk Factors " + RISK_BODY * 200
    got = extract_section(text, "10-K", "risk_factors")
    assert got is not None and len(got) <= 25_000


# --- refusals ---------------------------------------------------------------

def test_unknown_form_or_section():
    assert extract_section(toc(), "8-K", "risk_factors") is None
    assert extract_section(toc(), "10-K", "business") is None


def test_heading_with_no_body_is_dropped():
    assert extract_section("Item 1A. Risk Factors None.", "10-K",
                           "risk_factors") is None


def test_empty_input():
    assert extract_section("", "10-K", "mda") is None
