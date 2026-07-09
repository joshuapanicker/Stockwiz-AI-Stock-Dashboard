import { useState, useEffect } from "react";
import clsx from "clsx";
import { ArrowLeft, SlidersHorizontal, Bell, Shield, RefreshCw, User, ChevronDown, Check, Building2, AlertTriangle, Trash2, Zap, Eye, EyeOff, KeyRound, Target, Link2 } from "lucide-react";
import CriteriaBuilder, { type CriteriaConfig } from "./CriteriaBuilder";
import AlertsEditor from "./AlertsEditor";
import PlaidConnect from "./PlaidConnect";
import { apiFetch, useProfile, useCredits, useTrackRecord, type TrackRecordBucket } from "../hooks/useApi";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase";

export type SettingsTab = "profile" | "criteria" | "notifications" | "brokerage" | "security" | "credits" | "track_record";

interface Props {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
  onPortfolioSync?: () => void | Promise<void>;
}

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "profile",       label: "Investment Profile", icon: <User size={14} /> },
  { id: "criteria",      label: "Screening Criteria", icon: <SlidersHorizontal size={14} /> },
  { id: "notifications", label: "Alerts",             icon: <Bell size={14} /> },
  { id: "brokerage",     label: "Brokerage",          icon: <Building2 size={14} /> },
  { id: "credits",       label: "AI Credits",         icon: <Zap size={14} /> },
  { id: "track_record",  label: "AI Track Record",    icon: <Target size={14} /> },
  { id: "security",      label: "Security",           icon: <Shield size={14} /> },
];

// ── Investment Profile editor ─────────────────────────────────────────────

const SECTORS = [
  "Technology", "Healthcare", "Financial Services", "Consumer Cyclical",
  "Industrials", "Consumer Defensive", "Energy", "Basic Materials",
  "Real Estate", "Communication Services", "Utilities",
];

function ProfileEditor() {
  const { data: profile, loading, save } = useProfile();
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile && !form) setForm({ ...profile });
  }, [profile]);

  if (loading || !form) return (
    <div className="flex items-center gap-2 text-muted text-sm">
      <RefreshCw size={14} className="animate-spin" /> Loading profile...
    </div>
  );

  function set(k: string, v: any) {
    setForm((p: any) => ({ ...p, [k]: v }));
    setSaved(false);
  }

  function toggleSector(s: string) {
    const cur: string[] = form.preferred_sectors ?? [];
    set("preferred_sectors", cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s]);
  }

  async function handleSave() {
    setSaving(true);
    await save(form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const inp = "w-full bg-card border border-border rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-green/40";
  const labelCls = "text-xs text-muted block mb-1.5";

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-white font-semibold text-sm mb-1">Investment Style</h3>
        <p className="text-muted text-xs mb-4">This gets injected into every AI analysis and chat response, personalizing it to your strategy.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className={labelCls}>Risk Tolerance</label>
          <select value={form.risk_tolerance} onChange={e => set("risk_tolerance", e.target.value)} className={inp}>
            <option value="conservative">Conservative — capital preservation first</option>
            <option value="moderate">Moderate — balanced growth and safety</option>
            <option value="aggressive">Aggressive — maximize growth, accept volatility</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Typical Hold Duration</label>
          <select value={form.hold_duration} onChange={e => set("hold_duration", e.target.value)} className={inp}>
            <option value="short">Short-term (days to weeks)</option>
            <option value="medium">Medium-term (months)</option>
            <option value="long">Long-term (1+ years)</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Max Position Size ($)</label>
          <input type="number" value={form.max_position_usd ?? 5000}
            onChange={e => set("max_position_usd", parseFloat(e.target.value) || 0)}
            placeholder="5000" className={inp} />
          <p className="text-muted text-[10px] mt-1">AI will flag positions that exceed this amount</p>
        </div>

        <div>
          <label className={labelCls}>Tax Sensitivity</label>
          <div className="flex items-center gap-3 mt-2">
            <button onClick={() => set("tax_sensitive", true)}
              className={clsx("flex-1 py-2 rounded-xl text-sm font-medium border transition-colors",
                form.tax_sensitive ? "bg-green/10 text-green border-green/30" : "bg-card2 text-muted border-border")}>
              Tax-sensitive
            </button>
            <button onClick={() => set("tax_sensitive", false)}
              className={clsx("flex-1 py-2 rounded-xl text-sm font-medium border transition-colors",
                !form.tax_sensitive ? "bg-green/10 text-green border-green/30" : "bg-card2 text-muted border-border")}>
              Not a priority
            </button>
          </div>
          <p className="text-muted text-[10px] mt-1">Affects short vs long-term gain advice</p>
        </div>
      </div>

      <div>
        <label className={labelCls}>Preferred Sectors <span className="text-muted">(optional — AI avoids others when flagging)</span></label>
        <div className="flex flex-wrap gap-2 mt-1">
          {SECTORS.map(s => (
            <button key={s} onClick={() => toggleSector(s)}
              className={clsx("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors",
                (form.preferred_sectors ?? []).includes(s)
                  ? "bg-green/10 text-green border-green/30"
                  : "bg-card2 text-muted border-border hover:border-green/20 hover:text-white")}>
              {(form.preferred_sectors ?? []).includes(s) && <Check size={10} />}
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Notes for AI <span className="text-muted">(anything about your strategy, constraints, or goals)</span></label>
        <textarea value={form.notes ?? ""} onChange={e => set("notes", e.target.value)}
          placeholder="e.g. I avoid Chinese stocks, prefer dividend payers, never buy on margin..."
          rows={3}
          className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green/40 resize-none placeholder-muted" />
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-border/40">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-green/15 hover:bg-green/25 disabled:opacity-50 border border-green/30 text-green rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors">
          {saving ? <><RefreshCw size={13} className="animate-spin" /> Saving...</> : "Save Profile"}
        </button>
        {saved && <span className="text-green text-sm flex items-center gap-1.5"><Check size={13} /> Saved</span>}
      </div>
    </div>
  );
}
// ── AI Track Record ──────────────────────────────────────────────────────

const HORIZONS: { key: "30d" | "90d" | "180d"; label: string }[] = [
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "180d", label: "180 days" },
];

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

function TrackRecordCard({ action, horizon, bucket }: {
  action: "buy" | "sell"; horizon: string; bucket?: TrackRecordBucket;
}) {
  const hasData = !!bucket && bucket.count > 0;
  const winUp = (bucket?.win_rate ?? 0) >= 0.5;
  return (
    <div className="bg-card2 rounded-2xl border border-border/40 px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className={clsx(
          "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full",
          action === "buy" ? "bg-green/10 text-green" : "bg-red/10 text-red"
        )}>
          {action}
        </span>
        <span className="text-muted text-[10px]">{horizon}</span>
      </div>
      {!hasData ? (
        <p className="text-muted text-xs py-2">Not enough resolved calls yet</p>
      ) : (
        <>
          <p className={clsx("font-mono text-2xl font-bold", (bucket!.avg_return ?? 0) >= 0 ? "text-green" : "text-red")}>
            {fmtPct(bucket!.avg_return)}
          </p>
          <p className="text-muted text-[10px] mt-0.5">avg return · {bucket!.count} call{bucket!.count === 1 ? "" : "s"}</p>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30 text-[11px]">
            <span className="text-muted">Win rate</span>
            <span className={clsx("font-mono font-semibold", winUp ? "text-green" : "text-white/70")}>
              {bucket!.win_rate != null ? `${(bucket!.win_rate * 100).toFixed(0)}%` : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1 text-[11px]">
            <span className="text-muted">vs SPY</span>
            <span className={clsx("font-mono font-semibold", (bucket!.avg_alpha_vs_spy ?? 0) >= 0 ? "text-green" : "text-red")}>
              {fmtPct(bucket!.avg_alpha_vs_spy)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function TrackRecordSection() {
  const { data, loading } = useTrackRecord();

  return (
    <div className="max-w-3xl">
      <h2 className="text-white font-bold text-xl mb-2">AI Track Record</h2>
      <p className="text-muted text-sm mb-8">
        Every time the AI recommends buying or selling a stock, that call is logged with the price
        at that moment — once per stock per day. This page shows what actually happened afterward,
        measured against real historical prices with SPY shown alongside as a benchmark. Nothing here
        is editable or removable after the fact.
      </p>

      {loading ? (
        <div className="bg-card2 rounded-2xl border border-border/40 px-6 py-8 text-center text-muted text-sm">
          Loading track record...
        </div>
      ) : !data || data.total_calls_logged === 0 ? (
        <div className="bg-card2 rounded-2xl border border-border/40 px-6 py-8 flex flex-col items-center gap-2 text-center">
          <Target size={24} className="text-muted" />
          <p className="text-white font-semibold text-sm">No calls logged yet</p>
          <p className="text-muted text-xs max-w-xs">
            This just started tracking — every buy/sell verdict the AI issues from now on builds this
            record. Check back as calls resolve.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            {HORIZONS.map(h => (
              <TrackRecordCard key={`buy-${h.key}`} action="buy" horizon={h.label} bucket={data.summary[`buy_${h.key}`]} />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
            {HORIZONS.map(h => (
              <TrackRecordCard key={`sell-${h.key}`} action="sell" horizon={h.label} bucket={data.summary[`sell_${h.key}`]} />
            ))}
          </div>

          {data.recent_calls.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Recent calls</p>
              <div className="bg-card2 rounded-2xl border border-border/40 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted border-b border-border/40 text-[10px]">
                      <th className="text-left py-2 px-3 font-medium">Symbol</th>
                      <th className="text-left py-2 px-3 font-medium">Call</th>
                      <th className="text-left py-2 px-3 font-medium">Date</th>
                      <th className="text-right py-2 px-3 font-medium">30d</th>
                      <th className="text-right py-2 px-3 font-medium">90d</th>
                      <th className="text-right py-2 px-3 font-medium">180d</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_calls.slice(0, 20).map((c, i) => (
                      <tr key={`${c.symbol}-${c.call_date}-${i}`} className="border-b border-border/20 last:border-0">
                        <td className="py-2 px-3 font-mono font-semibold text-white">{c.symbol}</td>
                        <td className="py-2 px-3">
                          <span className={clsx(
                            "text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded",
                            c.action === "buy" ? "bg-green/10 text-green" : "bg-red/10 text-red"
                          )}>
                            {c.action}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-muted">{c.call_date}</td>
                        {(["30d", "90d", "180d"] as const).map(h => {
                          const v = (c as any)[`return_${h}`] as number | undefined;
                          return (
                            <td key={h} className={clsx("py-2 px-3 text-right font-mono",
                              v == null ? "text-muted" : v >= 0 ? "text-green" : "text-red")}>
                              {v == null ? "pending" : fmtPct(v)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── AI Credits ─────────────────────────────────────────────────────────────

function AiCreditsSection() {
  const { data: credits, loading, setKey, removeKey, keyError, savingKey } = useCredits();
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function handleSetKey(e: React.FormEvent) {
    e.preventDefault();
    const ok = await setKey(keyInput.trim());
    if (ok) setKeyInput("");
  }

  async function handleRemoveKey() {
    setRemoving(true);
    try { await removeKey(); }
    finally { setRemoving(false); }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-white font-bold text-xl mb-2">AI Credits</h2>
      <p className="text-muted text-sm mb-8">
        Every account gets a free monthly allowance of Claude AI usage — used for stock analysis, chat,
        predictions, and natural-language search. Add your own Anthropic API key for unlimited, unmetered usage.
      </p>

      {loading || !credits ? (
        <div className="bg-card2 rounded-2xl border border-border/40 px-6 py-8 text-center text-muted text-sm">
          Loading usage...
        </div>
      ) : credits.has_own_key ? (
        <div className="bg-green/5 border border-green/20 rounded-2xl px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-green/15 text-green flex items-center justify-center flex-shrink-0">
                <KeyRound size={16} />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Using your own API key</p>
                <p className="text-muted text-xs mt-0.5">Unmetered — billed directly to your Anthropic account</p>
              </div>
            </div>
            <button onClick={handleRemoveKey} disabled={removing}
              className="text-xs font-semibold text-muted hover:text-red disabled:opacity-40 transition-colors px-3 py-2">
              {removing ? "Removing..." : "Remove"}
            </button>
          </div>
        </div>
      ) : credits.unlimited ? (
        <div className="bg-green/5 border border-green/20 rounded-2xl px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green/15 text-green flex items-center justify-center flex-shrink-0">
              <Zap size={16} />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Unlimited access</p>
              <p className="text-muted text-xs mt-0.5">This account has no usage cap</p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="bg-card2 rounded-2xl border border-border/40 px-6 py-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white font-semibold text-sm">
                {credits.tokens_used.toLocaleString()} / {credits.token_limit.toLocaleString()} tokens used
              </p>
              <span className={clsx(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                credits.exhausted ? "bg-red/15 text-red"
                  : credits.warning ? "bg-amber-500/15 text-amber-400"
                  : "bg-green/15 text-green"
              )}>
                {credits.exhausted ? "Exhausted" : credits.warning ? "Running low" : "Active"}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className={clsx(
                "h-full rounded-full transition-all",
                credits.exhausted ? "bg-red" : credits.warning ? "bg-amber-400" : "bg-green"
              )} style={{ width: `${Math.min(credits.pct_used * 100, 100)}%` }} />
            </div>
            <p className="text-muted text-xs mt-3">
              Resets monthly ({credits.period}).
              {credits.exhausted && " You're out of free credits — AI features are paused until next month or you add your own key below."}
              {!credits.exhausted && credits.warning && " You're close to your monthly limit."}
            </p>
          </div>

          <form onSubmit={handleSetKey} className="bg-card2 rounded-2xl border border-border/40 px-6 py-5">
            <p className="text-white font-semibold text-sm mb-1">Add your own Anthropic API key</p>
            <p className="text-muted text-xs mb-4">
              Get one at <span className="text-white/70">console.anthropic.com</span>. Your key is stored securely
              and never shown again after saving.
            </p>
            <div className="flex items-center gap-2 bg-bg border border-border rounded-xl px-3 py-2.5 focus-within:border-green/40 transition-colors mb-3">
              <input
                type={showKey ? "text" : "password"}
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder="sk-ant-..."
                autoComplete="off"
                className="flex-1 bg-transparent text-sm text-white placeholder-muted focus:outline-none font-mono" />
              <button type="button" onClick={() => setShowKey(v => !v)}
                className="text-muted hover:text-white transition-colors flex-shrink-0">
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {keyError && <p className="text-red text-xs mb-3">{keyError}</p>}
            <button type="submit" disabled={!keyInput.trim() || savingKey}
              className="flex items-center gap-2 text-xs font-semibold text-green bg-green/10 hover:bg-green/20 disabled:opacity-40 disabled:cursor-not-allowed border border-green/20 rounded-lg px-4 py-2.5 transition-colors">
              {savingKey ? <><RefreshCw size={13} className="animate-spin" /> Validating...</> : "Save key"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

// ── Connected accounts (identity linking) ─────────────────────────────────

function ConnectedAccountsSection() {
  const { linkGoogle } = useAuth();
  const [providers, setProviders] = useState<string[] | null>(null);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadIdentities() {
    const { data } = await supabase.auth.getUserIdentities();
    setProviders((data?.identities ?? []).map(i => i.provider));
  }

  useEffect(() => { loadIdentities(); }, []);

  const hasGoogle = providers?.includes("google") ?? false;

  async function handleLink() {
    setError(null);
    setLinking(true);
    const { error } = await linkGoogle();
    if (error) { setError(error); setLinking(false); }
    // On success Supabase redirects to Google, then back to the app.
  }

  return (
    <div className="bg-card2 rounded-2xl border border-border/40 px-6 py-5 mt-6">
      <p className="text-white font-semibold text-sm mb-1">Connected Accounts</p>
      <p className="text-muted text-xs mb-4">
        Link Google so you can sign in either way — your portfolio, criteria, and
        alerts all stay on this same account either way.
      </p>
      {providers === null ? (
        <p className="text-muted text-xs">Loading...</p>
      ) : hasGoogle ? (
        <div className="flex items-center gap-2 text-xs text-green bg-green/10 border border-green/20 rounded-lg px-3 py-2 w-fit">
          <Check size={13} /> Google account linked
        </div>
      ) : (
        <button onClick={handleLink} disabled={linking}
          className="flex items-center gap-2 text-xs font-semibold text-white bg-white/5 hover:bg-white/10 disabled:opacity-50 border border-border/50 rounded-lg px-4 py-2.5 transition-colors">
          {linking ? <RefreshCw size={13} className="animate-spin" /> : <Link2 size={13} />}
          {linking ? "Redirecting..." : "Link Google Account"}
        </button>
      )}
      {error && <p className="text-red text-xs mt-3">{error}</p>}
    </div>
  );
}

// ── Delete account ────────────────────────────────────────────────────────

function DeleteAccountSection() {
  const { signOut } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await apiFetch("/account", { method: "DELETE" });
      await signOut();
      window.location.reload();
    } catch (e: any) {
      setError(e.message ?? "Failed to delete account");
      setDeleting(false);
    }
  }

  return (
    <div className="bg-red/5 rounded-2xl border border-red/20 px-6 py-6 mt-6">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-red/10 text-red flex items-center justify-center flex-shrink-0">
          <AlertTriangle size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm">Delete Account</p>
          <p className="text-muted text-xs mt-1 mb-4">
            Permanently deletes your account, portfolio holdings, alerts, criteria,
            brokerage connections, and AI usage data. This cannot be undone.
          </p>

          {!confirming ? (
            <button onClick={() => setConfirming(true)}
              className="flex items-center gap-2 text-xs font-semibold text-red bg-red/10 hover:bg-red/20 border border-red/20 rounded-lg px-3 py-2 transition-colors">
              <Trash2 size={13} /> Delete my account
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-white text-xs">
                Type <span className="font-mono font-bold">DELETE</span> to confirm.
              </p>
              <input value={confirmText} onChange={e => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full bg-card2 border border-red/30 rounded-lg px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-red/60" />
              {error && <p className="text-red text-xs">{error}</p>}
              <div className="flex gap-2">
                <button onClick={handleDelete} disabled={confirmText !== "DELETE" || deleting}
                  className="flex items-center gap-2 text-xs font-semibold text-white bg-red hover:bg-red/90 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-3 py-2 transition-colors">
                  {deleting ? <><RefreshCw size={13} className="animate-spin" /> Deleting...</> : "Permanently delete"}
                </button>
                <button onClick={() => { setConfirming(false); setConfirmText(""); setError(null); }}
                  disabled={deleting}
                  className="text-xs font-semibold text-muted hover:text-white px-3 py-2 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage({ open, onClose, initialTab = "criteria", onPortfolioSync }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [criteria, setCriteria] = useState<CriteriaConfig | null>(null);
  const [loadingCriteria, setLoadingCriteria] = useState(false);

  // Sync tab when opened with a specific tab
  useEffect(() => { if (open) setActiveTab(initialTab); }, [open, initialTab]);

  // Load criteria when opening that tab
  useEffect(() => {
    if (!open || activeTab !== "criteria" || criteria) return;
    setLoadingCriteria(true);
    apiFetch<CriteriaConfig>("/criteria")
      .then(d => setCriteria(d))
      .catch(() => {})
      .finally(() => setLoadingCriteria(false));
  }, [open, activeTab, criteria]);

  async function saveCriteria(updated: CriteriaConfig) {
    await apiFetch("/criteria", {
      method: "PUT",
      body: JSON.stringify(updated),
    });
    setCriteria(updated);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col anim-fade-in">

      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border/50 flex-shrink-0">
        <button onClick={onClose}
          className="flex items-center gap-2 text-muted hover:text-white transition-colors text-sm">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="w-px h-5 bg-border/50" />
        <p className="text-white font-semibold">Settings</p>
      </div>

      <div className="flex flex-col md:flex-row flex-1 min-h-0">

        {/* Sidebar tabs — horizontal scrollable chips on mobile */}
        <div className="w-full md:w-52 flex-shrink-0 border-b md:border-b-0 md:border-r border-border/50 py-2 md:py-4 px-3 flex md:flex-col gap-1 md:gap-0 md:space-y-1 overflow-x-auto md:overflow-x-visible">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={clsx(
                "w-auto md:w-full flex items-center gap-2 md:gap-3 px-3 py-2 md:py-2.5 rounded-xl text-sm transition-colors text-left whitespace-nowrap flex-shrink-0",
                activeTab === t.id
                  ? "bg-green/10 text-green border border-green/20"
                  : "text-muted hover:text-white hover:bg-white/5"
              )}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 overflow-y-auto px-4 md:px-8 py-6">

          {/* ── Investment Profile ── */}
          {activeTab === "profile" && (
            <div className="max-w-2xl h-full flex flex-col">
              <div className="mb-6 flex-shrink-0">
                <h2 className="text-white font-bold text-xl">Investment Profile</h2>
                <p className="text-muted text-sm mt-1">
                  Define your investment style. These preferences are injected into every AI analysis
                  so responses are tailored to your strategy — not generic advice.
                </p>
              </div>
              <ProfileEditor />
            </div>
          )}

          {/* ── Screening Criteria ── */}
          {activeTab === "criteria" && (
            <div className="max-w-3xl h-full flex flex-col">
              <div className="mb-6 flex-shrink-0">
                <h2 className="text-white font-bold text-xl">Screening Criteria</h2>
                <p className="text-muted text-sm mt-1">
                  Define the rules that determine which stocks appear as Buy, Watch, or Sell signals.
                  Choose a preset to get started, then customize the rules to match your strategy.
                </p>
              </div>
              {loadingCriteria ? (
                <div className="flex items-center gap-2 text-muted text-sm">
                  <RefreshCw size={14} className="animate-spin" /> Loading your criteria...
                </div>
              ) : criteria ? (
                <div className="flex-1 min-h-0">
                  <CriteriaBuilder initialCriteria={criteria} onSave={saveCriteria} />
                </div>
              ) : (
                <div className="text-muted text-sm">Failed to load criteria.</div>
              )}
            </div>
          )}

          {/* ── Notifications ── */}
          {activeTab === "notifications" && (
            <div className="max-w-2xl">
              <div className="mb-6">
                <h2 className="text-white font-bold text-xl">Alerts & Notifications</h2>
                <p className="text-muted text-sm mt-1">
                  Set price targets or criteria-based triggers. Click "Check now" to evaluate your alerts against live data.
                </p>
              </div>
              <AlertsEditor />
            </div>
          )}

          {/* ── Brokerage ── */}
          {activeTab === "brokerage" && (
            <div className="max-w-2xl">
              <div className="mb-6">
                <h2 className="text-white font-bold text-xl">Brokerage Connection</h2>
                <p className="text-muted text-sm mt-1">
                  Connect your brokerage account to automatically sync your real holdings into StockWiz.
                  Your credentials are never stored — Plaid handles authentication directly with your bank.
                </p>
              </div>
              <PlaidConnect onHoldingsSynced={() => onPortfolioSync?.()} />
            </div>
          )}

          {/* ── AI Credits ── */}
          {activeTab === "credits" && <AiCreditsSection />}

          {/* ── AI Track Record ── */}
          {activeTab === "track_record" && <TrackRecordSection />}

          {/* ── Security ── */}
          {activeTab === "security" && (
            <div className="max-w-2xl">
              <h2 className="text-white font-bold text-xl mb-2">Security</h2>
              <p className="text-muted text-sm mb-8">Manage your password and account.</p>
              <div className="bg-card2 rounded-2xl border border-border/40 px-6 py-8 flex flex-col items-center gap-3 text-center">
                <Shield size={28} className="text-muted" />
                <p className="text-white font-semibold">Coming Soon</p>
                <p className="text-muted text-sm max-w-xs">
                  Password reset and session management will be available in a future update.
                </p>
              </div>
              <ConnectedAccountsSection />
              <DeleteAccountSection />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
