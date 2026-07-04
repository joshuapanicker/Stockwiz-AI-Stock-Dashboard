import { useState, useEffect } from "react";
import clsx from "clsx";
import { ArrowLeft, SlidersHorizontal, Bell, Shield, RefreshCw, User, ChevronDown, Check, Building2 } from "lucide-react";
import CriteriaBuilder, { type CriteriaConfig } from "./CriteriaBuilder";
import AlertsEditor from "./AlertsEditor";
import PlaidConnect from "./PlaidConnect";
import { apiFetch, useProfile } from "../hooks/useApi";

type SettingsTab = "profile" | "criteria" | "notifications" | "brokerage" | "security";

interface Props {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "profile",       label: "Investment Profile", icon: <User size={14} /> },
  { id: "criteria",      label: "Screening Criteria", icon: <SlidersHorizontal size={14} /> },
  { id: "notifications", label: "Alerts",             icon: <Bell size={14} /> },
  { id: "brokerage",     label: "Brokerage",          icon: <Building2 size={14} /> },
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

      <div className="grid grid-cols-2 gap-5">
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
export default function SettingsPage({ open, onClose, initialTab = "criteria" }: Props) {
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

      <div className="flex flex-1 min-h-0">

        {/* Sidebar tabs */}
        <div className="w-52 flex-shrink-0 border-r border-border/50 py-4 px-3 space-y-1">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={clsx(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors text-left",
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
        <div className="flex-1 min-w-0 overflow-y-auto px-8 py-6">

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
              <PlaidConnect />
            </div>
          )}

          {/* ── Security (stub) ── */}
          {activeTab === "security" && (
            <div className="max-w-2xl">
              <h2 className="text-white font-bold text-xl mb-2">Security</h2>
              <p className="text-muted text-sm mb-8">Manage your password and active sessions.</p>
              <div className="bg-card2 rounded-2xl border border-border/40 px-6 py-8 flex flex-col items-center gap-3 text-center">
                <Shield size={28} className="text-muted" />
                <p className="text-white font-semibold">Coming Soon</p>
                <p className="text-muted text-sm max-w-xs">
                  Password reset and session management will be available in a future update.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
