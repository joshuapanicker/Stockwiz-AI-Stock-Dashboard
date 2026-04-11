import json
from pathlib import Path

import yfinance as yf
from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    TextBlock,
    create_sdk_mcp_server,
    tool,
)

BASE_DIR = Path("/home/joshua/mcp-test")
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
REPORTS_DIR = DATA_DIR / "reports"

STOCKS_FILE = DATA_DIR / "stocklist.txt"
CRITERIA_FILE = DATA_DIR / "buycriteria.txt"


def read_symbols_file(symbols_file: Path) -> list[str]:
    with open(symbols_file, "r", encoding="utf-8") as f:
        return [
            line.strip().upper()
            for line in f
            if line.strip() and not line.strip().startswith("#")
        ]


def read_criteria_file(criteria_file: Path) -> str:
    with open(criteria_file, "r", encoding="utf-8") as f:
        return f.read().strip()


def get_stock_metrics(symbol: str) -> dict:
    symbol = symbol.strip().upper()
    if not symbol:
        raise ValueError("Empty symbol")

    ticker = yf.Ticker(symbol)

    hist_1y = ticker.history(period="1y", interval="1d")
    if hist_1y.empty:
        raise ValueError(f"No 1-year history found for {symbol}")

    latest = hist_1y.tail(1)
    latest_date = latest.index[0].strftime("%Y-%m-%d")
    close_price = float(latest["Close"].iloc[0])

    low_52_week = float(hist_1y["Low"].min())
    high_52_week = float(hist_1y["High"].max())

    info = ticker.info or {}

    return {
        "symbol": symbol,
        "date": latest_date,
        "close_price": close_price,
        "low_52_week": low_52_week,
        "high_52_week": high_52_week,
        "trailing_pe": info.get("trailingPE"),
        "forward_pe": info.get("forwardPE"),
        "profit_margin": info.get("profitMargins"),
        "operating_margin": info.get("operatingMargins"),
        "revenue_growth": info.get("revenueGrowth"),
        "earnings_growth": info.get("earningsGrowth"),
        "market_cap": info.get("marketCap"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
    }


def get_market_context() -> dict:
    spy = yf.Ticker("SPY").history(period="6mo", interval="1d")
    vix = yf.Ticker("^VIX").history(period="1mo", interval="1d")

    spy_latest = float(spy["Close"].iloc[-1]) if not spy.empty else None
    spy_20dma = float(spy["Close"].tail(20).mean()) if len(spy) >= 20 else None
    spy_50dma = float(spy["Close"].tail(50).mean()) if len(spy) >= 50 else None
    vix_latest = float(vix["Close"].iloc[-1]) if not vix.empty else None

    market_trend = "unknown"
    if spy_latest is not None and spy_20dma is not None and spy_50dma is not None:
        if spy_latest > spy_20dma > spy_50dma:
            market_trend = "bullish"
        elif spy_latest < spy_20dma < spy_50dma:
            market_trend = "bearish"
        else:
            market_trend = "mixed"

    return {
        "spy_latest": spy_latest,
        "spy_20dma": spy_20dma,
        "spy_50dma": spy_50dma,
        "vix_latest": vix_latest,
        "market_trend": market_trend,
    }


def write_raw_metrics_file(metrics: dict) -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    out_path = RAW_DIR / f"data.{metrics['symbol']}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)
    return out_path


def write_report_file(symbol: str, content: str) -> Path:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = REPORTS_DIR / f"{symbol.upper()}.txt"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")
    return out_path


@tool("get_stock_metrics", "Get current Yahoo Finance metrics for a stock symbol", {"symbol": str})
async def mcp_get_stock_metrics(args):
    symbol = args["symbol"]
    metrics = get_stock_metrics(symbol)
    raw_path = write_raw_metrics_file(metrics)
    return {
        "content": [
            {
                "type": "text",
                "text": json.dumps(
                    {
                        "raw_file": str(raw_path),
                        "metrics": metrics,
                    },
                    indent=2,
                ),
            }
        ]
    }


@tool("get_market_context", "Get broad market context using SPY and VIX", {})
async def mcp_get_market_context(args):
    context = get_market_context()
    return {
        "content": [
            {
                "type": "text",
                "text": json.dumps(context, indent=2),
            }
        ]
    }


@tool(
    "write_stock_report",
    "Write a stock decision report to the reports directory",
    {"symbol": str, "content": str},
)
async def mcp_write_stock_report(args):
    out_path = write_report_file(args["symbol"], args["content"])
    return {
        "content": [
            {
                "type": "text",
                "text": f"Wrote report file: {out_path}",
            }
        ]
    }


def build_prompt(symbol: str, criteria_text: str) -> str:
    return f"""
Analyze the stock symbol {symbol}.

You must:
1. Call get_stock_metrics for {symbol}
2. Call get_market_context
3. Decide one of: BUY, WATCH, NOT_BUY
4. Base the reasoning only on the returned tool data and the criteria below
5. Then call write_stock_report with the final report text

Buying criteria:
{criteria_text}

Required report format:

Symbol: {symbol}
Date: <date from metrics>
Decision: <BUY or WATCH or NOT_BUY>

Reasoning:
- <reason 1>
- <reason 2>
- <reason 3>

Metrics Used:
- Close Price: <value>
- 52 Week Low: <value>
- 52 Week High: <value>
- Trailing PE: <value>
- Forward PE: <value>
- Revenue Growth: <value>
- Earnings Growth: <value>
- Profit Margin: <value>
- Operating Margin: <value>
- Market Trend: <value>
- VIX: <value>

Rules:
- Do not invent missing data.
- If something is missing, say "missing".
- Keep the reasoning concise.
- Use write_stock_report exactly once after you have the final report text.
"""


async def analyze_symbol(client: ClaudeSDKClient, symbol: str, criteria_text: str) -> str:
    prompt = build_prompt(symbol, criteria_text)
    await client.query(prompt)

    collected_text = []

    async for msg in client.receive_response():
        if isinstance(msg, AssistantMessage):
            for block in msg.content:
                if isinstance(block, TextBlock):
                    collected_text.append(block.text)

    return "\n".join(collected_text).strip()


async def async_main():
    symbols = read_symbols_file(STOCKS_FILE)
    criteria_text = read_criteria_file(CRITERIA_FILE)

    sdk_server = create_sdk_mcp_server(
        name="stockwiz",
        version="1.0.0",
        tools=[
            mcp_get_stock_metrics,
            mcp_get_market_context,
            mcp_write_stock_report,
        ],
    )

    options = ClaudeAgentOptions(
        mcp_servers={"stockwiz": sdk_server},
        allowed_tools=[
            "mcp__stockwiz__get_stock_metrics",
            "mcp__stockwiz__get_market_context",
            "mcp__stockwiz__write_stock_report",
        ],
        max_turns=8,
        system_prompt=(
            "You are a disciplined stock analysis assistant. "
            "Use only tool-returned data and the criteria provided. "
            "Do not fabricate missing values."
        ),
    )

    async with ClaudeSDKClient(options=options) as client:
        for symbol in symbols:
            print(f"Analyzing {symbol} ...")
            text = await analyze_symbol(client, symbol, criteria_text)
            if text:
                print(text)
                print("-" * 60)


if __name__ == "__main__":
    import anyio

    anyio.run(async_main)