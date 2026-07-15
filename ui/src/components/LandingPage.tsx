import { useState, useRef, useEffect } from "react";
import clsx from "clsx";
import {
  TrendingUp, BarChart2, Bot, Zap, ShieldCheck, ChevronRight,
  Star, ArrowRight, Eye, EyeOff, Mail, Lock, Loader2,
  AlertCircle, CheckCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useInView } from "../hooks/useInView";
import { apiFetch, useMarket } from "../hooks/useApi";
import { TermsOfService, PrivacyPolicy } from "./LegalPages";
import TickerField, { type IgnitedTicker } from "./landing/TickerField";
import VerdictCard from "./landing/VerdictCard";
import PipelineShowcase from "./landing/PipelineShowcase";
import TrackRecordLedger from "./landing/TrackRecordLedger";
import TypeWall from "./landing/TypeWall";
import WireTerrain from "./landing/WireTerrain";
import IntroLoader from "./landing/IntroLoader";
import InstrumentsRail, { INSTRUMENTS } from "./landing/InstrumentsRail";
import AppShowcase from "./landing/AppShowcase";
import { GlitchText, ScrambleLink, SmoothWheel, SpotlightCard, ScrollFillText } from "./landing/Effects";
import { DataConstellation, CursorGlow, ScrollProgress, TickerTape, AmbientWashes } from "./landing/Atmosphere";

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

// ── Fade-in wrapper — every section arrives its own way ──────────────────
// Variants beyond the basic slides: "blur" (sharpens out of a haze),
// "tilt-left"/"tilt-right" (deals in rotated like a card), "zoom" (grows
// into place), "flip" (swings in on a vertical hinge).

type FadeDir = "up" | "left" | "right" | "none" | "blur" | "tilt-left" | "tilt-right" | "zoom" | "flip";

const FADE_HIDDEN: Record<FadeDir, { transform: string; filter?: string }> = {
  up:           { transform: "translateY(28px)" },
  left:         { transform: "translateX(-28px)" },
  right:        { transform: "translateX(28px)" },
  none:         { transform: "none" },
  blur:         { transform: "scale(1.05)", filter: "blur(14px)" },
  "tilt-left":  { transform: "translateX(-44px) rotate(-4deg) scale(0.96)" },
  "tilt-right": { transform: "translateX(44px) rotate(4deg) scale(0.96)" },
  zoom:         { transform: "scale(0.86)" },
  flip:         { transform: "perspective(900px) rotateY(-14deg) translateX(-24px)" },
};

function FadeIn({ children, delay = 0, direction = "up", className = "" }: {
  children: React.ReactNode; delay?: number; direction?: FadeDir; className?: string;
}) {
  const { ref, inView } = useInView(0.1);
  const hidden = FADE_HIDDEN[direction];
  return (
    <div ref={ref} className={className} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? "none" : hidden.transform,
      filter: inView ? "none" : hidden.filter,
      transition: [
        `opacity 0.7s ease ${delay}ms`,
        `transform 0.7s cubic-bezier(0.16, 0.9, 0.24, 1) ${delay}ms`,
        hidden.filter ? `filter 0.7s ease ${delay}ms` : "",
      ].filter(Boolean).join(", "),
    }}>
      {children}
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
              mode === m ? "bg-red/15 text-red" : "text-muted hover:text-white")}>
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
        <div className="flex items-center gap-2 bg-card2 border border-border rounded-xl px-3 py-2.5 focus-within:border-purple/50 transition-colors">
          <Mail size={13} className="text-muted flex-shrink-0" />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com" autoComplete="email"
            className="flex-1 bg-transparent text-sm text-white placeholder-muted focus:outline-none" />
        </div>
        <div className="flex items-center gap-2 bg-card2 border border-border rounded-xl px-3 py-2.5 focus-within:border-purple/50 transition-colors">
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
          className="w-full bg-red/15 hover:bg-red/25 disabled:opacity-50 border border-red/40 text-red rounded-xl py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2">
          {loading
            ? <><Loader2 size={14} className="animate-spin" />{mode === "login" ? "Signing in..." : "Creating account..."}</>
            : mode === "login" ? "Sign In" : "Create Free Account"}
        </button>
      </form>
      <p className="text-center text-[11px] text-muted mt-3">
        {mode === "signup" ? "Already have an account? " : "No account yet? "}
        <button onClick={() => { setMode(mode === "signup" ? "login" : "signup"); setError(null); }}
          className="text-red hover:underline">
          {mode === "signup" ? "Sign in" : "Sign up free"}
        </button>
      </p>
      {mode === "signup" && (
        <p className="text-center text-[10px] text-muted/70 mt-2 leading-relaxed">
          By creating an account you agree to our{" "}
          <button type="button" onClick={onOpenTerms} className="text-muted hover:text-white underline">Terms</button>
          {" "}and{" "}
          <button type="button" onClick={onOpenPrivacy} className="text-muted hover:text-white underline">Privacy Policy</button>.
          Stockbrook does not provide financial advice.
        </p>
      )}
    </div>
  );
}

// ── Main landing page ─────────────────────────────────────────────────────

export default function LandingPage() {
  const authRef = useRef<HTMLDivElement>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  // The hero's canvas field hands ignited tickers to the verdict card
  const [ignited, setIgnited] = useState<IgnitedTicker | null>(null);
  // Intro curtain: hero reveals hold at frame 0 until the curtain lifts
  const [introDone, setIntroDone] = useState(false);

  function scrollToAuth() {
    authRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className={clsx("min-h-screen text-white", !introDone && "intro-hold")} style={{ background: "#06080D" }}>
      <style>{`body { overflow-x: hidden; }`}</style>

      <IntroLoader onReveal={() => setIntroDone(true)} />

      {/* Page-wide atmosphere: scroll-hue washes + the data constellation
          that runs behind every section, the cursor lens that follows the
          pointer everywhere, and the scroll progress hairline. The washes
          travel teal → violet → amber → teal as you move down the page. */}
      <AmbientWashes />
      <DataConstellation />
      <CursorGlow />
      <ScrollProgress />

      {/* ── NAV — glass bar with live market pulse ── */}
      <nav className="relative z-20 flex items-center justify-between px-6 md:px-8 py-4 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl border flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, rgba(255,61,92,0.16), rgba(124,92,255,0.16))", borderColor: "rgba(255,61,92,0.25)" }}>
            <TrendingUp size={16} className="text-red" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">Stockbrook</span>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2">
          <MicroTicker />
        </div>
        <div className="flex items-center gap-8">
          <div className="hidden md:flex items-center gap-8 text-sm text-muted font-mono">
            <ScrambleLink label="Pipeline" href="#features" className="hover:text-white transition-colors" />
            <ScrambleLink label="Track record" href="#track-record" className="hover:text-white transition-colors" />
            <ScrambleLink label="Pricing" href="#pricing" className="hover:text-white transition-colors" />
          </div>
          <Magnetic strength={0.25}>
            <button onClick={scrollToAuth}
              className="flex items-center gap-2 border rounded-xl px-4 py-2 text-sm font-semibold transition-all text-white hover:text-black"
              style={{ borderColor: "rgba(255,61,92,0.4)", background: "rgba(255,61,92,0.1)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "linear-gradient(90deg, #FF3D5C, #FF7A3D)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,61,92,0.1)"; }}>
              Get Started <ArrowRight size={14} />
            </button>
          </Magnetic>
        </div>
      </nav>

      {/* Wheel scrolling is inertial page-wide: input moves a target and
          the real scroll position eases toward it, so the page glides to a
          stop and every scroll-driven section inherits the easing. */}
      <SmoothWheel />

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
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 55% at 50% 118%, rgba(255,61,92,0.09), transparent 65%)" }} />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 45% 35% at 88% -8%, rgba(124,92,255,0.09), transparent 60%)" }} />
          <TickerField onIgnite={setIgnited} className="absolute inset-0 w-full h-full" />
        </div>

        {/* The verdict card — where an ignited ticker becomes a decision.
            Deliberately peripheral: tucked into the corner, scaled down and
            faded so it reads as ambient proof; hover brings it forward. */}
        <div
          className="hidden xl:block absolute right-4 bottom-16 z-10 anim-fade-in opacity-50 hover:opacity-100 transition-opacity duration-300"
          style={{ transform: "scale(0.72)", transformOrigin: "bottom right" }}
        >
          <VerdictCard ticker={ignited} />
        </div>

        <div className="relative flex-1 flex flex-col items-center justify-center text-center px-6 pt-14 pb-10 max-w-4xl mx-auto w-full">

          <FadeIn direction="up">
            <div className="inline-flex items-center gap-2.5 border border-white/10 bg-white/[0.03] rounded-full px-4 py-1.5 font-mono text-[11px] tracking-[0.18em] text-white/60 uppercase mb-10 backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red opacity-60" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red" />
              </span>
              Live · reading 5,700 tickers
            </div>
          </FadeIn>

          {/* Two voices: the market speaks in mono (letter-staggered in),
              the judgment lands in Space Grotesk with a drifting signal
              gradient. */}
          <h1 className="mb-8">
            <span className="block font-mono text-xl md:text-2xl tracking-[0.28em] text-red uppercase mb-5" aria-label="5,700 stocks.">
              {"5,700 stocks.".split("").map((ch, i) => (
                <span key={i} aria-hidden className="reveal-char" style={{ "--ci": i } as React.CSSProperties}>
                  {ch === " " ? "\u00A0" : ch}
                </span>
              ))}
            </span>
            <span className="block uppercase tracking-tight text-[2.75rem] sm:text-6xl md:text-8xl leading-[1.02]" aria-label="One verdict.">
              {/* The judgment rises out of a clipped slot, shearing upright.
                  Campaign-poster combo: heavy grotesque for the connective
                  word, high-contrast serif for the impact word \u2014 colors
                  unchanged, still one continuous violet->blue gradient. */}
              <span aria-hidden className="reveal-line">
                <span style={{ "--ld": "480ms" } as React.CSSProperties}>
                  <span className="font-headline-sans text-gradient-signal">One{"\u00A0"}</span>
                  <span className="font-headline-serif text-gradient-signal">verdict.</span>
                </span>
              </span>
            </span>
          </h1>

          <FadeIn direction="blur" delay={340}>
            <p className="font-display text-white/55 text-base md:text-lg leading-relaxed max-w-xl mb-10">
              Live market data, your rules, and <span className="text-purple">Claude reasoning</span> over
              every position — in plain English, as it streams.
            </p>
          </FadeIn>

          <FadeIn direction="up" delay={440}>
            <div className="flex items-center justify-center gap-5 flex-wrap">
              <Magnetic>
                <button onClick={scrollToAuth}
                  className="flex items-center gap-2 text-black rounded-xl px-7 py-3.5 text-sm font-bold transition-all hover:brightness-110"
                  style={{
                    background: "linear-gradient(90deg, #FF3D5C, #FF7A3D)",
                    boxShadow: "0 8px 32px rgba(255,61,92,0.35)",
                  }}>
                  Start for free <ArrowRight size={15} />
                </button>
              </Magnetic>
              <button onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
                className="flex items-center gap-2 font-mono text-xs tracking-wider text-muted hover:text-red uppercase transition-colors">
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

      {/* ── THE TAPE — the market runs through the page, faces attached ── */}
      <TickerTape logos />

      {/* ── THE PIPELINE — scroll-scrubbed 4-act sequence ── */}
      <section id="features" className="relative z-10">
        <PipelineShowcase />
      </section>

      {/* ── THE TERMINAL — the live demo reel IS the product shot now:
             "Where the verdicts land." pinned over the scroll-scrubbed
             recording of Dashboard → Portfolio → Market Chat ── */}
      <AppShowcase />

      {/* ── THE VERDICT WALL — giant type interlude, scroll-sheared ── */}
      <TypeWall />

      {/* ── GRADED IN PUBLIC — the fill pours in as you arrive ── */}
      <div className="relative z-10 overflow-hidden py-8 md:py-12">
        <ScrollFillText
          text="GRADED IN PUBLIC"
          className="text-center text-[9vw] leading-none tracking-tight"
        />
      </div>

      {/* ── TRACK RECORD — real public scoreboard, honest by design ── */}
      <TrackRecordLedger />

      {/* ── INSTRUMENTS ──
          Desktop: the pinned sideways rail (scroll scrubs it horizontally).
          Mobile: stacked cards dealing in from alternating angles — pinned
          horizontal scroll fights native touch scrolling, so it stays off. */}
      <div className="hidden lg:block">
        <InstrumentsRail />
      </div>
      <section className="relative z-10 px-8 py-16 max-w-7xl mx-auto lg:hidden">
        <FadeIn direction="blur">
          <div className="text-center mb-12">
            <p className="font-mono text-[11px] tracking-[0.28em] text-purple uppercase mb-3"><GlitchText text="Instruments" /></p>
            <h2 className="font-display font-bold tracking-tight text-4xl md:text-5xl text-white">
              Six instruments, <span className="text-gradient-heat">one terminal.</span>
            </h2>
          </div>
        </FadeIn>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {INSTRUMENTS.map(({ icon: Icon, title, desc }, i) => {
            const entrance: ("tilt-left" | "tilt-right")[] = ["tilt-left", "tilt-right"];
            const heat = i % 2 === 0;
            const accent = heat ? "#FF5C7A" : "#8055F5";
            const spotColor = heat ? "rgba(255,61,92,0.12)" : "rgba(124,92,255,0.14)";
            return (
              <FadeIn key={title} direction={entrance[i % 2]} delay={(i % 2) * 80}>
                <Tilt>
                  <SpotlightCard color={spotColor} className="glass-card border border-white/[0.07] rounded-2xl p-5 transition-colors group h-full">
                    <div className="w-9 h-9 rounded-xl border flex items-center justify-center mb-4 transition-colors"
                      style={{ color: accent, borderColor: `${accent}33`, background: `${accent}1A` }}>
                      <Icon size={17} />
                    </div>
                    <p className="font-mono text-xs tracking-[0.12em] uppercase text-white mb-2">{title}</p>
                    <p className="text-muted text-xs leading-relaxed">{desc}</p>
                  </SpotlightCard>
                </Tilt>
              </FadeIn>
            );
          })}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="relative z-10 px-8 py-20 max-w-7xl mx-auto">
        <FadeIn direction="blur">
          <div className="text-center mb-12">
            <p className="font-mono text-[11px] tracking-[0.28em] text-sky uppercase mb-3"><GlitchText text="Pricing" /></p>
            <h2 className="font-display font-bold tracking-tight text-4xl md:text-5xl text-white">
              Simple pricing, <span className="text-gradient-signal">no surprises.</span>
            </h2>
          </div>
        </FadeIn>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
          <FadeIn direction="flip" delay={0}>
            <div className="bg-card rounded-2xl p-6 h-full" style={{ border: "1px solid rgba(255,61,92,0.28)" }}>
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
                className="w-full text-black rounded-xl py-2.5 text-sm font-semibold transition-all hover:brightness-110"
                style={{ background: "linear-gradient(90deg, #FF3D5C, #FF7A3D)" }}>
                Get started free
              </button>
            </div>
          </FadeIn>
          <FadeIn direction="flip" delay={140}>
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
        <FadeIn direction="zoom">
          <div className="relative overflow-hidden rounded-3xl px-8 py-14 text-center"
            style={{
              background: "linear-gradient(135deg, rgba(255,61,92,0.07), rgba(10,6,10,0.4) 45%, rgba(124,92,255,0.09))",
              border: "1px solid rgba(255,61,92,0.18)",
            }}>
            <div aria-hidden className="absolute inset-0 landing-grid-texture opacity-50 pointer-events-none" />
            {/* The wire terrain bows away from the cursor behind the form */}
            <WireTerrain className="absolute inset-0" />
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

      {/* ── THE TAPE, again — but hot: the editorial red band ── */}
      <TickerTape hot />

      {/* ── FOOTER ── */}
      <footer className="relative z-10 border-t border-border/20 px-8 py-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, rgba(255,61,92,0.16), rgba(124,92,255,0.16))" }}>
                <TrendingUp size={12} className="text-red" />
              </div>
              <span className="text-white font-semibold text-sm">Stockbrook</span>
            </div>
            <MicroTicker />
          </div>
          <p className="text-muted text-xs">© 2026 Stockbrook · Not financial, investment, or tax advice. For informational purposes only. Past performance does not guarantee future results.</p>
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
