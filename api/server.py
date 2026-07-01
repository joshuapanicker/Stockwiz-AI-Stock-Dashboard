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

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from core.screener import run_screen, ScreenedStock
from core.metrics import get_stock_metrics, get_market_context, get_price_history
from core.criteria import evaluate_criteria
from core.portfolio import get_holdings, add_holding, remove_holding, compute_gain, get_portfolio_price_history
from core.analysis import analyze_stock
from core.chat import chat as stock_chat

import math
from fastapi.responses import JSONResponse

app = FastAPI(title="StockWiz API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


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
    if response.headers.get("content-type", "").startswith("application/json"):
        body = b""
        async for chunk in response.body_iterator:
            body += chunk
        try:
            data = json.loads(body)
            clean = sanitize(data)
            return JSONResponse(content=clean, status_code=response.status_code,
                                headers=dict(response.headers))
        except Exception:
            from starlette.responses import Response
            return Response(content=body, status_code=response.status_code,
                            headers=dict(response.headers), media_type="application/json")
    return response


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
async def chat_endpoint(symbol: str, req: ChatRequest):
    from core.chat import build_system as build_stock_system
    messages = [{"role": m.role, "content": m.content} for m in req.messages]
    system = build_stock_system(symbol, messages)
    return StreamingResponse(
        _stream_anthropic(system, messages, max_tokens=400),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Portfolio ─────────────────────────────────────────────────────────────

@app.get("/api/portfolio")
def portfolio():
    holdings = get_holdings()
    market = get_market_context()
    enriched = []
    for h in holdings:
        symbol = h["symbol"]
        try:
            metrics = get_stock_metrics(symbol)
            current = metrics["close_price"]
            gain = compute_gain(h, current)
            sell_result = evaluate_criteria("sell", metrics, market, gain_pct=gain.get("gain_pct"))
            hist = get_portfolio_price_history(symbol, h["buy_date"])
        except Exception:
            metrics = None; current = None
            gain = {"gain_pct": None, "gain_abs": None}
            sell_result = None; hist = []
        enriched.append({**h, "current_price": current, "gain_pct": gain.get("gain_pct"),
                         "gain_abs": gain.get("gain_abs"), "sell_result": sell_result,
                         "metrics": metrics, "history": hist})
    return enriched


class AddHoldingRequest(BaseModel):
    symbol: str
    buy_date: str
    buy_price: float | None = None
    notes: str = ""


@app.post("/api/portfolio")
def add_to_portfolio(req: AddHoldingRequest):
    return add_holding(req.symbol, req.buy_date, req.buy_price, req.notes)


@app.delete("/api/portfolio/{symbol}")
def remove_from_portfolio(symbol: str):
    if not remove_holding(symbol):
        raise HTTPException(status_code=404, detail=f"{symbol} not found")
    return {"removed": symbol}


# ── Criteria ──────────────────────────────────────────────────────────────

@app.get("/api/criteria")
def get_criteria():
    """Return the current criteria config."""
    from core.criteria import load_criteria
    c = load_criteria()
    # Exclude watchlist from the response (UI doesn't need it)
    return {k: v for k, v in c.items() if k != "watchlist"}


@app.put("/api/criteria")
def update_criteria(body: dict):
    """Overwrite buy/watch/sell criteria (preserves watchlist)."""
    import json
    from pathlib import Path
    criteria_path = Path(__file__).parent.parent / "data" / "criteria.json"
    current = json.loads(criteria_path.read_text())
    # Only update the three mode keys; preserve watchlist
    for mode in ("buy", "watch", "sell"):
        if mode in body:
            current[mode] = body[mode]
    criteria_path.write_text(json.dumps(current, indent=2))
    return {"saved": True}


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
