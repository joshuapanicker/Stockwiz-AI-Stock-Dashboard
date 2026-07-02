"""
Alert management and evaluation.

Alert types:
  price_below          — fires when close_price drops below threshold
  price_above          — fires when close_price rises above threshold
  meets_buy_criteria   — fires when stock passes user's buy criteria
  meets_watch_criteria — fires when stock passes user's watch criteria

Evaluation is done on-demand (called from the /api/alerts/check endpoint).
Email delivery is handled separately via Resend.
"""

from __future__ import annotations
from datetime import datetime, timezone
from core.db import get_client


# ── CRUD ──────────────────────────────────────────────────────────────────

def get_alerts(user_id: str) -> list[dict]:
    res = (get_client().table("user_alerts")
           .select("*")
           .eq("user_id", user_id)
           .order("created_at", desc=True)
           .execute())
    return res.data or []


def create_alert(user_id: str, symbol: str, alert_type: str,
                 threshold: float | None = None) -> dict:
    row = {
        "user_id": user_id,
        "symbol": symbol.strip().upper(),
        "alert_type": alert_type,
        "threshold": threshold,
        "enabled": True,
    }
    res = get_client().table("user_alerts").insert(row).execute()
    return res.data[0] if res.data else row


def delete_alert(user_id: str, alert_id: str) -> bool:
    res = (get_client().table("user_alerts")
           .delete()
           .eq("id", alert_id)
           .eq("user_id", user_id)
           .execute())
    return bool(res.data)


def toggle_alert(user_id: str, alert_id: str, enabled: bool) -> dict:
    res = (get_client().table("user_alerts")
           .update({"enabled": enabled})
           .eq("id", alert_id)
           .eq("user_id", user_id)
           .execute())
    return res.data[0] if res.data else {}


def mark_triggered(alert_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    get_client().table("user_alerts").update({"last_triggered": now}).eq("id", alert_id).execute()


# ── Evaluation ─────────────────────────────────────────────────────────────

def check_alerts(user_id: str) -> list[dict]:
    """
    Evaluate all enabled alerts for a user against live data.
    Returns a list of alerts that are currently firing.
    """
    from core.metrics import get_stock_metrics, get_market_context
    from core.criteria import evaluate_criteria

    alerts = [a for a in get_alerts(user_id) if a.get("enabled")]
    if not alerts:
        return []

    market = get_market_context()
    triggered = []

    # Group by symbol to avoid fetching metrics multiple times
    by_symbol: dict[str, list[dict]] = {}
    for a in alerts:
        by_symbol.setdefault(a["symbol"], []).append(a)

    for symbol, symbol_alerts in by_symbol.items():
        try:
            metrics = get_stock_metrics(symbol)
            price = metrics.get("close_price")
        except Exception:
            continue

        for alert in symbol_alerts:
            fired = False
            atype = alert["alert_type"]
            threshold = alert.get("threshold")

            if atype == "price_below" and threshold is not None and price is not None:
                fired = price < threshold
            elif atype == "price_above" and threshold is not None and price is not None:
                fired = price > threshold
            elif atype == "meets_buy_criteria":
                result = evaluate_criteria("buy", metrics, market, user_id=user_id)
                fired = result["passed"]
            elif atype == "meets_watch_criteria":
                result = evaluate_criteria("watch", metrics, market, user_id=user_id)
                fired = result["passed"]

            if fired:
                mark_triggered(alert["id"])
                triggered.append({
                    **alert,
                    "current_price": price,
                    "fired": True,
                })

    return triggered
