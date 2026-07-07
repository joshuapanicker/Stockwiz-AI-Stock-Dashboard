"""
StockWiz - main entry point.
Runs the screener and prints results to stdout (UI layer to be added).
"""

from __future__ import annotations

from core.criteria import get_watchlist
from core.screener import run_screen
from core.portfolio import get_holdings, compute_gain
from core.metrics import get_stock_metrics, get_market_context
from core.analysis import analyze_stock


def print_screen_results() -> None:
    print("Running screener...\n")
    results = run_screen()

    buy_stocks = [r for r in results if r.classification == "buy"]
    watch_stocks = [r for r in results if r.classification == "watch"]

    print(f"=== BUY ({len(buy_stocks)}) ===")
    for s in buy_stocks:
        price = s.metrics.get("close_price", "N/A")
        rules = f"{s.buy_result.get('rules_met', 0)}/{s.buy_result.get('rules_total', 0)}"
        print(f"  {s.symbol:8s}  ${price:<10}  rules met: {rules}")

    print(f"\n=== WATCH ({len(watch_stocks)}) ===")
    for s in watch_stocks:
        price = s.metrics.get("close_price", "N/A")
        rules = f"{s.watch_result.get('rules_met', 0)}/{s.watch_result.get('rules_total', 0)}"
        print(f"  {s.symbol:8s}  ${price:<10}  rules met: {rules}")


def print_analysis(symbol: str, action: str) -> None:
    print(f"\nAnalyzing {symbol} for {action.upper()}...\n")
    result = analyze_stock(symbol, action)
    print(result["analysis_text"])


def print_portfolio() -> None:
    holdings = get_holdings()
    if not holdings:
        print("Portfolio is empty.")
        return

    market = get_market_context()
    print(f"=== PORTFOLIO ({len(holdings)} holdings) ===\n")
    for h in holdings:
        symbol = h["symbol"]
        try:
            metrics = get_stock_metrics(symbol)
            current = metrics["close_price"]
            gain = compute_gain(h, current)
            gain_str = f"{gain['gain_pct']*100:+.1f}%" if gain["gain_pct"] is not None else "N/A"
            print(f"  {symbol:8s}  bought @ ${h['buy_price']}  now @ ${current:.2f}  gain: {gain_str}")
        except Exception as e:
            print(f"  {symbol:8s}  error: {e}")


if __name__ == "__main__":
    import sys

    if len(sys.argv) == 1:
        print_screen_results()
    elif sys.argv[1] == "portfolio":
        print_portfolio()
    elif sys.argv[1] == "analyze" and len(sys.argv) == 4:
        print_analysis(sys.argv[2], sys.argv[3])
    else:
        print("Usage:")
        print("  python main.py                        # run screener")
        print("  python main.py portfolio              # view portfolio")
        print("  python main.py analyze AAPL buy       # analyze a stock")
