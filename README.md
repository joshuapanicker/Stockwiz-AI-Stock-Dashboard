# StockWiz

AI-powered stock screening and portfolio management dashboard.

StockWiz combines live market data from Yahoo Finance with Claude AI to automate stock analysis and portfolio decisions. The backend is built in Python with FastAPI and exposes a set of REST and Server-Sent Events (SSE) streaming endpoints. A custom criteria engine evaluates configurable buy, watch, and sell rules against real-time fundamentals — PE ratios, revenue growth, profit margins, 52-week positioning, and market trend — classifying each stock automatically. Claude AI is integrated directly into the analysis pipeline: it receives live metrics as context and returns structured reasoning streamed token-by-token to the frontend. The frontend is a React + TypeScript single-page app with TradingView's lightweight-charts for candlestick and area charts, and Recharts for ROI, depth-of-market, portfolio performance, and allocation visualizations. All AI responses stream in real time using a typewriter effect.

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

## Media

<img width="1710" height="980" alt="Screenshot 2026-04-11 at 3 26 21 PM" src="https://github.com/user-attachments/assets/52a1624b-3c6e-4c1f-9d86-cb0357a2c31f" />

<img width="1710" height="980" alt="Screenshot 2026-04-11 at 3 26 36 PM" src="https://github.com/user-attachments/assets/7b3b26b7-8572-4c64-85aa-e395e56fa845" />

<img width="1710" height="980" alt="Screenshot 2026-04-11 at 3 26 57 PM" src="https://github.com/user-attachments/assets/e1e852ec-816e-41fa-b5b7-8346df1295d2" />


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
