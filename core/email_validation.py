"""
Lightweight email deliverability check — confirms the domain can receive
mail (MX record, falling back to an A/AAAA record per RFC 5321) without
sending anything. Catches typos and fabricated domains before signup;
does not confirm a specific mailbox exists.
"""

from __future__ import annotations

import re

import dns.resolver

_EMAIL_RE = re.compile(r"^[^@\s]+@([^@\s]+\.[^@\s]+)$")

# Keep DNS lookups from hanging a signup request
_TIMEOUT = 3.0

_resolver = dns.resolver.Resolver()
_resolver.timeout = _TIMEOUT
_resolver.lifetime = _TIMEOUT


def extract_domain(email: str) -> str | None:
    m = _EMAIL_RE.match(email.strip())
    return m.group(1).lower() if m else None


def has_valid_mx(email: str) -> tuple[bool, str | None]:
    """
    Returns (valid, reason). reason is None when valid, otherwise a short
    user-facing explanation. DNS errors we can't attribute to a bad domain
    (timeouts, resolver hiccups) fail OPEN — we'd rather let a real user
    through than block signups over a transient network blip.
    """
    domain = extract_domain(email)
    if not domain:
        return False, "Enter a valid email address."

    try:
        answers = _resolver.resolve(domain, "MX")
        if len(answers) > 0:
            return True, None
    except (dns.resolver.NXDOMAIN, dns.resolver.NoNameservers):
        return False, "That email domain doesn't exist."
    except dns.resolver.NoAnswer:
        pass  # no MX record — fall through to the A-record fallback below
    except Exception:
        return True, None  # timeout / transient resolver error — fail open

    # No MX record: some domains still accept mail via a bare A/AAAA record
    try:
        _resolver.resolve(domain, "A")
        return True, None
    except (dns.resolver.NXDOMAIN, dns.resolver.NoNameservers, dns.resolver.NoAnswer):
        return False, "That email domain can't receive mail."
    except Exception:
        return True, None
