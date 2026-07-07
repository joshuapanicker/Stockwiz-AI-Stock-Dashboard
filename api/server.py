"""FastAPI backend — bridges the React UI to core/ logic."""

from __future__ import annotations

from pathlib import Path
import sys
import os

# Load .env if present
_env_file = Path(__file__).parent.parent / ".env"
if _env_file.exists():
    for line in _env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            if v.strip():
                os.environ.setdefault(k.strip(), v.strip())

sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from core.screener import run_screen, ScreenedStock
from core.metrics import get_stock_metrics, get_market_context, get_price_history
from core.criteria import evaluate_criteria
from core.portfolio import compute_gain, get_portfolio_price_history, _lookup_price_on_date
from core.analysis import analyze_stock
from core.chat import chat as stock_chat
from core.auth import get_current_user, get_optional_user

import math
from fastapi.responses import JSONResponse

app = FastAPI(title="StockWiz API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Ensure CORS headers are present even on unhandled 500 errors
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={"Access-Control-Allow-Origin": "*"},
    )


@app.on_event("startup")
async def prewarm():
    """Pre-fetch data for top watchlist stocks and start universe background fetcher."""
    import asyncio
    from core.criteria import get_watchlist
    from core.metrics import get_price_history, get_stock_metrics, get_market_context
    from core.universe_fetcher import start_background_fetcher

    async def warm(symbol: str):
        try:
            get_stock_metrics(symbol)
            get_price_history(symbol, "1y")
            get_price_history(symbol, "6mo")
        except Exception:
            pass

    async def run():
        await asyncio.sleep(1)  # let server finish starting
        get_market_context()
        symbols = get_watchlist()[:8]  # top 8 only
        await asyncio.gather(*[warm(s) for s in symbols])
        # Start universe background fetcher in a thread
        start_background_fetcher()

    asyncio.create_task(run())


def sanitize(obj):
    """Recursively replace nan/inf with None for JSON safety."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize(v) for v in obj]
    return obj


@app.middleware("http")
async def sanitize_response(request, call_next):
    import json
    response = await call_next(request)
    # Only sanitize non-streaming JSON responses
    content_type = response.headers.get("content-type", "")
    if not content_type.startswith("application/json"):
        return response
    # Don't buffer SSE or large streams
    body = b""
    async for chunk in response.body_iterator:
        body += chunk
        if len(body) > 10 * 1024 * 1024:  # 10MB safety cap
            break
    try:
        data = json.loads(body)
        clean = sanitize(data)
        return JSONResponse(content=clean, status_code=response.status_code,
                            headers=dict(response.headers))
    except Exception:
        from starlette.responses import Response
        return Response(content=body, status_code=response.status_code,
                        headers=dict(response.headers), media_type="application/json")


# ── Pydantic models ───────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: list[ChatMessage]


# ── Screener ──────────────────────────────────────────────────────────────

@app.get("/api/screen")
def screen():
    results = run_screen()
    return [{"symbol": r.symbol, "metrics": r.metrics, "market": r.market,
             "buy_result": r.buy_result, "watch_result": r.watch_result,
             "classification": r.classification, "error": r.error} for r in results]


# ── Market ────────────────────────────────────────────────────────────────

@app.get("/api/market")
def market():
    return get_market_context()


# ── Price history ─────────────────────────────────────────────────────────

@app.get("/api/history/{symbol}")
def history(symbol: str, period: str = "1y"):
    try:
        return get_price_history(symbol, period)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── News & Earnings ───────────────────────────────────────────────────────

@app.get("/api/news/{symbol}")
def stock_news(symbol: str):
    from core.news import get_recent_news, get_recent_earnings
    return {
        "headlines": get_recent_news(symbol),
        "earnings": get_recent_earnings(symbol),
    }


# ── Analysis ──────────────────────────────────────────────────────────────

@app.get("/api/analyze/{symbol}")
async def analyze(symbol: str, action: str = "buy"):
    try:
        return await analyze_stock(symbol, action)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Prediction ────────────────────────────────────────────────────────────

@app.get("/api/predict/{symbol}")
async def predict(symbol: str):
    try:
        from core.prediction import predict_stock
        return predict_stock(symbol)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Chat — specific routes MUST come before wildcard /api/chat/{symbol} ──

from fastapi.responses import StreamingResponse

def _sse(text: str) -> str:
    import json
    return f"data: {json.dumps({'token': text})}\n\n"

def _stream_anthropic(system: str, messages: list[dict], max_tokens: int = 400):
    """Generator that yields SSE tokens from Anthropic streaming API."""
    import anthropic, os
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    client = anthropic.Anthropic(api_key=api_key)
    with client.messages.stream(
        model="claude-haiku-4-5-20251001",
        max_tokens=max_tokens,
        system=system,
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            yield _sse(text)
    yield "data: [DONE]\n\n"


@app.post("/api/chat/general")
async def general_chat_endpoint(req: ChatRequest):
    from core.general_chat import build_system
    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    system = build_system(messages)
    return StreamingResponse(
        _stream_anthropic(system, messages, max_tokens=400),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/chat/title")
async def generate_title(req: ChatRequest):
    try:
        import anthropic
        api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
        client = anthropic.Anthropic(api_key=api_key)
        convo = "\n".join(f"{m.role}: {m.content[:200]}" for m in req.messages[:4])
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=20,
            messages=[{"role": "user", "content": f"Give a 4-word max title for this conversation. No quotes, no punctuation:\n{convo}"}],
        )
        return {"title": response.content[0].text.strip() if response.content else "Market Discussion"}
    except Exception:
        return {"title": "Market Discussion"}


@app.post("/api/chat/{symbol}")
async def chat_endpoint(symbol: str, req: ChatRequest,
                        user_id: str = Depends(get_current_user)):
    from core.chat import build_system as build_stock_system
    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    system = build_stock_system(symbol, messages, user_id=user_id)
    return StreamingResponse(
        _stream_anthropic(system, messages, max_tokens=400),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Portfolio ─────────────────────────────────────────────────────────────

@app.get("/api/portfolio")
def portfolio(user_id: str | None = Depends(get_optional_user)):
    from concurrent.futures import ThreadPoolExecutor
    from core.db import get_holdings as db_get_holdings
    from core.portfolio import get_holdings as file_get_holdings
    # Use Supabase if authenticated, fallback to file for unauthenticated
    if user_id:
        holdings = db_get_holdings(user_id)
    else:
        holdings = file_get_holdings()
    market = get_market_context()
    def enrich_holding(h):
        symbol = h["symbol"]
        try:
            metrics = get_stock_metrics(symbol)
            current = metrics["close_price"]
            gain = compute_gain(h, current)
            sell_result = evaluate_criteria("sell", metrics, market,
                                            gain_pct=gain.get("gain_pct"),
                                            user_id=user_id)
            hist = get_portfolio_price_history(symbol, h["buy_date"])
        except Exception:
            metrics = None; current = None
            gain = {"gain_pct": None, "gain_abs": None, "total_value": None}
            sell_result = None; hist = []
        return {**h, "current_price": current,
                "gain_pct": gain.get("gain_pct"),
                "gain_abs": gain.get("gain_abs"),
                "total_value": gain.get("total_value"),
                "sell_result": sell_result,
                "metrics": metrics, "history": hist}

    # Network-bound market lookups used to run one holding at a time. Fetching
    # them concurrently makes first portfolio load scale with the slowest
    # symbol rather than the sum of every symbol's latency.
    with ThreadPoolExecutor(max_workers=min(8, max(1, len(holdings)))) as pool:
        return list(pool.map(enrich_holding, holdings))


class AddHoldingRequest(BaseModel):
    symbol: str
    buy_date: str
    buy_price: float | None = None
    shares: float = 1.0
    notes: str = ""


@app.post("/api/portfolio")
def add_to_portfolio(req: AddHoldingRequest, user_id: str | None = Depends(get_optional_user)):
    from core.db import upsert_holding
    from core.portfolio import add_holding as file_add_holding
    buy_price = req.buy_price
    if buy_price is None:
        buy_price = _lookup_price_on_date(req.symbol, req.buy_date)
    if user_id:
        return upsert_holding(user_id, req.symbol, req.buy_date, buy_price, req.notes, req.shares)
    # Fallback: write to local file (dev only — no auth)
    return file_add_holding(req.symbol, req.buy_date, buy_price, req.notes, req.shares)


@app.delete("/api/portfolio/{symbol:path}")
def remove_from_portfolio(symbol: str, user_id: str | None = Depends(get_optional_user)):
    from core.db import delete_holding as db_delete
    from core.portfolio import remove_holding as file_remove
    # URL-decode in case the symbol contains encoded special chars
    from urllib.parse import unquote
    symbol = unquote(symbol)
    if user_id:
        if not db_delete(user_id, symbol):
            raise HTTPException(status_code=404, detail=f"{symbol} not found")
    else:
        if not file_remove(symbol):
            raise HTTPException(status_code=404, detail=f"{symbol} not found")
    return {"removed": symbol}


class SellHoldingRequest(BaseModel):
    sell_price: float
    sell_date: str | None = None  # defaults to today


# NOTE: /portfolio/sold must be defined BEFORE /portfolio/{symbol}/sell
# so FastAPI doesn't match the literal "sold" as a symbol path param.
@app.get("/api/portfolio/sold")
def get_sold_positions(user_id: str | None = Depends(get_optional_user)):
    """Return the user's completed trade history."""
    if not user_id:
        return []  # no history for unauthenticated users
    from core.db import get_sold_positions as db_get_sold
    return db_get_sold(user_id)


@app.post("/api/portfolio/{symbol}/sell")
def sell_holding(
    symbol: str,
    req: SellHoldingRequest,
    user_id: str | None = Depends(get_optional_user),
):
    """Record a sale, capture realized P&L, and remove the holding."""
    from urllib.parse import unquote
    from datetime import date
    from core.db import record_sale, get_holdings as db_get_holdings
    from core.portfolio import get_holding as file_get_holding, remove_holding as file_remove

    symbol = unquote(symbol).upper()
    sell_date = req.sell_date or date.today().isoformat()

    if user_id:
        holdings = db_get_holdings(user_id)
        holding = next((h for h in holdings if h["symbol"] == symbol), None)
        if not holding:
            # Already sold — check if a recent sale exists and return it
            from core.db import get_sold_positions as db_get_sold
            sold = db_get_sold(user_id)
            recent = next((s for s in sold if s["symbol"] == symbol), None)
            if recent:
                return recent  # idempotent: return the existing sale record
            raise HTTPException(status_code=404, detail=f"{symbol} not found in portfolio")
        return record_sale(
            user_id=user_id,
            symbol=symbol,
            sell_date=sell_date,
            sell_price=req.sell_price,
            shares=float(holding.get("shares") or 1),
            buy_price=holding.get("buy_price"),
            buy_date=holding.get("buy_date", ""),
        )
    else:
        from core.portfolio import get_holding as file_get_holding, remove_holding as file_remove
        holding = file_get_holding(symbol)
        if not holding:
            raise HTTPException(status_code=404, detail=f"{symbol} not found")
        file_remove(symbol)
        return {"symbol": symbol, "sell_price": req.sell_price, "sell_date": sell_date}


# ── Plaid (brokerage sync) ────────────────────────────────────────────────

@app.post("/api/plaid/link-token")
def plaid_link_token(user_id: str | None = Depends(get_optional_user)):
    """Create a Plaid Link token to initialize the Link flow."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    from core.plaid_client import create_link_token
    try:
        token = create_link_token(user_id)
        return {"link_token": token}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class PlaidExchangeRequest(BaseModel):
    public_token: str
    institution_name: str = ""


@app.post("/api/plaid/exchange")
def plaid_exchange(req: PlaidExchangeRequest, user_id: str | None = Depends(get_optional_user)):
    """Exchange public token for access token and store it."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    from core.plaid_client import exchange_public_token, save_plaid_token
    try:
        result = exchange_public_token(req.public_token)
        access_token = result["access_token"]
        item_id = result["item_id"]
        save_plaid_token(user_id, access_token, req.institution_name, item_id)
        return {"connected": True, "institution": req.institution_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/plaid/holdings")
def plaid_holdings(user_id: str | None = Depends(get_optional_user)):
    """Fetch real brokerage holdings from ALL connected Plaid accounts, merged."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    from core.plaid_client import get_plaid_tokens, get_holdings
    connections = get_plaid_tokens(user_id)
    if not connections:
        return {"connected": False, "holdings": []}
    all_holdings: list[dict] = []
    errors: list[str] = []
    for conn in connections:
        try:
            h = get_holdings(conn["access_token"])
            # Tag each holding with the institution name; fall back to a short
            # unique identifier so multiple anonymous connections are distinguishable
            label = (conn.get("institution_name") or "").strip()
            if not label:
                # Use last 6 chars of item_id or connection id as a readable fallback
                fallback_id = (conn.get("item_id") or conn.get("id") or "")[-6:]
                label = f"Account …{fallback_id}" if fallback_id else "Unknown Account"
            for item in h:
                item["institution"] = label
            all_holdings.extend(h)
        except Exception as e:
            errors.append(f"{conn.get('institution_name', conn['id'])}: {e}")
    return {
        "connected": True,
        "holdings": all_holdings,
        "errors": errors if errors else None,
    }


@app.get("/api/plaid/status")
def plaid_status(user_id: str | None = Depends(get_optional_user)):
    """Return list of all connected Plaid accounts for the user."""
    try:
        if not user_id:
            return {"connected": False, "connections": []}
        from core.plaid_client import get_plaid_tokens
        connections = get_plaid_tokens(user_id)
        if connections:
            return {
                "connected": True,
                "connections": [
                    {
                        "id": c["id"],
                        "institution": c.get("institution_name", ""),
                        "updated_at": c.get("updated_at"),
                    }
                    for c in connections
                ],
            }
        return {"connected": False, "connections": []}
    except Exception as e:
        return {"connected": False, "connections": [], "error": str(e)}


@app.delete("/api/plaid/disconnect/{connection_id}")
def plaid_disconnect(connection_id: str, remove_holdings: bool = False,
                     user_id: str | None = Depends(get_optional_user)):
    """Remove a specific Plaid connection by its UUID.
    If remove_holdings=true, also delete all portfolio holdings synced from that institution.
    """
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    from core.plaid_client import delete_plaid_connection, get_plaid_tokens
    # Grab institution name before deleting so we can match holdings
    removed_count = 0
    if remove_holdings:
        connections = get_plaid_tokens(user_id)
        conn = next((c for c in connections if c["id"] == connection_id), None)
        if conn and conn.get("institution_name"):
            from core.db import delete_holdings_by_source
            removed_count = delete_holdings_by_source(user_id, conn["institution_name"])
    delete_plaid_connection(user_id, connection_id)
    return {"disconnected": connection_id, "holdings_removed": removed_count}


@app.delete("/api/plaid/disconnect")
def plaid_disconnect_all(user_id: str | None = Depends(get_optional_user)):
    """Remove ALL Plaid connections for user (legacy fallback)."""
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    from core.plaid_client import delete_plaid_connection
    delete_plaid_connection(user_id)
    return {"disconnected": True}


# ── Portfolio source cleanup ──────────────────────────────────────────────

@app.delete("/api/portfolio/source/{source}")
def remove_holdings_by_source(source: str, user_id: str | None = Depends(get_optional_user)):
    """Delete all portfolio holdings synced from a given source (institution name).
    Used when a brokerage has already been disconnected but holdings remain.
    """
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    from core.db import delete_holdings_by_source
    removed = delete_holdings_by_source(user_id, source)
    return {"source": source, "removed": removed}


# ── Symbol search (typeahead) ─────────────────────────────────────────────

@app.get("/api/search")
def search_symbols(q: str = ""):
    """
    Fast symbol/company search against the universe cache.
    Returns up to 10 matches ordered by market cap.
    """
    from core.universe_cache import _connect
    if not q or len(q.strip()) < 1:
        return []
    q = q.strip().upper()
    with _connect() as conn:
        rows = conn.execute("""
            SELECT symbol, sector, close_price, market_cap
            FROM universe_stocks
            WHERE fetch_error IS NULL
              AND close_price IS NOT NULL
              AND (
                UPPER(symbol) LIKE ? OR
                UPPER(symbol) = ?
              )
            ORDER BY market_cap DESC NULLS LAST
            LIMIT 10
        """, (f"{q}%", q)).fetchall()
    return [{"symbol": r["symbol"], "sector": r["sector"],
             "close_price": r["close_price"], "market_cap": r["market_cap"]}
            for r in rows]


# ── Financials ────────────────────────────────────────────────────────────

@app.get("/api/financials/{symbol}")
def financials(symbol: str):
    """Return quarterly revenue and net income for charting."""
    from core.cache import get as cache_get, set as cache_set
    import math
    key = f"financials:{symbol.upper()}"
    cached = cache_get(key, 3600)  # cache 1hr
    if cached:
        return cached
    try:
        import yfinance as yf
        t = yf.Ticker(symbol.strip().upper())
        fin = t.quarterly_financials
        if fin is None or fin.empty:
            return {"quarters": [], "revenue_growth_yoy": None, "profit_margin": None}

        def safe_val(v):
            try:
                f = float(v)
                return None if (math.isnan(f) or math.isinf(f)) else round(f, 0)
            except Exception:
                return None

        quarters = []
        cols = list(fin.columns[:8])  # last 8 quarters max
        for col in reversed(cols):
            q_label = col.strftime("%Y Q%q") if hasattr(col, 'strftime') else str(col)[:7]
            rev = safe_val(fin.loc["Total Revenue", col]) if "Total Revenue" in fin.index else None
            ni  = safe_val(fin.loc["Net Income", col])    if "Net Income"    in fin.index else None
            quarters.append({"quarter": q_label, "revenue": rev, "net_income": ni})

        # YoY revenue growth (latest vs 4 quarters ago)
        rev_growth = None
        rev_vals = [q["revenue"] for q in quarters if q["revenue"] is not None]
        if len(rev_vals) >= 5:
            latest, year_ago = rev_vals[-1], rev_vals[-5]
            if year_ago and year_ago != 0:
                rev_growth = round((latest - year_ago) / abs(year_ago), 4)

        metrics = get_stock_metrics(symbol)
        result = {
            "quarters": quarters,
            "revenue_growth_yoy": rev_growth,
            "profit_margin": metrics.get("profit_margin"),
        }
        cache_set(key, result)
        return result
    except Exception as e:
        return {"quarters": [], "revenue_growth_yoy": None, "profit_margin": None}


# ── Alerts ────────────────────────────────────────────────────────────────

@app.get("/api/alerts")
def list_alerts(user_id: str | None = Depends(get_optional_user)):
    if not user_id:
        return []
    from core.alerts import get_alerts
    return get_alerts(user_id)


class CreateAlertRequest(BaseModel):
    symbol: str
    alert_type: str
    threshold: float | None = None


@app.post("/api/alerts")
def create_alert_endpoint(req: CreateAlertRequest, user_id: str | None = Depends(get_optional_user)):
    if not user_id:
        raise HTTPException(status_code=401, detail="Must be logged in to create alerts")
    from core.alerts import create_alert
    return create_alert(user_id, req.symbol, req.alert_type, req.threshold)


@app.delete("/api/alerts/{alert_id}")
def delete_alert_endpoint(alert_id: str, user_id: str | None = Depends(get_optional_user)):
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    from core.alerts import delete_alert
    if not delete_alert(user_id, alert_id):
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"deleted": alert_id}


class ToggleAlertRequest(BaseModel):
    enabled: bool


@app.patch("/api/alerts/{alert_id}")
def toggle_alert_endpoint(alert_id: str, req: ToggleAlertRequest,
                           user_id: str | None = Depends(get_optional_user)):
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    from core.alerts import toggle_alert
    return toggle_alert(user_id, alert_id, req.enabled)


@app.post("/api/alerts/check")
def check_alerts_endpoint(user_id: str | None = Depends(get_optional_user)):
    """Evaluate all alerts and return which ones are currently firing."""
    if not user_id:
        return []
    from core.alerts import check_alerts
    return check_alerts(user_id)


# ── Criteria ──────────────────────────────────────────────────────────────

@app.get("/api/criteria")
def get_criteria(user_id: str | None = Depends(get_optional_user)):
    from core.criteria import load_criteria
    c = load_criteria(user_id)
    return {k: v for k, v in c.items() if k != "watchlist"}


@app.put("/api/criteria")
def update_criteria(body: dict, user_id: str | None = Depends(get_optional_user)):
    from core.db import save_user_criteria
    from core.criteria import _load_defaults
    if not user_id:
        raise HTTPException(status_code=401, detail="Must be logged in to save criteria")
    defaults = _load_defaults()
    current = {k: v for k, v in defaults.items() if k != "watchlist"}
    for mode in ("buy", "watch", "sell"):
        if mode in body:
            current[mode] = body[mode]
    save_user_criteria(user_id, current)
    return {"saved": True}


# ── User Profile ──────────────────────────────────────────────────────────

@app.get("/api/profile")
def get_profile(user_id: str | None = Depends(get_optional_user)):
    from core.db import get_user_profile
    from core.db import DEFAULT_PROFILE
    if not user_id:
        return dict(DEFAULT_PROFILE)
    return get_user_profile(user_id)


@app.put("/api/profile")
def update_profile(body: dict, user_id: str | None = Depends(get_optional_user)):
    from core.db import save_user_profile
    if not user_id:
        raise HTTPException(status_code=401, detail="Must be logged in to save profile")
    return save_user_profile(user_id, body)


# ── Universe ──────────────────────────────────────────────────────────────

@app.get("/api/universe/signals")
def universe_signals(limit: int = 60):
    """
    Evaluate buy/watch criteria against the top cached universe stocks.
    Returns classified results sorted buy → watch → none, limited to top candidates.
    """
    from core.universe_cache import query_universe
    from core.criteria import evaluate_criteria
    from core.metrics import get_market_context

    # Pull top stocks by market cap from the cache
    stocks = query_universe(order_by="market_cap DESC", limit=limit)
    market = get_market_context()

    results = []
    for s in stocks:
        buy_result = evaluate_criteria("buy", s, market)
        watch_result = evaluate_criteria("watch", s, market)

        if buy_result["passed"]:
            classification = "buy"
        elif watch_result["passed"]:
            classification = "watch"
        else:
            classification = "none"

        results.append({
            "symbol": s["symbol"],
            "classification": classification,
            "metrics": s,
            "buy_result": buy_result,
            "watch_result": watch_result,
        })

    # Sort: buy first, then watch, then none
    order = {"buy": 0, "watch": 1, "none": 2}
    results.sort(key=lambda x: (order[x["classification"]], -(x["metrics"].get("market_cap") or 0)))

    # Only return buy + watch to keep the panel clean
    return [r for r in results if r["classification"] != "none"]


@app.get("/api/universe/status")
def universe_status():
    """Return background fetch progress and cache stats."""
    from core.universe_fetcher import get_progress
    from core.universe_cache import get_cached_count, get_total_universe_size
    progress = get_progress()
    return {
        "cached": get_cached_count(),
        "total": get_total_universe_size(),
        "fetching": progress["running"],
        "fetched_this_cycle": progress["fetched"],
        "cycle_total": progress["total"],
        "last_run": progress["last_run"],
    }


@app.get("/api/universe/sectors")
def universe_sectors():
    """Return distinct sectors available in the cached universe."""
    from core.universe_cache import get_sectors
    return get_sectors()


class UniverseQueryRequest(BaseModel):
    sector: str | None = None
    max_forward_pe: float | None = None
    max_trailing_pe: float | None = None
    min_revenue_growth: float | None = None
    min_profit_margin: float | None = None
    min_earnings_growth: float | None = None
    near_52w_low_pct: float | None = None
    min_market_cap: float | None = None
    limit: int = 50
    order_by: str = "market_cap DESC"


@app.post("/api/universe/query")
def universe_query(req: UniverseQueryRequest):
    """Structured query against the cached universe."""
    from core.universe_cache import query_universe
    results = query_universe(
        sector=req.sector,
        max_forward_pe=req.max_forward_pe,
        max_trailing_pe=req.max_trailing_pe,
        min_revenue_growth=req.min_revenue_growth,
        min_profit_margin=req.min_profit_margin,
        near_52w_low_pct=req.near_52w_low_pct,
        min_earnings_growth=req.min_earnings_growth,
        min_market_cap=req.min_market_cap,
        limit=min(req.limit, 100),
        order_by=req.order_by,
    )
    return results


class AgentFilterRequest(BaseModel):
    query: str
    messages: list[ChatMessage] = []


@app.post("/api/universe/agent")
async def universe_agent(req: AgentFilterRequest):
    """
    Natural language → structured filter → ranked results + streamed AI summary.
    Returns SSE stream. First event contains the structured filter + raw results,
    then tokens stream for the summary.
    """
    from core.universe_agent import run_agent_filter, build_summary_system
    from core.metrics import get_market_context

    try:
        filters, results = run_agent_filter(req.query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    market = get_market_context()

    # First SSE event: structured payload (filters + results list)
    import json as _json
    first_event = _json.dumps({
        "type": "results",
        "filters": filters,
        "results": sanitize(results[:50]),
        "total_matched": len(results),
    })

    def generate():
        yield f"data: {first_event}\n\n"
        # Stream the AI summary
        system = build_summary_system(filters, results, market)
        messages = [{"role": "user", "content": req.query}]
        yield from _stream_anthropic(system, messages, max_tokens=300)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.server:app", host="0.0.0.0", port=8000, reload=True)
