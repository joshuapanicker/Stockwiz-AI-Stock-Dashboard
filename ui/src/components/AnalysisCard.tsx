/**
 * AnalysisCard — unified AI analysis display.
 *
 * Combines the criteria checklist and Claude's reasoning into a single card
 * so the rule counts and the AI text always tell the same story (both now
 * come from the same backend evaluation). Parses the structured analysis
 * text (Decision / Summary / Reasoning) instead of dumping it raw.
 */
import clsx from "clsx";
import { Sparkles, Check, X, RefreshCw, AlertCircle, FileText } from "lucide-react";

interface CriteriaDetail {
  id: string;
  description: string;
  passed: boolean;
}

interface CriteriaResult {
  passed: boolean;
  rules_met: number;
  rules_total: number;
  min_required: number;
  details: CriteriaDetail[];
}

interface Props {
  /** Result of /api/analyze — { analysis_text, criteria_result, ... } */
  analysis: any | null;
  loading: boolean;
  error?: string | null;
  action: "buy" | "sell";
  /** Shown while the AI result loads (e.g. the portfolio's sell_result) */
  fallbackCriteria?: CriteriaResult | null;
  title?: string;
  /** Override the checklist label (defaults to "Buy criteria" / "Sell criteria") */
  criteriaLabel?: string;
}

/** Pull Decision / Summary / Reasoning out of the structured Claude output. */
function parseAnalysis(text: string) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  let decision: "YES" | "NO" | null = null;
  let summary = "";
  const reasoning: string[] = [];
  let inReasoning = false;

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("decision:")) {
      decision = line.slice(9).trim().toUpperCase().startsWith("Y") ? "YES" : "NO";
    } else if (lower.startsWith("summary:")) {
      summary = line.slice(8).trim();
      inReasoning = false;
    } else if (lower.startsWith("reasoning")) {
      inReasoning = true;
    } else if (line.startsWith("-") || line.startsWith("•")) {
      if (inReasoning || reasoning.length > 0 || summary) reasoning.push(line.replace(/^[-•]\s*/, ""));
    }
  }
  return { decision, summary, reasoning };
}

function VerdictBadge({ action, decision }: { action: "buy" | "sell"; decision: "YES" | "NO" | null }) {
  if (decision == null) return null;
  const label = action === "sell"
    ? (decision === "YES" ? "SELL" : "HOLD")
    : (decision === "YES" ? "BUY" : "WAIT");
  const positive = (action === "sell" && decision === "NO") || (action === "buy" && decision === "YES");
  return (
    <span className={clsx(
      "text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-widest border",
      positive
        ? "bg-green/10 text-green border-green/30"
        : action === "sell"
          ? "bg-red/10 text-red border-red/30"
          : "bg-amber-400/10 text-amber-400 border-amber-400/30"
    )}>
      {label}
    </span>
  );
}

export default function AnalysisCard({ analysis, loading, error, action, fallbackCriteria, title, criteriaLabel }: Props) {
  const criteria: CriteriaResult | null = analysis?.criteria_result ?? fallbackCriteria ?? null;
  const parsed = analysis?.analysis_text ? parseAnalysis(analysis.analysis_text) : null;
  const heading = title ?? (action === "sell" ? "AI Sell Analysis" : "AI Buy Analysis");
  const triggeredColor = action === "sell" ? "red" : "green";

  return (
    <div className="glass-card bg-white/[0.02] rounded-2xl border border-border/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <div className="flex items-center gap-2">
          <div className={clsx(
            "w-6 h-6 rounded-lg flex items-center justify-center",
            action === "sell" ? "bg-red/10 text-red" : "bg-green/10 text-green"
          )}>
            <Sparkles size={12} />
          </div>
          <span className="text-xs font-semibold text-white">{heading}</span>
          {loading && <RefreshCw size={11} className="animate-spin text-muted" />}
        </div>
        {parsed && <VerdictBadge action={action} decision={parsed.decision} />}
      </div>

      <div className="px-4 py-3.5 space-y-3.5">
        {/* Criteria checklist — same evaluation the AI reasoned over */}
        {criteria && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-muted uppercase tracking-wider font-medium">
                {criteriaLabel ?? (action === "sell" ? "Sell criteria" : "Buy criteria")}
              </p>
              <p className="text-[10px] font-mono text-muted">
                <span className={criteria.passed ? (action === "sell" ? "text-red" : "text-green") : "text-white/70"}>
                  {criteria.rules_met}/{criteria.rules_total}
                </span>
                {" "}triggered · need {criteria.min_required}
              </p>
            </div>
            <div className="space-y-1.5">
              {criteria.details.map(r => (
                <div key={r.id} className="flex items-start gap-2 text-xs">
                  <span className={clsx(
                    "w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 mt-[1px] border",
                    r.passed
                      ? triggeredColor === "red"
                        ? "bg-red/15 border-red/30 text-red"
                        : "bg-green/15 border-green/30 text-green"
                      : "bg-white/[0.03] border-border/40 text-white/20"
                  )}>
                    {r.passed ? <Check size={9} strokeWidth={3} /> : <X size={9} strokeWidth={2.5} />}
                  </span>
                  <span className={r.passed ? "text-white/90" : "text-muted"}>{r.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI reasoning */}
        {loading ? (
          <div className="space-y-2">
            <div className="chart-skeleton h-3.5 rounded w-3/4" />
            <div className="chart-skeleton h-3.5 rounded w-full" />
            <div className="chart-skeleton h-3.5 rounded w-5/6" />
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 text-xs text-red/80">
            <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : parsed ? (
          <div className="space-y-2.5">
            {parsed.summary && (
              <p className="text-xs text-white/90 leading-relaxed">{parsed.summary}</p>
            )}
            {parsed.reasoning.length > 0 && (
              <ul className="space-y-1.5">
                {parsed.reasoning.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-white/60 leading-relaxed">
                    <span className={clsx(
                      "w-1 h-1 rounded-full flex-shrink-0 mt-[7px]",
                      action === "sell" ? "bg-red/50" : "bg-green/50"
                    )} />
                    {r}
                  </li>
                ))}
              </ul>
            )}
            {/* Fallback if the structured format wasn't followed */}
            {!parsed.summary && parsed.reasoning.length === 0 && analysis?.analysis_text && (
              <p className="text-xs text-white/70 leading-relaxed whitespace-pre-line">
                {analysis.analysis_text}
              </p>
            )}

            {/* RAG grounding sources — which SEC filings informed this verdict */}
            {analysis?.grounding_sources?.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-2.5 border-t border-border/20">
                <FileText size={10} className="text-muted flex-shrink-0" />
                <span className="text-[10px] text-muted">Grounded in</span>
                {analysis.grounding_sources.map((s: any, i: number) => (
                  <span key={i}
                    title={`${s.form} filed ${s.date} — ${s.section}`}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-border/40 text-white/60 whitespace-nowrap">
                    {s.form} · {s.section} · {s.date}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted">Expand to load analysis</p>
        )}
      </div>
    </div>
  );
}
