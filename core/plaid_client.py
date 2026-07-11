"""
Plaid integration for read-only brokerage account sync.

Flow:
1. Frontend calls POST /api/plaid/link-token  → gets a link_token
2. User goes through Plaid Link UI (frontend)  → gets a public_token
3. Frontend calls POST /api/plaid/exchange     → exchanges public_token for access_token
4. access_token stored in Supabase per user
5. GET /api/plaid/holdings                     → returns real brokerage holdings
"""

from __future__ import annotations
import os
import plaid
from plaid.api import plaid_api
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.investments_holdings_get_request import InvestmentsHoldingsGetRequest
from plaid.model.products import Products
from plaid.model.country_code import CountryCode
from functools import lru_cache


@lru_cache(maxsize=1)
def get_plaid_client() -> plaid_api.PlaidApi:
    env = os.environ.get("PLAID_ENV", "sandbox").lower()
    client_id = os.environ.get("PLAID_CLIENT_ID", "").strip()
    secret = os.environ.get("PLAID_SECRET", "").strip()

    if not client_id or not secret:
        raise RuntimeError("PLAID_CLIENT_ID and PLAID_SECRET must be set")

    env_map = {
        "sandbox":     plaid.Environment.Sandbox,
        "development": plaid.Environment.Sandbox,   # v40 has no Development, use Sandbox
        "production":  plaid.Environment.Production,
    }
    plaid_env = env_map.get(env, plaid.Environment.Sandbox)

    configuration = plaid.Configuration(
        host=plaid_env,
        api_key={"clientId": client_id, "secret": secret},
    )
    api_client = plaid.ApiClient(configuration)
    return plaid_api.PlaidApi(api_client)


def create_link_token(user_id: str) -> str:
    """Create a Plaid Link token for the given user."""
    client = get_plaid_client()
    request = LinkTokenCreateRequest(
        products=[Products("investments")],
        client_name="StockWiz",
        country_codes=[CountryCode("US")],
        language="en",
        user=LinkTokenCreateRequestUser(client_user_id=user_id),
    )
    response = client.link_token_create(request)
    return response["link_token"]


def exchange_public_token(public_token: str) -> dict:
    """Exchange a public token for a persistent access token.
    Returns dict with access_token and item_id.
    """
    client = get_plaid_client()
    request = ItemPublicTokenExchangeRequest(public_token=public_token)
    response = client.item_public_token_exchange(request)
    return {
        "access_token": response["access_token"],
        "item_id": response["item_id"],
    }


def get_holdings(access_token: str) -> list[dict]:
    """
    Fetch investment holdings for a connected account.
    Returns normalized list of holdings with symbol, quantity, cost_basis, current_value.
    """
    client = get_plaid_client()
    request = InvestmentsHoldingsGetRequest(access_token=access_token)
    response = client.investments_holdings_get(request)

    # Build security lookup: security_id → ticker_symbol
    securities = {s["security_id"]: s for s in response["securities"]}

    # Security types to exclude — only keep equities and ETFs
    EQUITY_TYPES = {"equity", "etf"}

    holdings = []
    for h in response["holdings"]:
        security = securities.get(h["security_id"], {})
        sec_type = (security.get("type") or "").lower()
        ticker = (security.get("ticker_symbol") or "").strip()

        # Skip non-equity types (fixed income, mutual fund, cash, derivative, etc.)
        if sec_type and sec_type not in EQUITY_TYPES:
            continue

        # Skip cash / currency positions
        if not ticker or ticker in ("CUR:USD", "USD", "CASH"):
            continue

        # Skip if the ticker looks like a full security name (contains spaces)
        # — these are bonds/T-bills that slipped through without a proper type tag
        if " " in ticker or len(ticker) > 10:
            continue

        holdings.append({
            "symbol": ticker.upper(),
            "quantity": float(h.get("quantity", 0)),
            "cost_basis": float(h["cost_basis"]) if h.get("cost_basis") else None,
            "current_value": float(h.get("institution_value", 0)),
            "institution_price": float(h.get("institution_price", 0)),
            "security_name": security.get("name", ticker),
            "security_type": sec_type or "equity",
        })

    return holdings


def save_plaid_token(user_id: str, access_token: str, institution_name: str = "", item_id: str = "") -> None:
    """Store a new Plaid access token — supports multiple connections per user."""
    from core.db import get_client
    from core.crypto import encrypt
    get_client().table("plaid_connections").insert({
        "user_id": user_id,
        "access_token": encrypt(access_token),
        "item_id": item_id,
        "institution_name": institution_name,
        "updated_at": "now()",
    }).execute()


def get_plaid_tokens(user_id: str) -> list[dict]:
    """Retrieve all Plaid connections for a user, with access tokens
    decrypted in place so every caller works with the usable value."""
    from core.db import get_client
    from core.crypto import decrypt
    res = (get_client().table("plaid_connections")
           .select("*")
           .eq("user_id", user_id)
           .order("updated_at", desc=False)
           .execute())
    rows = res.data or []
    for row in rows:
        if row.get("access_token"):
            row["access_token"] = decrypt(row["access_token"])
    return rows


def get_plaid_token(user_id: str) -> str | None:
    """Get the first access token (legacy single-connection helper)."""
    tokens = get_plaid_tokens(user_id)
    return tokens[0]["access_token"] if tokens else None


def delete_plaid_connection(user_id: str, connection_id: str | None = None) -> None:
    """Remove a specific Plaid connection (or all if no id given)."""
    from core.db import get_client
    query = get_client().table("plaid_connections").delete().eq("user_id", user_id)
    if connection_id:
        query = query.eq("id", connection_id)
    query.execute()
