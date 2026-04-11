import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { apiFetch } from "../hooks/useApi";

interface Props {
  onSelect: (symbol: string) => void;
}

export default function SearchBar({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Simple static suggestions from common tickers
  const COMMON = [
    "AAPL","MSFT","GOOGL","AMZN","NVDA","META","TSLA","AMD","NFLX","CRM",
    "ADBE","INTC","PYPL","SQ","SHOP","UBER","LYFT","SNAP","TWTR","SPOT",
    "COIN","HOOD","PLTR","RBLX","ABNB","DASH","ZM","DOCU","OKTA","NET",
  ];

  useEffect(() => {
    if (!query.trim()) { setSuggestions([]); return; }
    const q = query.toUpperCase();
    setSuggestions(COMMON.filter((s) => s.startsWith(q)).slice(0, 6));
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSelect(symbol: string) {
    onSelect(symbol);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) handleSelect(query.trim().toUpperCase());
  }

  return (
    <div ref={ref} className="relative">
      <form onSubmit={handleSubmit}>
        <div className="flex items-center gap-2 bg-card2 border border-border rounded-xl px-3 py-2 focus-within:border-green/40 transition-colors">
          <Search size={13} className="text-muted flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search any stock..."
            className="bg-transparent text-white text-xs placeholder-muted focus:outline-none w-40"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(""); setSuggestions([]); }}>
              <X size={12} className="text-muted hover:text-white" />
            </button>
          )}
        </div>
      </form>

      {open && suggestions.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-card2 border border-border rounded-xl overflow-hidden shadow-2xl z-50">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => handleSelect(s)}
              className="w-full text-left px-3 py-2 text-xs text-white hover:bg-white/5 transition-colors font-mono"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
