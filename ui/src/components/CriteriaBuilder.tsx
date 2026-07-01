/**
 * CriteriaBuilder — visual rule editor for buy / watch / sell screening criteria.
 * Users can pick a preset, add/edit/delete rules, and set the min_rules_met threshold.
 */
import { useState, useCallback } from "react";
import clsx from "clsx";
import {
  Plus, Trash2, Save, RefreshCw, CheckCircle, AlertCircle,
  Zap, TrendingUp, BarChart2, Target, DollarSign, ShieldCheck,
} from "lucide-react";
import { apiFetch } from "../hooks/useApi";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CriteriaRule {
  id: string;
  description: string;
  field: string;
  operator: string;
  value: number | string;
}

export interface CriteriaMode {
  description: string;
  rules: CriteriaRule[];
  min_rules_met: number;
}

export interface CriteriaConfig {
  buy: CriteriaMode;
  watch: CriteriaMode;
  sell: CriteriaMode;
}

// ── Available fields ───────────────────────────────────────────────────────

const FIELDS: { value: string; label: string; type: "number" | "string"; hint: string }[] = [
  { value: "distance_to_low_pct",  label: "Distance from 52W Low (%)",  type: "number", hint: "e.g. 0.20 = within 20% of low" },
  { value: "distance_to_high_pct", label: "Distance from 52W High (%)", type: "number", hint: "e.g. 0.10 = within 10% of high" },
  { value: "forward_pe",           label: "Forward P/E Ratio",          type: "number", hint: "e.g. 25 = forward PE under 25" },
  { value: "trailing_pe",          label: "Trailing P/E Ratio",         type: "number", hint: "e.g. 50 = trailing PE under 50" },
  { value: "revenue_growth",       label: "Revenue Growth (decimal)",   type: "number", hint: "e.g. 0.10 = 10% growth" },
  { value: "earnings_growth",      label: "Earnings Growth (decimal)",  type: "number", hint: "e.g. 0.05 = 5% growth" },
  { value: "profit_margin",        label: "Profit Margin (decimal)",    type: "number", hint: "e.g. 0.05 = 5% margin" },
  { value: "operating_margin",     label: "Operating Margin (decimal)", type: "number", hint: "e.g. 0.10 = 10% margin" },
  { value: "market_cap",           label: "Market Cap ($)",             type: "number", hint: "e.g. 1000000000 = $1B" },
  { value: "market_trend",         label: "Market Trend",               type: "string", hint: "bullish / bearish / mixed" },
  { value: "gain_pct",             label: "Portfolio Gain % (decimal)", type: "number", hint: "e.g. 0.40 = 40% gain (sell only)" },
];

const OPERATORS_NUM  = [
  { value: "lt",  label: "< less than" },
  { value: "lte", label: "≤ at most" },
  { value: "gt",  label: "> greater than" },
  { value: "gte", label: "≥ at least" },
];
const OPERATORS_STR = [
  { value: "eq",  label: "= equals" },
  { value: "neq", label: "≠ not equals" },
];

// ── Preset templates ───────────────────────────────────────────────────────

interface Preset { id: string; label: string; description: string; icon: React.ReactNode; criteria: CriteriaConfig; }

const PRESETS: Preset[] = [
  {
    id: "value",
    label: "Value Investor",
    description: "Stocks near 52W lows with reasonable PE and positive margins",
    icon: <DollarSign size={16} />,
    criteria: {
      buy: {
        description: "Value buy criteria",
        min_rules_met: 4,
        rules: [
          { id: "near_low", description: "Within 20% of 52-week low", field: "distance_to_low_pct", operator: "lt", value: 0.20 },
          { id: "low_pe", description: "Forward PE below 20", field: "forward_pe", operator: "lt", value: 20 },
          { id: "profit", description: "Positive profit margin", field: "profit_margin", operator: "gt", value: 0.0 },
          { id: "revenue", description: "Positive revenue growth", field: "revenue_growth", operator: "gt", value: 0.0 },
          { id: "market", description: "Market not bearish", field: "market_trend", operator: "neq", value: "bearish" },
        ],
      },
      watch: {
        description: "Value watch criteria",
        min_rules_met: 3,
        rules: [
          { id: "moderate_low", description: "Within 40% of 52-week low", field: "distance_to_low_pct", operator: "lt", value: 0.40 },
          { id: "acceptable_pe", description: "Forward PE below 30", field: "forward_pe", operator: "lt", value: 30 },
          { id: "op_margin", description: "Positive operating margin", field: "operating_margin", operator: "gt", value: 0.0 },
          { id: "earnings", description: "Positive earnings growth", field: "earnings_growth", operator: "gt", value: 0.0 },
        ],
      },
      sell: {
        description: "Value sell criteria",
        min_rules_met: 2,
        rules: [
          { id: "near_high", description: "Within 10% of 52-week high", field: "distance_to_high_pct", operator: "lt", value: 0.10 },
          { id: "overvalued", description: "Trailing PE over 40", field: "trailing_pe", operator: "gt", value: 40 },
          { id: "neg_revenue", description: "Revenue growth negative", field: "revenue_growth", operator: "lt", value: 0.0 },
          { id: "profit_target", description: "Gained more than 30%", field: "gain_pct", operator: "gt", value: 0.30 },
        ],
      },
    },
  },
  {
    id: "growth",
    label: "Growth Hunter",
    description: "High-growth companies with strong revenue and earnings momentum",
    icon: <TrendingUp size={16} />,
    criteria: {
      buy: {
        description: "Growth buy criteria",
        min_rules_met: 3,
        rules: [
          { id: "high_revenue", description: "Revenue growth above 15%", field: "revenue_growth", operator: "gt", value: 0.15 },
          { id: "high_earnings", description: "Earnings growth above 10%", field: "earnings_growth", operator: "gt", value: 0.10 },
          { id: "pe_cap", description: "Forward PE below 50", field: "forward_pe", operator: "lt", value: 50 },
          { id: "profitable", description: "Profit margin positive", field: "profit_margin", operator: "gt", value: 0.0 },
        ],
      },
      watch: {
        description: "Growth watch criteria",
        min_rules_met: 2,
        rules: [
          { id: "decent_revenue", description: "Revenue growth above 8%", field: "revenue_growth", operator: "gt", value: 0.08 },
          { id: "decent_earnings", description: "Earnings growth above 5%", field: "earnings_growth", operator: "gt", value: 0.05 },
          { id: "pe_watch", description: "Forward PE below 70", field: "forward_pe", operator: "lt", value: 70 },
        ],
      },
      sell: {
        description: "Growth sell criteria",
        min_rules_met: 2,
        rules: [
          { id: "neg_revenue", description: "Revenue growth turned negative", field: "revenue_growth", operator: "lt", value: 0.0 },
          { id: "big_gain", description: "Gained more than 50%", field: "gain_pct", operator: "gt", value: 0.50 },
          { id: "bearish", description: "Market is bearish", field: "market_trend", operator: "eq", value: "bearish" },
        ],
      },
    },
  },
  {
    id: "momentum",
    label: "Momentum Trader",
    description: "Stocks with recent price strength and positive market conditions",
    icon: <Zap size={16} />,
    criteria: {
      buy: {
        description: "Momentum buy criteria",
        min_rules_met: 3,
        rules: [
          { id: "near_high", description: "Within 15% of 52-week high", field: "distance_to_high_pct", operator: "lt", value: 0.15 },
          { id: "bullish", description: "Market is bullish", field: "market_trend", operator: "eq", value: "bullish" },
          { id: "revenue", description: "Positive revenue growth", field: "revenue_growth", operator: "gt", value: 0.0 },
          { id: "margin", description: "Positive profit margin", field: "profit_margin", operator: "gt", value: 0.0 },
        ],
      },
      watch: {
        description: "Momentum watch criteria",
        min_rules_met: 2,
        rules: [
          { id: "not_far_high", description: "Within 30% of 52-week high", field: "distance_to_high_pct", operator: "lt", value: 0.30 },
          { id: "not_bearish", description: "Market not bearish", field: "market_trend", operator: "neq", value: "bearish" },
          { id: "earnings", description: "Positive earnings growth", field: "earnings_growth", operator: "gt", value: 0.0 },
        ],
      },
      sell: {
        description: "Momentum sell criteria",
        min_rules_met: 1,
        rules: [
          { id: "bearish", description: "Market turns bearish", field: "market_trend", operator: "eq", value: "bearish" },
          { id: "far_from_high", description: "More than 20% from 52-week high", field: "distance_to_high_pct", operator: "gt", value: 0.20 },
          { id: "profit_target", description: "Gained more than 25%", field: "gain_pct", operator: "gt", value: 0.25 },
        ],
      },
    },
  },
  {
    id: "conservative",
    label: "Conservative",
    description: "Low-risk criteria with strong profitability requirements",
    icon: <ShieldCheck size={16} />,
    criteria: {
      buy: {
        description: "Conservative buy criteria",
        min_rules_met: 5,
        rules: [
          { id: "near_low", description: "Within 25% of 52-week low", field: "distance_to_low_pct", operator: "lt", value: 0.25 },
          { id: "low_pe", description: "Forward PE below 25", field: "forward_pe", operator: "lt", value: 25 },
          { id: "strong_margin", description: "Profit margin above 10%", field: "profit_margin", operator: "gt", value: 0.10 },
          { id: "revenue", description: "Positive revenue growth", field: "revenue_growth", operator: "gt", value: 0.0 },
          { id: "market", description: "Market is bullish", field: "market_trend", operator: "eq", value: "bullish" },
        ],
      },
      watch: {
        description: "Conservative watch criteria",
        min_rules_met: 3,
        rules: [
          { id: "moderate_low", description: "Within 35% of 52-week low", field: "distance_to_low_pct", operator: "lt", value: 0.35 },
          { id: "pe", description: "Forward PE below 35", field: "forward_pe", operator: "lt", value: 35 },
          { id: "margin", description: "Profit margin above 5%", field: "profit_margin", operator: "gt", value: 0.05 },
          { id: "not_bearish", description: "Market not bearish", field: "market_trend", operator: "neq", value: "bearish" },
        ],
      },
      sell: {
        description: "Conservative sell criteria",
        min_rules_met: 1,
        rules: [
          { id: "neg_revenue", description: "Revenue growth negative", field: "revenue_growth", operator: "lt", value: 0.0 },
          { id: "bearish", description: "Market is bearish", field: "market_trend", operator: "eq", value: "bearish" },
          { id: "profit_target", description: "Gained more than 20%", field: "gain_pct", operator: "gt", value: 0.20 },
        ],
      },
    },
  },
];

// ── Rule row component ─────────────────────────────────────────────────────

function RuleRow({ rule, index, onChange, onDelete }: {
  rule: CriteriaRule;
  index: number;
  onChange: (r: CriteriaRule) => void;
  onDelete: () => void;
}) {
  const fieldDef = FIELDS.find(f => f.value === rule.field);
  const isString = fieldDef?.type === "string";
  const operators = isString ? OPERATORS_STR : OPERATORS_NUM;

  const inp = "bg-card border border-border rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-green/40 w-full";

  return (
    <div className="flex items-start gap-2 p-3 bg-card2 rounded-xl border border-border/40 group">
      <div className="flex-1 grid grid-cols-3 gap-2 min-w-0">
        {/* Field */}
        <div>
          <label className="text-[9px] text-muted block mb-1">Field</label>
          <select value={rule.field} onChange={e => onChange({ ...rule, field: e.target.value, value: 0 })} className={inp}>
            {FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        {/* Operator */}
        <div>
          <label className="text-[9px] text-muted block mb-1">Condition</label>
          <select value={rule.operator} onChange={e => onChange({ ...rule, operator: e.target.value })} className={inp}>
            {operators.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {/* Value */}
        <div>
          <label className="text-[9px] text-muted block mb-1">Value</label>
          <input
            type={isString ? "text" : "number"}
            step="any"
            value={rule.value}
            onChange={e => onChange({ ...rule, value: isString ? e.target.value : parseFloat(e.target.value) || 0 })}
            placeholder={fieldDef?.hint ?? ""}
            className={inp}
          />
        </div>
        {/* Description preview */}
        <div className="col-span-3 mt-1">
          <input
            type="text"
            value={rule.description}
            onChange={e => onChange({ ...rule, description: e.target.value })}
            placeholder="Rule description (shown in UI)"
            className="bg-transparent border-0 border-b border-border/40 text-[10px] text-muted focus:outline-none focus:border-green/40 w-full pb-0.5 transition-colors"
          />
        </div>
      </div>
      <button onClick={onDelete}
        className="text-muted hover:text-red transition-colors p-1.5 rounded-lg hover:bg-red/10 flex-shrink-0 mt-4">
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ── Mode section ───────────────────────────────────────────────────────────

function ModeSection({ mode, label, color, data, onChange }: {
  mode: "buy" | "watch" | "sell";
  label: string;
  color: string;
  data: CriteriaMode;
  onChange: (d: CriteriaMode) => void;
}) {
  function addRule() {
    const newRule: CriteriaRule = {
      id: `rule_${Date.now()}`,
      description: "New rule",
      field: "revenue_growth",
      operator: "gt",
      value: 0,
    };
    onChange({ ...data, rules: [...data.rules, newRule] });
  }

  function updateRule(i: number, r: CriteriaRule) {
    const rules = [...data.rules];
    rules[i] = r;
    onChange({ ...data, rules });
  }

  function deleteRule(i: number) {
    onChange({ ...data, rules: data.rules.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={clsx("w-2 h-2 rounded-full", color)} />
          <p className="text-sm font-semibold text-white">{label} Rules</p>
          <span className="text-[10px] text-muted bg-card2 px-2 py-0.5 rounded-full">
            {data.rules.length} rule{data.rules.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-muted whitespace-nowrap">Min rules to pass:</label>
            <input
              type="number"
              min={1}
              max={data.rules.length || 1}
              value={data.min_rules_met}
              onChange={e => onChange({ ...data, min_rules_met: Math.max(1, parseInt(e.target.value) || 1) })}
              className="w-12 bg-card border border-border rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-green/40"
            />
            <span className="text-[10px] text-muted">of {data.rules.length}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {data.rules.map((rule, i) => (
          <RuleRow key={rule.id} rule={rule} index={i}
            onChange={r => updateRule(i, r)}
            onDelete={() => deleteRule(i)} />
        ))}
      </div>

      <button onClick={addRule}
        className="flex items-center gap-2 text-xs text-muted hover:text-green transition-colors border border-border/50 hover:border-green/30 rounded-xl px-3 py-2 w-full justify-center hover:bg-green/5">
        <Plus size={12} /> Add Rule
      </button>
    </div>
  );
}

// ── Main CriteriaBuilder ───────────────────────────────────────────────────

interface CriteriaBuilderProps {
  initialCriteria: CriteriaConfig;
  onSave: (criteria: CriteriaConfig) => Promise<void>;
}

export default function CriteriaBuilder({ initialCriteria, onSave }: CriteriaBuilderProps) {
  const [criteria, setCriteria] = useState<CriteriaConfig>(initialCriteria);
  const [activeMode, setActiveMode] = useState<"buy" | "watch" | "sell">("buy");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  function applyPreset(preset: Preset) {
    setCriteria(preset.criteria);
    setSelectedPreset(preset.id);
    setSaveStatus("idle");
  }

  function updateMode(mode: "buy" | "watch" | "sell", data: CriteriaMode) {
    setCriteria(prev => ({ ...prev, [mode]: data }));
    setSelectedPreset("custom");
    setSaveStatus("idle");
  }

  async function handleSave() {
    setSaving(true);
    setSaveStatus("idle");
    try {
      await onSave(criteria);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  const MODES: { id: "buy" | "watch" | "sell"; label: string; color: string; dotColor: string }[] = [
    { id: "buy",   label: "Buy",   color: "bg-green/15 text-green border-green/30",         dotColor: "bg-green" },
    { id: "watch", label: "Watch", color: "bg-purple/15 text-purple-300 border-purple/30",  dotColor: "bg-purple-400" },
    { id: "sell",  label: "Sell",  color: "bg-red/15 text-red border-red/30",               dotColor: "bg-red" },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Preset templates ── */}
      <div className="flex-shrink-0 mb-5">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Start from a preset</p>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => applyPreset(p)}
              className={clsx(
                "text-left px-4 py-3 rounded-xl border transition-all group",
                selectedPreset === p.id
                  ? "bg-green/10 border-green/30 text-white"
                  : "bg-card2 border-border/40 hover:border-green/30 hover:bg-green/5"
              )}>
              <div className="flex items-center gap-2 mb-1">
                <span className={clsx("transition-colors", selectedPreset === p.id ? "text-green" : "text-muted group-hover:text-green")}>
                  {p.icon}
                </span>
                <p className="text-sm font-semibold text-white">{p.label}</p>
                {selectedPreset === p.id && (
                  <CheckCircle size={12} className="text-green ml-auto" />
                )}
              </div>
              <p className="text-[10px] text-muted leading-relaxed">{p.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Mode tabs ── */}
      <div className="flex gap-1 bg-card2 rounded-xl p-1 flex-shrink-0 mb-4">
        {MODES.map(m => (
          <button key={m.id} onClick={() => setActiveMode(m.id)}
            className={clsx(
              "flex-1 py-2 rounded-lg text-xs font-semibold transition-colors border",
              activeMode === m.id ? m.color : "text-muted hover:text-white border-transparent"
            )}>
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Active mode rule editor ── */}
      <div className="flex-1 overflow-y-auto min-h-0 pb-4">
        {MODES.filter(m => m.id === activeMode).map(m => (
          <ModeSection key={m.id}
            mode={m.id}
            label={m.label}
            color={m.dotColor}
            data={criteria[m.id]}
            onChange={d => updateMode(m.id, d)}
          />
        ))}
      </div>

      {/* ── Save bar ── */}
      <div className="flex-shrink-0 pt-3 border-t border-border/40 flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-green/15 hover:bg-green/25 disabled:opacity-50 border border-green/30 text-green rounded-xl px-4 py-2 text-sm font-semibold transition-colors">
          {saving
            ? <><RefreshCw size={13} className="animate-spin" /> Saving...</>
            : <><Save size={13} /> Save Criteria</>}
        </button>
        {saveStatus === "success" && (
          <div className="flex items-center gap-1.5 text-green text-xs">
            <CheckCircle size={13} /> Saved successfully
          </div>
        )}
        {saveStatus === "error" && (
          <div className="flex items-center gap-1.5 text-red text-xs">
            <AlertCircle size={13} /> Failed to save
          </div>
        )}
        <p className="text-[10px] text-muted ml-auto">
          Changes apply to your screener signals immediately after saving
        </p>
      </div>
    </div>
  );
}
