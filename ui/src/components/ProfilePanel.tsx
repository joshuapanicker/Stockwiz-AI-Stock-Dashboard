import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  X, LogOut, User, Mail, Calendar, TrendingUp, TrendingDown,
  Briefcase, Shield, Bell, Settings, ChevronRight, CircleDollarSign,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCredits } from "../hooks/useApi";
import type { SettingsTab } from "./SettingsPage";

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenSettings: (tab?: SettingsTab) => void;
  portfolioStats?: {
    holdings: number;
    netPnl: number | null;
    avgGain: number | null;
    sellSignals: number;
  };
}

function StatCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-card2 rounded-xl px-4 py-3 border border-border/40">
      <p className="text-muted text-[10px]">{label}</p>
      <p className={clsx("font-mono text-lg font-bold mt-0.5", color ?? "text-white")}>{value}</p>
      {sub && <p className="text-muted text-[10px] mt-0.5">{sub}</p>}
    </div>
  );
}

function MenuRow({ icon, label, sub, onClick, danger }: {
  icon: React.ReactNode; label: string; sub?: string; onClick?: () => void; danger?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={clsx(
        "w-full flex items-center gap-3 px-4 py-3 transition-colors text-left group",
        danger ? "hover:bg-red/10" : "hover:bg-white/5"
      )}>
      <div className={clsx(
        "w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
        danger ? "bg-red/10 text-red group-hover:bg-red/20" : "bg-white/5 text-muted group-hover:text-white"
      )}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className={clsx("text-sm font-medium", danger ? "text-red" : "text-white")}>{label}</p>
        {sub && <p className="text-muted text-xs mt-0.5">{sub}</p>}
      </div>
      {!danger && <ChevronRight size={14} className="text-muted group-hover:text-white transition-colors flex-shrink-0" />}
    </button>
  );
}

export default function ProfilePanel({ open, onClose, onOpenSettings, portfolioStats }: Props) {
  const { user, signOut } = useAuth();
  const { data: credits } = useCredits();

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "—";

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : "??";

  const pnlUp = (portfolioStats?.netPnl ?? 0) >= 0;
  const gainUp = (portfolioStats?.avgGain ?? 0) >= 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className={clsx(
          "fixed inset-0 z-40 transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        style={{ background: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div className={clsx(
        "fixed top-0 right-0 h-full w-80 z-50 flex flex-col bg-card border-l border-border/60 shadow-2xl transition-transform duration-300",
        open ? "translate-x-0" : "translate-x-full"
      )}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/50 flex-shrink-0">
          <p className="text-white font-semibold text-sm">Profile</p>
          <button onClick={onClose}
            className="text-muted hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Avatar + identity */}
          <div className="px-5 py-5 border-b border-border/40">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green/30 to-purple-500/20 border border-green/20 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-lg">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="text-white font-semibold text-sm truncate">{user?.email}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-green" />
                  <p className="text-green text-xs">Active</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="bg-card2 rounded-xl px-3 py-2.5 border border-border/40">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Mail size={11} className="text-muted" />
                  <p className="text-muted text-[10px]">Email</p>
                </div>
                <p className="text-white text-xs truncate">{user?.email}</p>
              </div>
              <div className="bg-card2 rounded-xl px-3 py-2.5 border border-border/40">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Calendar size={11} className="text-muted" />
                  <p className="text-muted text-[10px]">Member since</p>
                </div>
                <p className="text-white text-xs">{memberSince}</p>
              </div>
            </div>
          </div>

          {/* Portfolio summary */}
          <div className="px-5 py-4 border-b border-border/40">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Portfolio Summary</p>
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                label="Net P&L"
                value={portfolioStats?.netPnl != null
                  ? `${pnlUp ? "+" : ""}$${Math.abs(portfolioStats.netPnl).toFixed(2)}`
                  : "—"}
                sub="Unrealized"
                color={portfolioStats?.netPnl != null ? (pnlUp ? "text-green" : "text-red") : "text-muted"}
              />
              <StatCard
                label="Avg Return"
                value={portfolioStats?.avgGain != null
                  ? `${gainUp ? "+" : ""}${(portfolioStats.avgGain * 100).toFixed(2)}%`
                  : "—"}
                sub="Mean gain"
                color={portfolioStats?.avgGain != null ? (gainUp ? "text-green" : "text-red") : "text-muted"}
              />
              <StatCard
                label="Positions"
                value={String(portfolioStats?.holdings ?? 0)}
                sub="Active holdings"
              />
              <StatCard
                label="Sell Signals"
                value={String(portfolioStats?.sellSignals ?? 0)}
                sub={portfolioStats?.sellSignals ? "Action needed" : "All clear"}
                color={portfolioStats?.sellSignals ? "text-red" : "text-green"}
              />
            </div>
          </div>

          {/* Account actions */}
          <div className="py-2 border-b border-border/40">
            <p className="text-[10px] text-muted uppercase tracking-wider px-5 py-2">Account</p>
            <MenuRow
              icon={<Settings size={14} />}
              label="Settings"
              sub="Preferences, notifications"
              onClick={() => { onClose(); onOpenSettings("criteria"); }}
            />
            <MenuRow
              icon={<Bell size={14} />}
              label="Alerts"
              sub="Price & criteria notifications"
              onClick={() => { onClose(); onOpenSettings("notifications"); }}
            />
            <MenuRow
              icon={<Shield size={14} />}
              label="Security"
              sub="Password & sessions"
              onClick={() => { onClose(); onOpenSettings("security"); }}
            />
          </div>

          {/* AI Credits */}
          <div className="py-2 border-b border-border/40">
            <p className="text-[10px] text-muted uppercase tracking-wider px-5 py-2">AI Credits</p>
            <button onClick={() => { onClose(); onOpenSettings("credits"); }}
              className="w-full text-left mx-4 my-1 bg-card2 border border-border/40 rounded-xl px-4 py-3 hover:border-green/30 transition-colors"
              style={{ width: "calc(100% - 2rem)" }}>
              {!credits ? (
                <p className="text-muted text-xs">Loading...</p>
              ) : credits.unlimited ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-semibold">{credits.has_own_key ? "Own API Key" : "Unlimited Access"}</p>
                    <p className="text-muted text-xs mt-0.5">{credits.has_own_key ? "Unmetered usage" : "No usage cap on this account"}</p>
                  </div>
                  <div className="bg-green/15 text-green text-[10px] font-semibold px-2 py-0.5 rounded-full">
                    Active
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-white text-sm font-semibold">Free Tier</p>
                    <span className={clsx(
                      "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                      credits.exhausted ? "bg-red/15 text-red"
                        : credits.warning ? "bg-amber-500/15 text-amber-400"
                        : "bg-green/15 text-green"
                    )}>
                      {credits.exhausted ? "Exhausted" : credits.warning ? "Low" : "Active"}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className={clsx(
                      "h-full rounded-full transition-all",
                      credits.exhausted ? "bg-red" : credits.warning ? "bg-amber-400" : "bg-green"
                    )} style={{ width: `${Math.min(credits.pct_used * 100, 100)}%` }} />
                  </div>
                  <p className="text-muted text-[10px] mt-1.5">
                    {credits.tokens_used.toLocaleString()} / {credits.token_limit.toLocaleString()} tokens this month
                  </p>
                </>
              )}
            </button>
          </div>

          {/* Sign out */}
          <div className="py-2">
            <MenuRow
              icon={<LogOut size={14} />}
              label="Sign Out"
              onClick={() => { signOut(); onClose(); }}
              danger
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/40 flex-shrink-0">
          <p className="text-[10px] text-muted text-center">StockWiz · AI Stock Dashboard</p>
        </div>
      </div>
    </>
  );
}
