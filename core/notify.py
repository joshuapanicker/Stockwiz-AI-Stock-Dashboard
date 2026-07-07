"""Host notification emails via the Resend HTTP API.

Separate from Supabase Auth's SMTP config (which sends confirmation emails
to end users and is domain-restricted). This calls Resend directly to send
a single email to the app owner — allowed even without a verified domain,
since Resend's test sender can always deliver to the account owner's inbox.
"""

from __future__ import annotations

import os
import httpx

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
NOTIFY_EMAIL = os.environ.get("NOTIFY_EMAIL", "joshua.panicker@gmail.com").strip()
_FROM = "StockWiz <onboarding@resend.dev>"


def _send(subject: str, text: str) -> None:
    if not RESEND_API_KEY:
        return
    try:
        httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}"},
            json={"from": _FROM, "to": [NOTIFY_EMAIL], "subject": subject, "text": text},
            timeout=10,
        )
    except Exception:
        pass  # never let a notification failure break the auth flow


def send_signup_notification(email: str, created_at: str | None = None) -> None:
    when = f" at {created_at}" if created_at else ""
    _send("New StockWiz signup", f"A new user just signed up: {email}{when}")


def send_signin_notification(email: str) -> None:
    _send("StockWiz sign-in", f"{email} just signed in.")
