/**
 * AlertsEditor — manage price and criteria-based stock alerts.
 * Lives in Settings → Notifications tab.
 */
import { useState } from "react";
import clsx from "clsx";
import {
  Bell, Plus, Trash2, ToggleLeft, ToggleRight, RefreshCw,
  TrendingUp, TrendingDown, Zap, Eye, Check, AlertCircle,
} from "lucide-react";
import { useAlerts } from "../hooks/useApi";

const ALERT_TYPES = [
  { value: "price_below",          label: "Price drops below",       icon: <TrendingDown size={13} />, needsThreshold: true,  hint: "e.g. notify me when AAPL drops below $250" },
  { value: "price_above",          label: "Price rises above",       icon: <TrendingUp   size={13} />, needsThreshold: true,  hint: "e.g. notify me when NVDA breaks above $1000" },
  { value: "meets_buy_criteria",   label: "Meets my buy criteria",   icon: <Zap          size={13} />, needsThreshold: false, hint: "Fires when the stock passes all your buy rules" },
  { value: "meets_watch_criteria", label: "Meets my watch criteria", icon: <Eye          size={13} />, needsThreshold: false, hint: "Fires when the stock passes your watch rules" },
];

function AlertTypeBadge({ type }: { type: string }) {
  const t = ALERT_TYPES.find(a => a.value === type);
  const colors: Record<string, string> = {
    price_below:          "bg-red/10 text-red border-red/20",
    price_above:          "bg-green/10 text-green border-green/20",
    meets_buy_criteria:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
    meets_watch_criteria: "bg-purple/10 text-purple-300 border-purple/20",
  };
  return (
    <span className={clsx("flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium", colors[type] ?? "bg-white/10 text-muted border-border")}>
      {t?.icon} {t?.label ?? type}
    </span>
  );
}

function AddAlertForm({ onCreate, onCancel }: {
  onCreate: (symbol: string, type: string, threshold?: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [symbol, setSymbol] = useState("");
  const [alertType, setAlertType] = useState("price_below");
  const [threshold, setThreshold] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedType = ALERT_TYPES.find(t => t.value === alertType)!;

  async function handleCreate() {
    if (!symbol.trim()) { setError("Enter a stock symbol"); return; }
    if (selectedType.needsThreshold && !threshold) { setError("Enter a price threshold"); return; }
    setSaving(true);
    setError("");
    try {
      await onCreate(
        symbol.trim().toUpperCase(),
        alertType,
        selectedType.needsThreshold ? parseFloat(threshold) : undefined
      );
    } catch (e: any) {
      setError(e.message || "Failed to create alert");
    } finally {
      setSaving(false);
    }
  }

  const inp = "w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-green/40 placeholder-muted";

  return (
    <div className="bg-card2 border border-border/60 rounded-2xl p-5 space-y-4 anim-fade-down">
      <p className="text-white font-semibold text-sm">New Alert</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted block mb-1.5">Stock symbol</label>
          <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
            placeholder="e.g. AAPL" className={`${inp} font-mono`} />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1.5">Alert type</label>
          <select value={alertType} onChange={e => setAlertType(e.target.value)} className={inp}>
            {ALERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {selectedType.needsThreshold && (
        <div>
          <label className="text-xs text-muted block mb-1.5">Price threshold ($)</label>
          <input type="number" step="0.01" value={threshold} onChange={e => setThreshold(e.target.value)}
            placeholder="e.g. 250.00" className={inp} />
          <p className="text-muted text-[10px] mt-1">{selectedType.hint}</p>
        </div>
      )}
      {!selectedType.needsThreshold && (
        <p className="text-muted text-xs bg-card rounded-xl px-3 py-2 border border-border/40">
          {selectedType.hint}
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red text-xs">
          <AlertCircle size={12} /> {error}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button onClick={handleCreate} disabled={saving}
          className="flex items-center gap-2 bg-green/15 hover:bg-green/25 disabled:opacity-50 border border-green/30 text-green rounded-xl px-4 py-2 text-sm font-semibold transition-colors">
          {saving ? <><RefreshCw size={12} className="animate-spin" /> Creating...</> : <><Plus size={12} /> Create Alert</>}
        </button>
        <button onClick={onCancel} className="text-muted hover:text-white text-sm transition-colors px-3">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function AlertsEditor() {
  const { data: alerts, loading, createAlert, deleteAlert, toggleAlert, checkAlerts } = useAlerts();
  const [showAdd, setShowAdd] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkResults, setCheckResults] = useState<any[] | null>(null);

  async function handleCheck() {
    setChecking(true);
    setCheckResults(null);
    try {
      const results = await checkAlerts();
      setCheckResults(results);
    } catch {}
    finally { setChecking(false); }
  }

  function formatDate(d: string | null) {
    if (!d) return "Never";
    const date = new Date(d);
    const diff = Date.now() - date.getTime();
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-white font-semibold text-sm mb-1">Stock Alerts</h3>
          <p className="text-muted text-xs">Get notified when a stock hits your price target or meets your criteria.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleCheck} disabled={checking}
            className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-border/50 text-muted hover:text-white rounded-xl px-3 py-1.5 text-xs transition-colors">
            {checking ? <RefreshCw size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            Check now
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 bg-green/10 hover:bg-green/20 border border-green/30 text-green rounded-xl px-3 py-1.5 text-xs font-medium transition-colors">
            <Plus size={11} /> Add Alert
          </button>
        </div>
      </div>

      {/* Check results banner */}
      {checkResults !== null && (
        <div className={clsx("rounded-xl px-4 py-3 border text-sm flex items-start gap-2",
          checkResults.length > 0
            ? "bg-green/5 border-green/20 text-white"
            : "bg-white/[0.02] border-border/40 text-muted")}>
          {checkResults.length > 0
            ? <><Zap size={14} className="text-green mt-0.5 flex-shrink-0" />
                <span><strong className="text-green">{checkResults.length} alert{checkResults.length > 1 ? "s" : ""} firing:</strong> {checkResults.map(r => r.symbol).join(", ")}</span>
              </>
            : <><Check size={14} className="mt-0.5 flex-shrink-0" /> No alerts triggered right now.</>
          }
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <AddAlertForm
          onCreate={async (symbol, type, threshold) => {
            await createAlert(symbol, type, threshold);
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Alert list */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted text-sm">
          <RefreshCw size={13} className="animate-spin" /> Loading alerts...
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-card2 rounded-2xl border border-border/40 px-6 py-10 flex flex-col items-center gap-3 text-center">
          <Bell size={24} className="text-muted" />
          <p className="text-white font-semibold">No alerts yet</p>
          <p className="text-muted text-sm max-w-xs">
            Add a price target or criteria-based alert to get notified when conditions are met.
          </p>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-green/10 hover:bg-green/20 border border-green/30 text-green rounded-xl px-4 py-2 text-sm font-medium transition-colors mt-2">
            <Plus size={13} /> Create your first alert
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert: any) => (
            <div key={alert.id} className={clsx(
              "flex items-center gap-4 px-4 py-3 rounded-xl border transition-all",
              alert.enabled ? "bg-white/[0.02] border-border/40" : "bg-white/[0.01] border-border/20 opacity-50"
            )}>
              {/* Symbol */}
              <div className="w-16 flex-shrink-0">
                <p className="text-white font-mono font-semibold text-sm">{alert.symbol}</p>
              </div>

              {/* Type badge */}
              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                <AlertTypeBadge type={alert.alert_type} />
                {alert.threshold != null && (
                  <span className="text-xs text-muted font-mono">@ ${alert.threshold.toFixed(2)}</span>
                )}
              </div>

              {/* Last triggered */}
              <div className="text-right flex-shrink-0">
                <p className="text-[10px] text-muted">Last triggered</p>
                <p className="text-xs text-white">{formatDate(alert.last_triggered)}</p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => toggleAlert(alert.id, !alert.enabled)}
                  className="text-muted hover:text-white transition-colors p-1">
                  {alert.enabled
                    ? <ToggleRight size={18} className="text-green" />
                    : <ToggleLeft size={18} />}
                </button>
                <button onClick={() => deleteAlert(alert.id)}
                  className="text-muted hover:text-red transition-colors p-1 rounded-lg hover:bg-red/10">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
