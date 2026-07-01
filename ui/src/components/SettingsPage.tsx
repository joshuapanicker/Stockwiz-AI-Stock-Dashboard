import { useState, useEffect } from "react";
import clsx from "clsx";
import { ArrowLeft, SlidersHorizontal, Bell, Shield, RefreshCw } from "lucide-react";
import CriteriaBuilder, { type CriteriaConfig } from "./CriteriaBuilder";
import { apiFetch } from "../hooks/useApi";

type SettingsTab = "criteria" | "notifications" | "security";

interface Props {
  open: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "criteria",      label: "Screening Criteria", icon: <SlidersHorizontal size={14} /> },
  { id: "notifications", label: "Notifications",      icon: <Bell size={14} /> },
  { id: "security",      label: "Security",           icon: <Shield size={14} /> },
];

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

          {/* ── Notifications (stub) ── */}
          {activeTab === "notifications" && (
            <div className="max-w-2xl">
              <h2 className="text-white font-bold text-xl mb-2">Notifications</h2>
              <p className="text-muted text-sm mb-8">Configure price alerts and criteria-based notifications.</p>
              <div className="bg-card2 rounded-2xl border border-border/40 px-6 py-8 flex flex-col items-center gap-3 text-center">
                <Bell size={28} className="text-muted" />
                <p className="text-white font-semibold">Coming Soon</p>
                <p className="text-muted text-sm max-w-xs">
                  Price alerts and criteria-based notifications will be available in a future update.
                </p>
              </div>
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
