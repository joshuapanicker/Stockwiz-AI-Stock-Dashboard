# StockWiz

AI-powered stock screening and portfolio management dashboard.

## Features

- **Stock Screener** — screens a configurable watchlist against buy/watch/sell criteria using live Yahoo Finance data
- **Interactive Charts** — candlestick, area, ROI, and depth-of-market charts
- **AI Stock Analysis** — Claude AI analyzes each stock with plain-English reasoning, streamed in real time
- **Stock Chat** — per-stock AI assistant with live metrics and 90-day price prediction
- **Market Assistant** — general financial AI chatbot with conversation history
- **Portfolio Tracker** — tracks holdings with P&L, allocation chart, and AI-powered sell signals

## Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** FastAPI + Python
- **AI:** Claude (Anthropic) — `claude-haiku-4-5-20251001`
- **Data:** Yahoo Finance via `yfinance`
- **Charts:** TradingView lightweight-charts + Recharts

## Setup

```bash
# Backend
pip3 install fastapi uvicorn yfinance pydantic anthropic

# Frontend
cd ui && npm install

# Run
ANTHROPIC_API_KEY=your-key python3 -m uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
cd ui && npm run dev
```

Open `http://localhost:5173`
