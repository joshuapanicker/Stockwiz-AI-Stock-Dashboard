/**
 * PlaidConnect — brokerage account connection via Plaid Link.
 * Shows connection status and lets users connect/disconnect their brokerage.
 * Connected holdings are synced to the portfolio automatically.
 */
import { useState, useCallback, useEffect } from "react";
import clsx from "clsx";
import { usePlaidLink } from "react-plaid-link";
import { Link2, Link2Off, RefreshCw, Building2, CheckCircle, AlertCircle, TrendingUp } from "lucide-react";
import { apiFetch } from "../hooks/useApi";

interface PlaidStatus {
  connected: boolean;
  institution?: string;
  updated_at?: string;
}

interface PlaidHolding {
  symbol: string;
  quantity: number;
  cost_basis: number | null;
  current_value: number;
  institution_price: number;
  security_name: string;
}

interface Props {
  onHoldingsSynced?: (holdings: PlaidHolding[]) => void;
}

export default function PlaidConnect({ onHoldingsSynced }: Props) {
  const [status, setStatus] = useState<PlaidStatus | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [holdings, setHoldings] = useState<PlaidHolding[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Load connection status on mount
  useEffect(() => {
    apiFetch<PlaidStatus>("/plaid/status")
      .then(s => setStatus(s))
      .catch((e) => { console.error("Plaid status error:", e); setStatus({ connected: false }); });
  }, []);

  // Get link token when user wants to connect
  async function initLink() {
    setLoading(true);
    setError(null);
    try {
      const { link_token } = await apiFetch<{ link_token: string }>("/plaid/link-token", { method: "POST" });
      if (!link_token) throw new Error("No link token returned");
      setLinkToken(link_token);
    } catch (e: any) {
      setError(e.message ?? "Failed to initialize Plaid");
    } finally {
      setLoading(false);
    }
  }

  // Plaid Link success callback
  const onSuccess = useCallback(async (public_token: string, metadata: any) => {
    setLoading(true);
    setError(null);
    try {
      const institution = metadata?.institution?.name ?? "";
      await apiFetch("/plaid/exchange", {
        method: "POST",
        body: JSON.stringify({ public_token, institution_name: institution }),
      });
      setStatus({ connected: true, institution });
      setLinkToken(null);
      // Auto-sync holdings after connecting
      await syncHoldings();
    } catch (e: any) {
      setError(e.message ?? "Failed to connect account");
    } finally {
      setLoading(false);
    }
  }, []);

  const { open: openPlaidLink, ready } = usePlaidLink({
    token: linkToken ?? null,
    onSuccess,
    onExit: () => setLinkToken(null),
  });

  // Trigger Plaid Link when token is ready
  useEffect(() => {
    if (linkToken && ready) openPlaidLink();
  }, [linkToken, ready, openPlaidLink]);

  async function syncHoldings() {
    setSyncing(true);
    setError(null);
    try {
      const data = await apiFetch<{ connected: boolean; holdings: PlaidHolding[]; error?: string }>("/plaid/holdings");
      if (data.connected) {
        setHoldings(data.holdings);
        onHoldingsSynced?.(data.holdings);
      } else if (data.error) {
        setError(data.error);
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to sync holdings");
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    setLoading(true);
    try {
      await apiFetch("/plaid/disconnect", { method: "DELETE" });
      setStatus({ connected: false });
      setHoldings([]);
    } catch {}
    finally { setLoading(false); }
  }

  function formatDate(d?: string) {
    if (!d) return "";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  if (!status) return (
    <div className="flex items-center gap-2 text-muted text-sm">
      <RefreshCw size={13} className="animate-spin" /> Loading...
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Connection status card */}
      <div className={clsx(
        "rounded-2xl border p-5 flex items-start gap-4 transition-colors",
        status.connected ? "bg-green/5 border-green/20" : "bg-card2 border-border/40"
      )}>
        <div className={clsx(
          "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
          status.connected ? "bg-green/15 text-green" : "bg-white/5 text-muted"
        )}>
          {status.connected ? <CheckCircle size={18} /> : <Building2 size={18} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm">
            {status.connected ? (status.institution || "Brokerage connected") : "No brokerage connected"}
          </p>
          <p className="text-muted text-xs mt-0.5">
            {status.connected
              ? `Sync your real holdings automatically · Last updated ${formatDate(status.updated_at)}`
              : "Connect your brokerage to automatically sync your real holdings into StockWiz"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {status.connected && (
            <>
              <button onClick={syncHoldings} disabled={syncing}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-green bg-white/5 hover:bg-green/10 border border-border/50 hover:border-green/30 px-3 py-1.5 rounded-xl transition-colors">
                <RefreshCw size={11} className={syncing ? "animate-spin text-green" : ""} /> Sync
              </button>
              <button onClick={disconnect} disabled={loading}
                className="flex items-center gap-1.5 text-xs text-red/70 hover:text-red bg-red/5 hover:bg-red/10 border border-red/20 px-3 py-1.5 rounded-xl transition-colors">
                <Link2Off size={11} /> Disconnect
              </button>
            </>
          )}
          {!status.connected && (
            <button onClick={initLink} disabled={loading}
              className="flex items-center gap-2 bg-green/10 hover:bg-green/20 border border-green/30 text-green rounded-xl px-4 py-2 text-sm font-semibold transition-colors">
              {loading ? <><RefreshCw size={13} className="animate-spin" /> Connecting...</> : <><Link2 size={13} /> Connect Brokerage</>}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red/10 border border-red/20 rounded-xl px-3 py-2.5">
          <AlertCircle size={13} className="text-red flex-shrink-0 mt-0.5" />
          <p className="text-red text-xs">{error}</p>
        </div>
      )}

      {/* Holdings preview */}
      {holdings.length > 0 && (
        <div>
          <p className="text-xs text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <TrendingUp size={11} /> Synced Holdings ({holdings.length})
          </p>
          <div className="space-y-2">
            {holdings.map(h => (
              <div key={h.symbol} className="flex items-center justify-between bg-card2 rounded-xl px-4 py-3 border border-border/30">
                <div>
                  <p className="font-mono font-semibold text-white text-sm">{h.symbol}</p>
                  <p className="text-muted text-[10px] mt-0.5">{h.security_name} · {h.quantity} shares</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-white text-sm">${h.current_value.toLocaleString("en-US", { maximumFractionDigits: 2 })}</p>
                  {h.cost_basis && (
                    <p className="text-muted text-[10px]">cost ${h.cost_basis.toLocaleString("en-US", { maximumFractionDigits: 2 })}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sandbox note */}
      {import.meta.env.VITE_PLAID_ENV === "sandbox" && (
        <div className="bg-card2 border border-border/40 rounded-xl px-4 py-3">
          <p className="text-muted text-xs leading-relaxed">
            <span className="text-white font-medium">Sandbox mode:</span> Use test credentials when prompted.
            Username: <span className="font-mono text-white">user_good</span> · Password: <span className="font-mono text-white">pass_good</span>
          </p>
        </div>
      )}
    </div>
  );
}
