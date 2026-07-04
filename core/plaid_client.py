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


def exchange_public_token(public_token: str) -> str:
    """Exchange a public token for a persistent access token."""
    client = get_plaid_client()
    request = ItemPublicTokenExchangeRequest(public_token=public_token)
    response = client.item_public_token_exchange(request)
    return response["access_token"]


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

    holdings = []
    for h in response["holdings"]:
        security = securities.get(h["security_id"], {})
        ticker = security.get("ticker_symbol") or security.get("name", "UNKNOWN")

        # Skip non-equity securities (bonds, cash, etc.) unless they have a ticker
        if not ticker or ticker in ("CUR:USD", "USD"):
            continue

        holdings.append({
            "symbol": ticker.upper(),
            "quantity": float(h.get("quantity", 0)),
            "cost_basis": float(h["cost_basis"]) if h.get("cost_basis") else None,
            "current_value": float(h.get("institution_value", 0)),
            "institution_price": float(h.get("institution_price", 0)),
            "security_name": security.get("name", ticker),
            "security_type": security.get("type", "equity"),
        })

    return holdings


def save_plaid_token(user_id: str, access_token: str, institution_name: str = "") -> None:
    """Store Plaid access token in Supabase."""
    from core.db import get_client
    get_client().table("plaid_connections").upsert({
        "user_id": user_id,
        "access_token": access_token,
        "institution_name": institution_name,
        "updated_at": "now()",
    }, on_conflict="user_id").execute()


def get_plaid_token(user_id: str) -> str | None:
    """Retrieve stored Plaid access token for a user."""
    from core.db import get_client
    res = (get_client().table("plaid_connections")
           .select("access_token")
           .eq("user_id", user_id)
           .maybe_single()
           .execute())
    return res.data["access_token"] if res.data else None


def delete_plaid_connection(user_id: str) -> None:
    """Remove a user's Plaid connection."""
    from core.db import get_client
    get_client().table("plaid_connections").delete().eq("user_id", user_id).execute()
