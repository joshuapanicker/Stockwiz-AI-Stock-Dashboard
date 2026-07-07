"""Generate a price prediction curve for a stock using trend analysis."""

from __future__ import annotations
import os
import json
import anthropic
from datetime import datetime, timedelta
from core.metrics import get_stock_metrics, get_price_history, get_market_context


def predict_stock(symbol: str, user_id: str | None = None) -> dict:
    metrics = get_stock_metrics(symbol)
    market = get_market_context()
    history = get_price_history(symbol, "6mo")

    # Build a compact summary of recent price action
    if len(history) >= 20:
        recent = history[-20:]
        prices = [h["close"] for h in recent]
        dates = [h["date"] for h in recent]
        avg_20 = sum(prices) / len(prices)
        trend_pct = (prices[-1] - prices[0]) / prices[0] * 100
        volatility = (max(prices) - min(prices)) / avg_20 * 100
    else:
        prices = [h["close"] for h in history]
        dates = [h["date"] for h in history]
        avg_20 = sum(prices) / len(prices) if prices else metrics["close_price"]
        trend_pct = 0
        volatility = 5

    current_price = metrics["close_price"]
    today = datetime.now()

    prompt = (
        f"You are a quantitative analyst. Based on the data below, generate a 90-day price prediction for {symbol}.\n\n"
        f"Current price: ${current_price:.2f}\n"
        f"20-day average: ${avg_20:.2f}\n"
        f"20-day trend: {trend_pct:+.1f}%\n"
        f"20-day volatility range: {volatility:.1f}%\n"
        f"Revenue growth: {metrics.get('revenue_growth', 0) or 0:.1%}\n"
        f"Forward PE: {metrics.get('forward_pe') or 'N/A'}\n"
        f"Market trend: {market['market_trend']}\n"
        f"VIX: {market.get('vix') or 'N/A'}\n\n"
        f"Return ONLY a JSON object with this exact structure, no other text:\n"
        f'{{"bull": [{{"days": 0, "price": X}}, {{"days": 30, "price": X}}, {{"days": 60, "price": X}}, {{"days": 90, "price": X}}], '
        f'"base": [{{"days": 0, "price": X}}, {{"days": 30, "price": X}}, {{"days": 60, "price": X}}, {{"days": 90, "price": X}}], '
        f'"bear": [{{"days": 0, "price": X}}, {{"days": 30, "price": X}}, {{"days": 60, "price": X}}, {{"days": 90, "price": X}}], '
        f'"summary": "one sentence explanation"}}'
    )

    from core.credits import metered_create
    response = metered_create(
        user_id,
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip() if response.content else "{}"

    # Parse JSON from response
    try:
        # Find JSON object in response
        start = raw.find("{")
        end = raw.rfind("}") + 1
        prediction = json.loads(raw[start:end])
    except Exception:
        # Fallback: generate simple linear projection
        prediction = _fallback_prediction(current_price, trend_pct, volatility)

    # Convert days to actual dates
    for scenario in ["bull", "base", "bear"]:
        if scenario in prediction:
            for point in prediction[scenario]:
                d = today + timedelta(days=point["days"])
                point["date"] = d.strftime("%Y-%m-%d")

    prediction["symbol"] = symbol
    prediction["current_price"] = current_price
    return prediction


def _fallback_prediction(price: float, trend_pct: float, volatility: float) -> dict:
    daily_trend = trend_pct / 20 / 100
    scenarios = {
        "bull": [1.0, 1 + daily_trend * 30 * 1.5, 1 + daily_trend * 60 * 1.5, 1 + daily_trend * 90 * 1.5],
        "base": [1.0, 1 + daily_trend * 30, 1 + daily_trend * 60, 1 + daily_trend * 90],
        "bear": [1.0, 1 - abs(daily_trend) * 30 * 0.5, 1 - abs(daily_trend) * 60 * 0.5, 1 - abs(daily_trend) * 90 * 0.5],
    }
    result = {}
    for scenario, multipliers in scenarios.items():
        result[scenario] = [{"days": d * 30, "price": round(price * m, 2)} for d, m in enumerate(multipliers)]
    result["summary"] = "Projection based on recent price momentum."
    return result
