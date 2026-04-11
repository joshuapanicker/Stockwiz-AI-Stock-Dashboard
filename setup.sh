#!/bin/bash
set -e

echo "=== Installing system dependencies ==="
sudo apt update
sudo apt install -y python3 python3-pip nodejs npm

echo "=== Installing Python dependencies ==="
pip3 install fastapi uvicorn yfinance pydantic anthropic claude-agent-sdk --break-system-packages

echo "=== Installing Claude CLI ==="
sudo npm install -g @anthropic-ai/claude-code

echo "=== Installing frontend dependencies ==="
cd ui && npm install && cd ..

echo ""
echo "=== Setup complete ==="
echo "To start the app, run:"
echo "  ANTHROPIC_API_KEY=your-key python3 -m uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload"
echo "  cd ui && npm run dev -- --host"
