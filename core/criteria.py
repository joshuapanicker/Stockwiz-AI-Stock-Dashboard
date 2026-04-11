"""Load criteria config and evaluate rules against stock+market data."""

from __future__ import annotations

import json
from pathlib import Path

CRITERIA_FILE = Path(__file__).parent.parent / "data" / "criteria.json"


def load_criteria() -> dict:
    with open(CRITERIA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _evaluate_rule(rule: dict, data: dict) -> bool:
    field = rule["field"]
    op = rule["operator"]
    threshold = rule["value"]
    val = data.get(field)

    if val is None:
        return False

    if op == "lt":
        return val < threshold
    if op == "gt":
        return val > threshold
    if op == "eq":
        return val == threshold
    if op == "neq":
        return val != threshold
    if op == "lte":
        return val <= threshold
    if op == "gte":
        return val >= threshold

    return False


def evaluate_criteria(mode: str, metrics: dict, market: dict, gain_pct: float | None = None) -> dict:
    """
    Evaluate buy/watch/sell criteria against the provided data.

    Returns:
        {
            "passed": bool,
            "rules_met": int,
            "rules_total": int,
            "min_required": int,
            "details": [{"id", "description", "passed"}, ...]
        }
    """
    criteria = load_criteria()
    config = criteria.get(mode, {})
    rules = config.get("rules", [])
    min_required = config.get("min_rules_met", len(rules))

    combined = {**metrics, **market}
    if gain_pct is not None:
        combined["gain_pct"] = gain_pct

    details = []
    met = 0
    for rule in rules:
        passed = _evaluate_rule(rule, combined)
        if passed:
            met += 1
        details.append({
            "id": rule["id"],
            "description": rule["description"],
            "passed": passed,
        })

    return {
        "passed": met >= min_required,
        "rules_met": met,
        "rules_total": len(rules),
        "min_required": min_required,
        "details": details,
    }


def get_watchlist() -> list[str]:
    return load_criteria().get("watchlist", [])
