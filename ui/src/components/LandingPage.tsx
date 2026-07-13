import { useState, useRef, useEffect } from "react";
import clsx from "clsx";
import {
  TrendingUp, BarChart2, Bot, Zap, ShieldCheck, ChevronRight,
  Star, ArrowRight, Eye, EyeOff, Mail, Lock, Loader2,
  AlertCircle, CheckCircle, Monitor,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useInView } from "../hooks/useInView";
import { apiFetch, useMarket } from "../hooks/useApi";
import { TermsOfService, PrivacyPolicy } from "./LegalPages";
import TickerField, { type IgnitedTicker } from "./landing/TickerField";
import VerdictCard from "./landing/VerdictCard";
import PipelineShowcase from "./landing/PipelineShowcase";
import TrackRecordLedger from "./landing/TrackRecordLedger";
import { DataConstellation, CursorGlow, ScrollProgress, TickerTape } from "./landing/Atmosphere";

// ── 3D tilt on hover — cards lean toward the cursor ───────────────────────

function Tilt({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform =
      `perspective(700px) rotateY(${px * 7}deg) rotateX(${-py * 7}deg) translateY(-3px)`;
  }
  function onLeave() {
    const el = ref.current;
    if (el) el.style.transform = "";
  }

  return (
    <div ref={ref}
      onMouseMove={reduced ? undefined : onMove}
      onMouseLeave={reduced ? undefined : onLeave}
      className="h-full will-change-transform"
      style={{ transition: "transform 0.3s ease" }}>
      {children}
    </div>
  );
}

// ── Magnetic wrapper — buttons lean toward the cursor, spring back ────────

function Magnetic({ children, strength = 0.3 }: { children: React.ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    function onMove(e: MouseEvent) {
      const r = el!.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy);
      const range = 110;
      el!.style.transform = dist < range
        ? `translate(${dx * (1 - dist / range) * strength}px, ${dy * (1 - dist / range) * strength}px)`
        : "";
    }
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [strength]);

  return (
    <div ref={ref} className="inline-block will-change-transform"
      style={{ transition: "transform 0.3s cubic-bezier(0.2, 0.8, 0.3, 1)" }}>
      {children}
    </div>
  );
}

// ── Live SPY/VIX micro-ticker (nav) ───────────────────────────────────────
// First proof the page is alive: real numbers from /api/market, mono voice.
// Renders nothing until data lands (or if the API is unreachable).

function MicroTicker() {
  const market = useMarket();
  if (!market || market.spy_latest == null) return null;
  const trend = String(market.market_trend ?? "").toLowerCase();
  const up = trend.includes("up");
  const down = trend.includes("down");
  return (
    <div className="hidden lg:flex items-center gap-3 font-mono text-[11px] tracking-wider text-white/40">
      <span>
        SPY{" "}
        <span className={up ? "text-green" : down ? "text-red" : "text-white/75"}>
          ${Number(market.spy_latest).toFixed(2)}{up ? " ▲" : down ? " ▼" : ""}
        </span>
      </span>
      <span className="text-white/15">·</span>
      <span>
        VIX <span className="text-white/75">{market.vix != null ? Number(market.vix).toFixed(1) : "—"}</span>
      </span>
    </div>
  );
}

// ── Fade-in wrapper ───────────────────────────────────────────────────────

function FadeIn({ children, delay = 0, direction = "up", className = "" }: {
  children: React.ReactNode; delay?: number; direction?: "up" | "left" | "right" | "none"; className?: string;
}) {
  const { ref, inView } = useInView(0.1);
  const transforms: Record<string, string> = {
    up: "translateY(28px)", left: "translateX(-28px)", right: "translateX(28px)", none: "none",
  };
  return (
    <div ref={ref} className={className} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? "none" : transforms[direction],
      transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

// ── Browser frame mockup ──────────────────────────────────────────────────

function BrowserFrame({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={clsx("rounded-2xl overflow-hidden border border-border/60 shadow-2xl", className)}>
      {/* Chrome bar */}
      <div className="bg-card2 border-b border-border/50 px-4 py-2.5 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red/60" />
          <div className="w-3 h-3 rounded-full bg-orange/60" />
          <div className="w-3 h-3 rounded-full bg-green/60" />
        </div>
        <div className="flex-1 bg-card border border-border/40 rounded-md px-3 py-1 flex items-center gap-2 mx-4">
          <Monitor size={10} className="text-muted" />
          <span className="text-[10px] text-muted">stockwiz.com</span>
        </div>
      </div>
      <img src={src} alt={alt} className="w-full block" />
    </div>
  );
}

// ── Auth form ─────────────────────────────────────────────────────────────

type Mode = "login" | "signup";

/** Supabase's wording varies by version, but a cross-provider collision on
 * signup always mentions the account/user already existing. */
function isAccountExistsError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes("already registered") || m.includes("already exists") || m.includes("user already");
}

function AuthForm({ onOpenTerms, onOpenPrivacy }: { onOpenTerms: () => void; onOpenPrivacy: () => void }) {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(null);
    if (!email.trim() || !password.trim()) { setError("Email and password required."); return; }
    if (mode === "signup" && password.length < 8) {
      setError("Password must be at least 8 characters."); return;
    }
    setLoading(true);
    if (mode === "login") {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    } else {
      // Catch typo'd/fabricated domains before creating the account —
      // doesn't require sending any email.
      try {
        const check = await apiFetch<{ valid: boolean; reason: string | null }>("/auth/validate-email", {
          method: "POST",
          body: JSON.stringify({ email: email.trim() }),
        });
        if (!check.valid) {
          setError(check.reason ?? "That email address looks invalid.");
          setLoading(false);
          return;
        }
      } catch {
        // Validation service unreachable — fail open rather than block signup
      }

      const { error } = await signUp(email, password);
      if (error) {
        setError(isAccountExistsError(error)
          ? "An account with this email already exists. Sign in below, then link Google from Settings → Security if you'd like to use it too."
          : error);
      } else { setSuccess("Account created! You're signed in."); setMode("login"); }
    }
    setLoading(false);
  }

  async function handleGoogle() {
    setError(null); setSuccess(null); setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setError(isAccountExistsError(error)
        ? "An account with this email already exists. Sign in with your password, then link Google from Settings → Security."
        : error);
      setGoogleLoading(false);
    }
    // On success the page redirects to Google, so no need to clear loading here.
  }

  return (
    <div className="bg-card border border-border/60 rounded-2xl p-6 shadow-2xl w-full max-w-sm backdrop-blur-sm">
      <div className="flex gap-1 bg-card2 rounded-xl p-1 mb-5">
        {(["signup", "login"] as Mode[]).map(m => (
          <button key={m} onClick={() => { setMode(m); setError(null); setSuccess(null); }}
            className={clsx("flex-1 py-2 rounded-lg text-sm font-medium transition-colors",
              mode === m ? "bg-green/15 text-green" : "text-muted hover:text-white")}>
            {m === "signup" ? "Get Started" : "Sign In"}
          </button>
        ))}
      </div>

      <button type="button" onClick={handleGoogle} disabled={googleLoading || loading}
        className="w-full flex items-center justify-center gap-2.5 bg-white hover:bg-white/90 disabled:opacity-60 text-[#1f1f1f] rounded-xl py-2.5 text-sm font-semibold transition-colors mb-4">
        {googleLoading ? <Loader2 size={16} className="animate-spin" /> : (
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4c-7.7 0-14.3 4.4-17.7 10.7z"/>
            <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 34.9 26.9 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.6 5.1C9.6 39.5 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.6 5.6C41.5 36 44 30.5 44 24c0-1.3-.1-2.7-.4-3.5z"/>
          </svg>
        )}
        {mode === "signup" ? "Sign up with Google" : "Continue with Google"}
      </button>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[10px] text-muted uppercase tracking-wider">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center gap-2 bg-card2 border border-border rounded-xl px-3 py-2.5 focus-within:border-green/40 transition-colors">
          <Mail size={13} className="text-muted flex-shrink-0" />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com" autoComplete="email"
            className="flex-1 bg-transparent text-sm text-white placeholder-muted focus:outline-none" />
        </div>
        <div className="flex items-center gap-2 bg-card2 border border-border rounded-xl px-3 py-2.5 focus-within:border-green/40 transition-colors">
          <Lock size={13} className="text-muted flex-shrink-0" />
          <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "Min 8 characters" : "Password"}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="flex-1 bg-transparent text-sm text-white placeholder-muted focus:outline-none" />
          <button type="button" onClick={() => setShowPw(v => !v)} className="text-muted hover:text-white transition-colors">
            {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        {error && (
          <div className="flex items-start gap-2 bg-red/10 border border-red/20 rounded-xl px-3 py-2">
            <AlertCircle size={13} className="text-red flex-shrink-0 mt-0.5" />
            <p className="text-red text-xs leading-relaxed">{error}</p>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 bg-green/10 border border-green/20 rounded-xl px-3 py-2">
            <CheckCircle size={13} className="text-green flex-shrink-0 mt-0.5" />
            <p className="text-green text-xs leading-relaxed">{success}</p>
          </div>
        )}
        <button type="submit" disabled={loading}
          className="w-full bg-green/15 hover:bg-green/25 disabled:opacity-50 border border-green/30 text-green rounded-xl py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2">
          {loading
            ? <><Loader2 size={14} className="animate-spin" />{mode === "login" ? "Signing in..." : "Creating account..."}</>
            : mode === "login" ? "Sign In" : "Create Free Account"}
        </button>
      </form>
      <p className="text-center text-[11px] text-muted mt-3">
        {mode === "signup" ? "Already have an account? " : "No account yet? "}
        <button onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(null); }}
          className="text-green hover:underline">
          {mode === "signup" ? "Sign in" : "Sign up free"}
        </button>
      </p>
      {mode === "signup" && (
        <p className="text-center text-[10px] text-muted/70 mt-2 leading-relaxed">
          By creating an account you agree to our{" "}
          <button type="button" onClick={onOpenTerms} className="text-muted hover:text-white underline">Terms</button>
          {" "}and{" "}
          <button type="button" onClick={onOpenPrivacy} className="text-muted hover:text-white underline">Privacy Policy</button>.
          StockWiz does not provide financial advice.
        </p>
      )}
    </div>
  );
}

// ── The terminal — one real product shot, gentle parallax ─────────────────

function TerminalShot() {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    function onScroll() {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const center = r.top + r.height / 2 - window.innerHeight / 2;
      setOffset(Math.max(-36, Math.min(36, -center * 0.055)));
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section className="relative z-10 px-6 md:px-8 py-20 max-w-6xl mx-auto">
      <FadeIn direction="up">
        <div className="text-center mb-12">
          <p className="font-mono text-[11px] tracking-[0.28em] text-green uppercase mb-3">The terminal</p>
          <h2 className="font-display font-bold tracking-tight text-4xl md:text-5xl text-white">
            Where the verdicts <span className="text-gradient-signal">land.</span>
          </h2>
        </div>
      </FadeIn>
      <div ref={ref} className="relative will-change-transform" style={{ transform: `translateY(${offset}px)` }}>
        <div className="absolute -inset-6 rounded-3xl blur-3xl opacity-25 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(46,230,168,0.28), transparent 70%)" }} />
        <BrowserFrame
          src="/screenshots/dashboard.png"
          alt="StockWiz dashboard - candlestick charts, screener signals, and streaming AI analysis"
          className="relative"
        />
      </div>
    </section>
  );
}

// ── Main landing page ─────────────────────────────────────────────────────

export default function LandingPage() {
  const authRef = useRef<HTMLDivElement>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  // The hero's canvas field hands ignited tickers to the verdict card
  const [ignited, setIgnited] = useState<IgnitedTicker | null>(null);

  function scrollToAuth() {
    authRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="min-h-screen text-white" style={{ background: "#06080D" }}>
      <style>{`body { overflow-x: hidden; }`}</style>

      {/* Page-wide atmosphere: quiet washes + the data constellation that
          runs behind every section, the cursor lens that follows the
          pointer everywhere, and the scroll progress hairline. */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(46,230,168,0.07) 0%, transparent 60%)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 40% at 100% 70%, rgba(128,85,245,0.06) 0%, transparent 55%)" }} />
      </div>
      <DataConstellation />
      <CursorGlow />
      <ScrollProgress />

      {/* ── NAV — glass bar with live market pulse ── */}
      <nav className="relative z-20 flex items-center justify-between px-6 md:px-8 py-4 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-green/15 border border-green/20 flex items-center justify-center">
            <TrendingUp size={16} className="text-green" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">StockWiz</span>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2">
          <MicroTicker />
        </div>
        <div className="flex items-center gap-8">
          <div className="hidden md:flex items-center gap-8 text-sm text-muted">
            <a href="#features" className="hover:text-white transition-colors">Pipeline</a>
            <a href="#track-record" className="hover:text-white transition-colors">Track record</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          </div>
          <button onClick={scrollToAuth}
            className="flex items-center gap-2 bg-green/10 hover:bg-green/20 border border-green/30 text-green rounded-xl px-4 py-2 text-sm font-semibold transition-all">
            Get Started <ArrowRight size={14} />
          </button>
        </div>
      </nav>

      {/* ── HERO — Act 0: the noise ──
          Full-viewport stage for the live ticker field. Phase 1 ships the
          static layer (pure CSS texture + type) so LCP is instant; the
          canvas field mounts into #ticker-field-root in phase 2 as
          progressive enhancement. */}
      <section className="relative z-10 flex flex-col overflow-hidden" style={{ minHeight: "calc(100vh - 65px)" }}>

        {/* Ticker-field stage — CSS texture renders instantly (LCP), the
            live canvas field mounts over it as progressive enhancement */}
        <div id="ticker-field-root" aria-hidden className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 landing-grid-texture" />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 55% at 50% 118%, rgba(46,230,168,0.09), transparent 65%)" }} />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 45% 35% at 88% -8%, rgba(128,85,245,0.08), transparent 60%)" }} />
          <TickerField onIgnite={setIgnited} className="absolute inset-0 w-full h-full" />
        </div>

        {/* The verdict card — where an ignited ticker becomes a decision */}
        <VerdictCard ticker={ignited} className="hidden xl:block absolute right-10 bottom-32 z-10 anim-fade-in" />

        <div className="relative flex-1 flex flex-col items-center justify-center text-center px-6 pt-14 pb-10 max-w-4xl mx-auto w-full">

          <FadeIn direction="up">
            <div className="inline-flex items-center gap-2.5 border border-white/10 bg-white/[0.03] rounded-full px-4 py-1.5 font-mono text-[11px] tracking-[0.18em] text-white/60 uppercase mb-10 backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-60" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green" />
              </span>
              Live · reading 5,700 tickers
            </div>
          </FadeIn>

          {/* Two voices: the market speaks in mono (letter-staggered in),
              the judgment lands in Space Grotesk with a drifting signal
              gradient. */}
          <h1 className="mb-8">
            <span className="block font-mono text-xl md:text-2xl tracking-[0.28em] text-white/55 uppercase mb-5" aria-label="5,700 stocks.">
              {"5,700 stocks.".split("").map((ch, i) => (
                <span key={i} aria-hidden className="reveal-char" style={{ "--ci": i } as React.CSSProperties}>
                  {ch === " " ? "\u00A0" : ch}
                </span>
              ))}
            </span>
            <span className="block font-display font-bold tracking-tight text-6xl md:text-8xl leading-[1.02]" aria-label="One verdict.">
              <span aria-hidden className="reveal-char text-white" style={{ "--ci": 15 } as React.CSSProperties}>One{"\u00A0"}</span>
              <span aria-hidden className="reveal-char text-gradient-signal" style={{ "--ci": 18 } as React.CSSProperties}>verdict.</span>
            </span>
          </h1>

          <FadeIn direction="up" delay={340}>
            <p className="text-white/55 text-base md:text-lg leading-relaxed max-w-xl mb-10">
              Live market data, your rules, and <span className="text-purple">Claude reasoning</span> over
              every position — in plain English, as it streams.
            </p>
          </FadeIn>

          <FadeIn direction="up" delay={440}>
            <div className="flex items-center justify-center gap-5 flex-wrap">
              <Magnetic>
                <button onClick={scrollToAuth}
                  className="flex items-center gap-2 bg-green text-bg rounded-xl px-7 py-3.5 text-sm font-bold hover:bg-green/90 transition-colors shadow-lg shadow-green/20">
                  Start for free <ArrowRight size={15} />
                </button>
              </Magnetic>
              <button onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
                className="flex items-center gap-2 font-mono text-xs tracking-wider text-muted hover:text-white uppercase transition-colors">
                How a verdict gets made <ChevronRight size={13} />
              </button>
            </div>
          </FadeIn>
        </div>

        {/* Proof strip — three true numbers, mono voice. Replaces the old
            inventory stats card ("4 presets / 6 chart types"). */}
        <FadeIn direction="up" delay={560}>
          <div className="relative flex flex-wrap items-center justify-center gap-x-8 gap-y-2 px-6 pb-12 font-mono text-[11px] md:text-xs tracking-[0.14em] text-white/40 uppercase">
            <span><span className="text-white/85">5,700+</span> US listings scanned</span>
            <span className="hidden md:inline text-white/15">·</span>
            <span><span className="text-white/85">200K</span> free AI tokens / mo</span>
            <span className="hidden md:inline text-white/15">·</span>
            <span>Every verdict graded at <span className="text-white/85">30/90/180d</span></span>
          </div>
        </FadeIn>
      </section>

      {/* ── THE TAPE — the market runs through the page ── */}
      <TickerTape />

      {/* ── THE PIPELINE — scroll-scrubbed 4-act sequence ── */}
      <section id="features" className="relative z-10">
        <PipelineShowcase />
      </section>

      {/* ── THE TERMINAL — one real product shot, parallax ── */}
      <TerminalShot />

      {/* ── TRACK RECORD — real public scoreboard, honest by design ── */}
      <TrackRecordLedger />

      {/* ── INSTRUMENTS — capability grid, deliberately quiet ── */}
      <section className="relative z-10 px-8 py-16 max-w-7xl mx-auto">
        <FadeIn direction="up">
          <div className="text-center mb-12">
            <p className="font-mono text-[11px] tracking-[0.28em] text-green uppercase mb-3">Instruments</p>
            <h2 className="font-display font-bold tracking-tight text-4xl md:text-5xl text-white">
              Six instruments, <span className="text-gradient-signal">one terminal.</span>
            </h2>
          </div>
        </FadeIn>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: <Bot size={17}/>,         title: "AI Stock Analysis",       desc: "Claude AI analyzes every stock with live data injected — grounded in real numbers, not generic advice.", delay: 0 },
            { icon: <Zap size={17}/>,         title: "Natural Language Search", desc: "Ask 'profitable tech stocks under PE 25' and get a filtered list back in seconds.", delay: 60 },
            { icon: <BarChart2 size={17}/>,   title: "Volume Profile Chart",    desc: "Real historical volume by price level — identifies support and resistance, not fake order book data.", delay: 120 },
            { icon: <TrendingUp size={17}/>,  title: "Portfolio P&L",           desc: "Track your real gains with auto-lookup of historical buy prices and AI sell signals.", delay: 0 },
            { icon: <ShieldCheck size={17}/>, title: "Custom Criteria",         desc: "Define your own buy/watch/sell rules visually. Changes apply to your screener immediately.", delay: 60 },
            { icon: <Star size={17}/>,        title: "90-Day Prediction",       desc: "Bull/base/bear price projections generated by Claude from recent momentum and fundamentals.", delay: 120 },
          ].map(({ icon, title, desc, delay }) => (
            <FadeIn key={title} direction="up" delay={delay}>
              <Tilt>
                <div className="glass-card border border-white/[0.07] rounded-2xl p-5 hover:border-green/25 transition-colors group h-full">
                  <div className="w-9 h-9 rounded-xl bg-green/10 border border-green/20 flex items-center justify-center mb-4 text-green group-hover:bg-green/15 transition-colors">
                    {icon}
                  </div>
                  <p className="font-mono text-xs tracking-[0.12em] uppercase text-white mb-2">{title}</p>
                  <p className="text-muted text-xs leading-relaxed">{desc}</p>
                </div>
              </Tilt>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="relative z-10 px-8 py-20 max-w-7xl mx-auto">
        <FadeIn direction="up">
          <div className="text-center mb-12">
            <p className="font-mono text-[11px] tracking-[0.28em] text-green uppercase mb-3">Pricing</p>
            <h2 className="font-display font-bold tracking-tight text-4xl md:text-5xl text-white">
              Simple pricing, <span className="text-gradient-signal">no surprises.</span>
            </h2>
          </div>
        </FadeIn>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <FadeIn direction="left" delay={0}>
            <div className="bg-card border border-green/20 rounded-2xl p-6 h-full">
              <p className="text-white font-bold text-lg mb-1">Free</p>
              <p className="text-3xl font-mono font-black text-white mb-1">$0<span className="text-muted text-sm font-normal">/mo</span></p>
              <p className="font-mono text-[10px] tracking-wider text-muted uppercase mb-5">200K AI tokens/mo · own key = unlimited</p>
              <div className="space-y-2 mb-6">
                {["Stock Search Engine (5,700+ US stocks)", "AI criteria builder + presets", "Portfolio tracker with P&L", "Live market data", "Volume Profile charts", "AI analysis + chat"].map(f => (
                  <div key={f} className="flex items-center gap-2 text-xs text-white/70">
                    <div className="w-4 h-4 rounded-full bg-green/15 flex items-center justify-center flex-shrink-0">
                      <CheckCircle size={9} className="text-green" />
                    </div>{f}
                  </div>
                ))}
              </div>
              <button onClick={scrollToAuth}
                className="w-full bg-green/10 hover:bg-green/20 border border-green/30 text-green rounded-xl py-2.5 text-sm font-semibold transition-colors">
                Get started free
              </button>
            </div>
          </FadeIn>
          <FadeIn direction="right" delay={100}>
            <div className="bg-card border border-border/40 rounded-2xl p-6 h-full relative overflow-hidden">
              <div className="absolute top-4 right-4 bg-purple/20 text-purple-300 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-purple/30">Coming soon</div>
              <p className="text-white font-bold text-lg mb-1">Pro</p>
              <p className="text-3xl font-mono font-black text-white mb-1">$12<span className="text-muted text-sm font-normal">/mo</span></p>
              <p className="text-muted text-xs mb-5">For serious investors</p>
              <div className="space-y-2 mb-6">
                {["Everything in Free", "Price & criteria alerts (email)", "Backtesting engine", "News & earnings injection", "Priority AI analysis"].map(f => (
                  <div key={f} className="flex items-center gap-2 text-xs text-white/50">
                    <div className="w-4 h-4 rounded-full bg-purple/15 flex items-center justify-center flex-shrink-0">
                      <ChevronRight size={9} className="text-purple-400" />
                    </div>{f}
                  </div>
                ))}
              </div>
              <button disabled className="w-full bg-white/5 text-muted rounded-xl py-2.5 text-sm font-semibold cursor-not-allowed">Notify me</button>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── CTA + AUTH — the noise returns, quietly, behind the form ── */}
      <section ref={authRef} className="relative z-10 px-8 py-20 max-w-7xl mx-auto">
        <FadeIn direction="up">
          <div className="relative overflow-hidden bg-gradient-to-br from-green/8 to-purple-500/5 border border-green/15 rounded-3xl px-8 py-14 text-center">
            <div aria-hidden className="absolute inset-0 landing-grid-texture opacity-50 pointer-events-none" />
            <div className="relative">
              <h2 className="font-display font-bold tracking-tight text-4xl md:text-5xl text-white mb-3 leading-tight">
                The market never stops talking.
                <span className="block text-gradient-signal mt-1">Hear what matters.</span>
              </h2>
              <p className="text-muted mb-10 max-w-md mx-auto text-sm">
                Free account, 200K AI tokens a month, every verdict graded in public.
              </p>
              <div className="flex justify-center">
                <AuthForm onOpenTerms={() => setTermsOpen(true)} onOpenPrivacy={() => setPrivacyOpen(true)} />
              </div>
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ── THE TAPE, again — bookend ── */}
      <TickerTape />

      {/* ── FOOTER ── */}
      <footer className="relative z-10 border-t border-border/20 px-8 py-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-green/15 flex items-center justify-center">
                <TrendingUp size={12} className="text-green" />
              </div>
              <span className="text-white font-semibold text-sm">StockWiz</span>
            </div>
            <MicroTicker />
          </div>
          <p className="text-muted text-xs">© 2026 StockWiz · Not financial, investment, or tax advice. For informational purposes only. Past performance does not guarantee future results.</p>
          <div className="flex gap-6 text-xs text-muted">
            <button onClick={() => setPrivacyOpen(true)} className="hover:text-white transition-colors">Privacy</button>
            <button onClick={() => setTermsOpen(true)} className="hover:text-white transition-colors">Terms</button>
          </div>
        </div>
      </footer>

      <TermsOfService open={termsOpen} onClose={() => setTermsOpen(false)} />
      <PrivacyPolicy open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </div>
  );
}
