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
    """Pre-fetch data for top watchlist stocks in background on startup."""
    import asyncio
    from core.criteria import get_watchlist
    from core.metrics import get_price_history, get_stock_metrics, get_market_context

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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.server:app", host="0.0.0.0", port=8000, reload=True)
