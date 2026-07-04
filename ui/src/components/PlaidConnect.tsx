/**
 * PlaidConnect — multi-account brokerage connection via Plaid Link.
 * - Lists all connected accounts with per-account Sync / Disconnect
 * - Disconnect shows a modal: option to also remove synced holdings
 * - "Add Another Account" button to link additional brokerages
 * - Also lets already-disconnected sources be cleaned up via onRequestRemoveSource
 */
import { useState, useCallback, useEffect } from "react";
import clsx from "clsx";
import { usePlaidLink } from "react-plaid-link";
import {
  Link2Off, RefreshCw, Building2, CheckCircle,
  AlertCircle, TrendingUp, PlusCircle, Trash2, X,
} from "lucide-react";
import { apiFetch } from "../hooks/useApi";

interface PlaidConnection {
  id: string;
  institution: string;
  updated_at?: string;
}

interface PlaidStatusResponse {
  connected: boolean;
  connections: PlaidConnection[];
}

interface PlaidHolding {
  symbol: string;
  quantity: number;
  cost_basis: number | null;
  current_value: number;
  institution_price: number;
  security_name: string;
  institution?: string;
}

interface Props {
  onHoldingsSynced?: (holdings: PlaidHolding[]) => void;
  /** Called after holdings are removed so parent can refresh portfolio */
  onHoldingsRemoved?: () => void;
}

// ── Disconnect confirmation modal ─────────────────────────────────────────
interface DisconnectModalProps {
  institution: string;
  onConfirm: (removeHoldings: boolean) => void;
  onCancel: () => void;
}
function DisconnectModal({ institution, onConfirm, onCancel }: DisconnectModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card2 border border-border/60 rounded-2xl p-6 w-[360px] shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <p className="text-white font-semibold text-sm">Disconnect {institution || "Brokerage"}?</p>
          <button onClick={onCancel} className="text-muted hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>
        <p className="text-muted text-xs leading-relaxed mb-5">
          Would you also like to remove the holdings that were synced from this account?
          If you connected the wrong brokerage, removing them keeps your portfolio clean.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onConfirm(true)}
            className="w-full flex items-center justify-center gap-2 bg-red/10 hover:bg-red/20 border border-red/30 text-red rounded-xl py-2.5 text-sm font-medium transition-colors"
          >
            <Trash2 size={13} /> Disconnect &amp; Remove Holdings
          </button>
          <button
            onClick={() => onConfirm(false)}
            className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-border/50 text-muted hover:text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
          >
            Disconnect Only
          </button>
          <button
            onClick={onCancel}
            className="w-full text-muted text-xs hover:text-white transition-colors py-1"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlaidConnect({ onHoldingsSynced, onHoldingsRemoved }: Props) {
  const [connections, setConnections] = useState<PlaidConnection[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [disconnecting, setDisconnecting] = useState<Record<string, boolean>>({});
  const [holdings, setHoldings] = useState<PlaidHolding[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Modal state
  const [pendingDisconnect, setPendingDisconnect] = useState<PlaidConnection | null>(null);

  // ── Load status ───────────────────────────────────────────────────────
  async function loadStatus() {
    try {
      const res = await apiFetch<PlaidStatusResponse>("/plaid/status");
      setConnections(res.connections ?? []);
    } catch (e: any) {
      console.error("Plaid status error:", e);
      setConnections([]);
    } finally {
      setLoadingStatus(false);
    }
  }

  useEffect(() => { loadStatus(); }, []);

  // ── Initiate new Plaid Link flow ──────────────────────────────────────
  async function initLink() {
    setAddingNew(true);
    setError(null);
    try {
      const { link_token } = await apiFetch<{ link_token: string }>("/plaid/link-token", { method: "POST" });
      if (!link_token) throw new Error("No link token returned");
      setLinkToken(link_token);
    } catch (e: any) {
      setError(e.message ?? "Failed to initialize Plaid");
      setAddingNew(false);
    }
  }

  // ── Plaid Link success ────────────────────────────────────────────────
  const onSuccess = useCallback(async (public_token: string, metadata: any) => {
    setError(null);
    try {
      const institution = metadata?.institution?.name ?? "";
      await apiFetch("/plaid/exchange", {
        method: "POST",
        body: JSON.stringify({ public_token, institution_name: institution }),
      });
      setLinkToken(null);
      await loadStatus();
      await syncAll();
    } catch (e: any) {
      setError(e.message ?? "Failed to connect account");
    } finally {
      setAddingNew(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { open: openPlaidLink, ready } = usePlaidLink({
    token: linkToken ?? null,
    onSuccess,
    onExit: () => { setLinkToken(null); setAddingNew(false); },
  });

  useEffect(() => {
    if (linkToken && ready) openPlaidLink();
  }, [linkToken, ready, openPlaidLink]);

  // ── Sync all connections ──────────────────────────────────────────────
  async function syncAll() {
    setError(null);
    try {
      const data = await apiFetch<{ connected: boolean; holdings: PlaidHolding[]; errors?: string[] }>("/plaid/holdings");
      if (data.connected && data.holdings.length > 0) {
        setHoldings(data.holdings);
        await Promise.allSettled(
          data.holdings.map(h =>
            apiFetch("/portfolio", {
              method: "POST",
              body: JSON.stringify({
                symbol: h.symbol,
                buy_date: new Date().toISOString().slice(0, 10),
                buy_price: h.cost_basis != null && h.quantity > 0
                  ? h.cost_basis / h.quantity
                  : null,
                shares: h.quantity,
                notes: `Synced from ${h.institution || "brokerage"}`,
              }),
            })
          )
        );
        onHoldingsSynced?.(data.holdings);
      }
      if (data.errors?.length) setError(data.errors.join("; "));
    } catch (e: any) {
      setError(e.message ?? "Failed to sync holdings");
    }
  }

  async function syncConnection(id: string) {
    setSyncing(prev => ({ ...prev, [id]: true }));
    setError(null);
    try {
      await syncAll();
    } finally {
      setSyncing(prev => ({ ...prev, [id]: false }));
    }
  }

  // ── Disconnect — called after modal confirmation ───────────────────────
  async function confirmDisconnect(removeHoldings: boolean) {
    if (!pendingDisconnect) return;
    const conn = pendingDisconnect;
    setPendingDisconnect(null);
    setDisconnecting(prev => ({ ...prev, [conn.id]: true }));
    try {
      await apiFetch(`/plaid/disconnect/${conn.id}?remove_holdings=${removeHoldings}`, { method: "DELETE" });
      setConnections(prev => prev.filter(c => c.id !== conn.id));
      if (removeHoldings) {
        setHoldings([]);
        onHoldingsRemoved?.();
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to disconnect");
    } finally {
      setDisconnecting(prev => ({ ...prev, [conn.id]: false }));
    }
  }

  function formatDate(d?: string) {
    if (!d) return "never";
    return new Date(d).toLocaleDateString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  if (loadingStatus) return (
    <div className="flex items-center gap-2 text-muted text-sm">
      <RefreshCw size={13} className="animate-spin" /> Loading...
    </div>
  );

  return (
    <>
      {/* Disconnect confirmation modal */}
      {pendingDisconnect && (
        <DisconnectModal
          institution={pendingDisconnect.institution}
          onConfirm={confirmDisconnect}
          onCancel={() => setPendingDisconnect(null)}
        />
      )}

      <div className="space-y-4">
        {/* Connected accounts */}
        {connections.length > 0 && (
          <div className="space-y-2">
            {connections.map(conn => (
              <div key={conn.id} className="rounded-2xl border bg-green/5 border-green/20 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-green/15 text-green flex items-center justify-center flex-shrink-0">
                  <CheckCircle size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">
                    {conn.institution || "Connected Brokerage"}
                  </p>
                  <p className="text-muted text-[11px] mt-0.5">Last synced {formatDate(conn.updated_at)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => syncConnection(conn.id)}
                    disabled={!!syncing[conn.id]}
                    className="flex items-center gap-1.5 text-xs text-muted hover:text-green bg-white/5 hover:bg-green/10 border border-border/50 hover:border-green/30 px-3 py-1.5 rounded-xl transition-colors"
                  >
                    <RefreshCw size={11} className={syncing[conn.id] ? "animate-spin text-green" : ""} />
                    {syncing[conn.id] ? "Syncing…" : "Sync"}
                  </button>
                  <button
                    onClick={() => setPendingDisconnect(conn)}
                    disabled={!!disconnecting[conn.id]}
                    className="flex items-center gap-1.5 text-xs text-red/70 hover:text-red bg-red/5 hover:bg-red/10 border border-red/20 px-3 py-1.5 rounded-xl transition-colors"
                  >
                    <Link2Off size={11} />
                    {disconnecting[conn.id] ? "…" : "Disconnect"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {connections.length === 0 && (
          <div className="rounded-2xl border bg-card2 border-border/40 p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/5 text-muted flex items-center justify-center flex-shrink-0">
              <Building2 size={18} />
            </div>
            <div className="flex-1">
              <p className="text-white font-semibold text-sm">No brokerage connected</p>
              <p className="text-muted text-xs mt-0.5">
                Connect your brokerage to automatically sync your real holdings into StockWiz
              </p>
            </div>
          </div>
        )}

        {/* Add connection button */}
        <button
          onClick={initLink}
          disabled={addingNew}
          className={clsx(
            "w-full flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors border",
            connections.length === 0
              ? "bg-green/10 hover:bg-green/20 border-green/30 text-green"
              : "bg-white/5 hover:bg-white/10 border-border/50 text-muted hover:text-white"
          )}
        >
          {addingNew
            ? <><RefreshCw size={13} className="animate-spin" /> Connecting…</>
            : <><PlusCircle size={13} /> {connections.length === 0 ? "Connect Brokerage" : "Add Another Account"}</>
          }
        </button>

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
              {holdings.map((h, i) => (
                <div key={`${h.symbol}-${i}`} className="flex items-center justify-between bg-card2 rounded-xl px-4 py-3 border border-border/30">
                  <div>
                    <p className="font-mono font-semibold text-white text-sm">{h.symbol}</p>
                    <p className="text-muted text-[10px] mt-0.5">
                      {h.security_name} · {h.quantity} shares{h.institution ? ` · ${h.institution}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-white text-sm">
                      ${h.current_value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </p>
                    {h.cost_basis != null && (
                      <p className="text-muted text-[10px]">
                        cost ${h.cost_basis.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                      </p>
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
              <span className="text-white font-medium">Sandbox mode:</span> Use test credentials when prompted.{" "}
              Username: <span className="font-mono text-white">user_good</span> ·{" "}
              Password: <span className="font-mono text-white">pass_good</span>
            </p>
          </div>
        )}
      </div>
    </>
  );
}
