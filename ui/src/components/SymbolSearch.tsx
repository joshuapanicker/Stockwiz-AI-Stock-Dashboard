/**
 * SymbolSearch — adaptive live search input with typeahead dropdown.
 * Queries /api/search as the user types, shows up to 10 matching symbols.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import clsx from "clsx";
import { Search, X } from "lucide-react";
import { apiFetch } from "../hooks/useApi";

interface SearchResult {
  symbol: string;
  sector: string | null;
  close_price: number | null;
  market_cap: number | null;
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  onSelect: (symbol: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
}

function fmtCap(n: number | null): string {
  if (!n) return "";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(0)}M`;
  return "";
}

export default function SymbolSearch({
  value, onChange, onSelect,
  placeholder = "Search symbol...",
  className = "", inputClassName = "",
  autoFocus = false,
}: Props) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Debounced search
  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiFetch<SearchResult[]>(`/search?q=${encodeURIComponent(q.toUpperCase())}`);
        setResults(data);
        setOpen(data.length > 0);
        setActiveIdx(-1);
      } catch { setResults([]); }
    }, 120);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.toUpperCase();
    onChange(val);
    search(val);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const sym = activeIdx >= 0 ? results[activeIdx].symbol : (results[0]?.symbol ?? value);
      select(sym);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function select(symbol: string) {
    onChange(symbol);
    onSelect(symbol);
    setOpen(false);
    setResults([]);
  }

  return (
    <div ref={containerRef} className={clsx("relative", className)}>
      <div className={clsx(
        "flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2",
        "focus-within:border-green/40 transition-colors",
        inputClassName
      )}>
        <Search size={13} className="text-muted flex-shrink-0" />
        <input
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => value && results.length && setOpen(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          className="flex-1 bg-transparent text-sm text-white placeholder-muted focus:outline-none font-mono min-w-0"
        />
        {value && (
          <button type="button" onClick={() => { onChange(""); setResults([]); setOpen(false); }}>
            <X size={12} className="text-muted hover:text-white transition-colors" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-card2 border border-border/70 rounded-xl shadow-2xl z-50 py-1 overflow-hidden anim-scale-in">
          {results.map((r, i) => (
            <button
              key={r.symbol}
              onClick={() => select(r.symbol)}
              className={clsx(
                "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors",
                i === activeIdx ? "bg-green/10" : "hover:bg-white/5"
              )}>
              <span className="font-mono font-semibold text-white text-sm w-16 flex-shrink-0">{r.symbol}</span>
              <span className="text-muted text-xs truncate flex-1">{r.sector ?? ""}</span>
              <div className="flex items-center gap-2 flex-shrink-0 text-right">
                {r.close_price && (
                  <span className="font-mono text-white/70 text-xs">${r.close_price.toFixed(2)}</span>
                )}
                <span className="text-muted text-[10px]">{fmtCap(r.market_cap)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
