# Stockbrook

AI-powered stock screening, portfolio management, and brokerage sync dashboard.

Stockbrook combines live market data from Yahoo Finance with Claude AI to automate stock analysis and portfolio decisions. The backend is built in Python with FastAPI and exposes REST and Server-Sent Events (SSE) streaming endpoints. A custom criteria engine evaluates configurable buy, watch, and sell rules against real-time fundamentals — P/E ratios, revenue growth, profit margins, 52-week positioning, and market trend — classifying each stock automatically. Claude AI is integrated directly into the analysis pipeline, receiving live metrics as context and returning structured reasoning streamed token-by-token to the frontend. The frontend is a React + TypeScript SPA with a dark trading-terminal aesthetic, TradingView lightweight-charts for candlestick and technical charts, and Recharts for portfolio and allocation visualizations.

**Live app:** [stockbrook.vercel.app](https://stockbrook-ai-stock-dashboard-five.vercel.app/)

---

## Features

### Stock Analysis
- **Live Screener** — screens a universe of 1,000+ stocks against configurable buy/watch/sell criteria using real-time Yahoo Finance fundamentals
- **Universe Agent** — natural language queries ("show me undervalued tech stocks") converted to structured filters via AI, returning ranked results with a streamed summary
- **Interactive Charts** — candlestick, area, ROI, volume profile, Bollinger Bands, MACD, and moving average charts, all switchable per slot
- **AI Stock Analysis** — Claude AI analyzes each stock with plain-English buy/sell reasoning, streamed in real time
- **Stock Chat** — per-stock AI assistant with live metrics context and price prediction
- **Financials Tab** — quarterly revenue and net income charts with YoY growth
- **News & Earnings** — recent headlines and earnings calendar per stock
- **AI Track Record** — every buy/sell verdict the AI issues is logged with the price at that moment; a public scoreboard tracks what actually happened 30/90/180 days later against real historical prices, benchmarked against SPY

### Portfolio
- **Portfolio Tracker** — tracks holdings with real-time P&L, cost basis, gain per share, and total value
- **Multi-select Bulk Delete** — checkbox-select multiple positions and remove them in one action
- **Instant Optimistic Deletes** — holdings disappear immediately from the UI; backend syncs in the background
- **Brokerage Source Badge** — holdings synced from a brokerage show a labeled badge (e.g. "Charles Schwab") so you always know where each position came from
- **Position Search** — adaptive search bar filters holdings by ticker or institution name in real time
- **Portfolio Performance Chart** — combined value over time across all holdings
- **Allocation Donut** — portfolio breakdown by current value
- **AI Sell Signals** — per-holding sell criteria evaluation with rule-by-rule breakdown and AI analysis

### Brokerage Integration (Plaid)
- **Multi-account Plaid Sync** — connect multiple brokerage accounts via Plaid Link; each shows as a separate card with its own Sync and Disconnect button
- **Add Another Account** — link additional brokerages at any time without replacing existing connections
- **Disconnect with Cleanup** — disconnect modal offers to also remove all holdings synced from that institution
- **Non-equity Filtering** — T-bills, bonds, mutual funds, and cash positions are automatically excluded from sync; only equities and ETFs are imported

### Personalization
- **Configurable Criteria** — fully editable buy, watch, and sell rule sets with per-rule thresholds, saved per user in Supabase
- **Investment Profile** — risk tolerance, preferred sectors, hold duration, max position size, and tax sensitivity settings
- **Price Alerts** — create price target and percentage-change alerts per stock with enable/disable toggle

### Auth & Data
- **Supabase Auth** — email/password sign-up and sign-in; all portfolio, criteria, and alert data persists per user
- **Universe Cache** — SQLite-backed background fetcher keeps 1,000+ stock metrics fresh without blocking requests
- **Background Pre-warm** — top watchlist stocks pre-fetched on server startup for near-instant first load

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | FastAPI + Python 3.12 |
| AI | Claude `claude-haiku-4-5-20251001` (Anthropic) |
| Auth & DB | Supabase (PostgreSQL + Row Level Security) |
| Market Data | Yahoo Finance via `yfinance` |
| Brokerage | Plaid (sandbox / production) |
| Charts | TradingView lightweight-charts + Recharts |
| Hosting | Railway (backend) + Vercel (frontend) |

---

## Screenshots

<img width="3420" height="1958" alt="image" src="https://github.com/user-attachments/assets/1fa9f456-db10-4e06-86e1-37bbb29659a8" />

<img width="1710" height="979" alt="Screenshot 2026-07-07 at 1 53 03 PM" src="https://github.com/user-attachments/assets/2c408ebe-aa47-40c8-9668-a77a57a830b8" />

<img width="1710" height="979" alt="Screenshot 2026-07-07 at 1 51 53 PM" src="https://github.com/user-attachments/assets/0f1c67d8-e2f0-4399-8f39-451f0e163a3b" />

<img width="1710" height="979" alt="Screenshot 2026-07-07 at 1 52 04 PM" src="https://github.com/user-attachments/assets/d88b74cb-d9f0-4fc1-8c01-92f1e621e814" />

---

## Local Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- A [Supabase](https://supabase.com) project with the schema from the `supabase_*.sql` files (see Database Setup below)
- An [Anthropic API key](https://console.anthropic.com)
- A [Plaid account](https://dashboard.plaid.com) (sandbox is free)

### Backend

```bash
pip install -r requirements.txt

# Copy and fill in your keys
cp .env.example .env
```

`.env` variables:
```
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox
```

```bash
python -m uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd ui
npm install
```

`ui/.env.local`:
```
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_PLAID_ENV=sandbox
```

```bash
npm run dev
```

Open `http://localhost:5173`

---

## Deployment

- **Backend** — push to `master`, Railway auto-deploys from the `Procfile`
- **Frontend** — push to `master`, Vercel auto-deploys from the `ui/` directory

README-only changes do not trigger a Vercel rebuild.

---

## Database Setup

Run the following SQL files in order in the Supabase SQL editor:

1. `supabase_setup.sql` — core tables (`portfolios`, `user_criteria`, `user_profiles`, `sold_positions`)
2. `supabase_alerts.sql` — `user_alerts` table
3. `supabase_plaid.sql` — `plaid_connections` table (multi-row, supports multiple accounts per user)
4. `supabase_credits.sql` — `user_ai_usage` and `user_api_keys` tables (AI credit metering, own-key opt-out)
5. `supabase_sold_positions.sql` — standalone `sold_positions` migration (only needed if `supabase_setup.sql` predates the sell-history feature)
6. `supabase_ai_calls.sql` — `ai_calls` table backing the public AI Track Record scoreboard
